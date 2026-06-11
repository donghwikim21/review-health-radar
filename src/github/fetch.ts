import { GraphqlResponseError } from "@octokit/graphql";
import { RequestError } from "@octokit/request-error";
import { octokit } from "./client.js";
import { COMMITS_QUERY, PULL_REQUESTS_QUERY } from "./queries.js";
import { AppError } from "../errors.js";
import { logger as rootLogger, type Log } from "../logger.js";
import type {
  Commit,
  PullRequest,
  RepoActivity,
  RepoRef,
  Review,
  ReviewState,
  Window,
} from "../domain/types.js";

/** Safety cap so a pathological repo/window can't page forever. */
const MAX_PR_PAGES = 60; // 60 * 50 = up to 3000 PRs created in-window
const MAX_COMMIT_PAGES = 50; // 50 * 100 = up to 5000 commits in-window

// --- Wire types (the slice of the GraphQL response we depend on) ------------

interface RateLimit {
  cost: number;
  remaining: number;
}

interface ReviewNode {
  state: ReviewState;
  submittedAt: string | null;
  author: { login: string } | null;
  comments: { totalCount: number };
}

interface PrNode {
  __typename: string;
  number?: number;
  createdAt?: string;
  mergedAt?: string | null;
  closedAt?: string | null;
  authorAssociation?: string;
  author?: { login: string } | null;
  reviews?: { totalCount: number; nodes: ReviewNode[] };
}

interface PrPageResponse {
  search: {
    issueCount: number;
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    nodes: PrNode[];
  } | null;
  rateLimit: RateLimit;
}

interface CommitNode {
  oid: string;
  committedDate: string;
  additions: number;
  deletions: number;
  author: { user: { login: string } | null; name: string | null } | null;
}

interface CommitPageResponse {
  repository: {
    defaultBranchRef: {
      target: {
        history?: {
          pageInfo: { hasNextPage: boolean; endCursor: string | null };
          nodes: CommitNode[];
        };
      } | null;
    } | null;
  } | null;
  rateLimit: RateLimit;
}

// --- Normalisation ----------------------------------------------------------

function normalizeReview(node: ReviewNode): Review {
  return {
    author: node.author?.login ?? null,
    state: node.state,
    submittedAt: node.submittedAt,
    commentCount: node.comments.totalCount,
  };
}

function normalizePr(node: PrNode): PullRequest {
  return {
    number: node.number ?? 0,
    author: node.author?.login ?? null,
    authorAssociation: node.authorAssociation ?? "NONE",
    createdAt: node.createdAt!,
    mergedAt: node.mergedAt ?? null,
    closedAt: node.closedAt ?? null,
    reviews: node.reviews?.nodes.map(normalizeReview) ?? [],
    reviewTotalCount: node.reviews?.totalCount ?? 0,
  };
}

function normalizeCommit(node: CommitNode): Commit {
  return {
    oid: node.oid,
    author: node.author?.user?.login ?? node.author?.name ?? null,
    committedDate: node.committedDate,
    additions: node.additions,
    deletions: node.deletions,
  };
}

// --- Error mapping ----------------------------------------------------------

function mapGithubError(error: unknown): AppError {
  if (error instanceof GraphqlResponseError) {
    const types = (error.errors ?? []).map((e) => e.type);
    if (types.includes("NOT_FOUND")) {
      return new AppError("NOT_FOUND", "Repository not found or not accessible with the provided token.", { cause: error });
    }
    if (types.includes("RATE_LIMITED")) {
      return new AppError("UPSTREAM_RATE_LIMITED", "GitHub API rate limit exceeded.", { retryAfterSeconds: 60, cause: error });
    }
    return new AppError("UPSTREAM_UNAVAILABLE", "GitHub GraphQL request failed.", { cause: error });
  }
  if (error instanceof RequestError) {
    if (error.status === 401) {
      return new AppError("UPSTREAM_UNAVAILABLE", "GitHub rejected the token (401). Check GITHUB_TOKEN.", { cause: error });
    }
    if (error.status === 404) {
      return new AppError("NOT_FOUND", "Repository not found.", { cause: error });
    }
    if (error.status === 403 || error.status === 429) {
      const retry = Number(error.response?.headers?.["retry-after"]) || 60;
      return new AppError("UPSTREAM_RATE_LIMITED", "GitHub API rate limit exceeded.", { retryAfterSeconds: retry, cause: error });
    }
  }
  return new AppError("UPSTREAM_UNAVAILABLE", "Unexpected error talking to GitHub.", { cause: error });
}

// --- Public API -------------------------------------------------------------

/**
 * Fetches the population of pull requests **created** within the window (a clean,
 * doubly-bounded cohort that paginates efficiently) plus default-branch commits
 * in the same window. Returns a normalised, cache-ready snapshot.
 */
export async function fetchRepoActivity(
  repo: RepoRef,
  window: Window,
  log: Log = rootLogger,
): Promise<RepoActivity> {
  // PRs and commits are independent queries — fetch them concurrently.
  const [pullRequests, commits] = await Promise.all([
    fetchPullRequests(repo, window, log),
    fetchCommits(repo, window, log),
  ]);
  return {
    repo,
    window,
    pullRequests,
    commits,
    fetchedAt: new Date().toISOString(),
  };
}

async function fetchPullRequests(repo: RepoRef, window: Window, log: Log): Promise<PullRequest[]> {
  const sinceMs = Date.parse(window.since);
  const untilMs = Date.parse(window.until);
  // Server-side narrow to the window via Search; the date range is day-granular
  // and inclusive, so we still apply exact [since, until) bounds client-side.
  const sinceDay = window.since.slice(0, 10);
  const untilDay = window.until.slice(0, 10);
  const q = `repo:${repo.owner}/${repo.name} is:pr created:${sinceDay}..${untilDay}`;

  const collected: PullRequest[] = [];
  let cursor: string | null = null;
  let totalCost = 0;

  for (let page = 0; page < MAX_PR_PAGES; page++) {
    let response: PrPageResponse;
    try {
      response = await octokit.graphql<PrPageResponse>(PULL_REQUESTS_QUERY, { q, cursor });
    } catch (error) {
      throw mapGithubError(error);
    }

    totalCost += response.rateLimit?.cost ?? 0;
    const search = response.search;
    if (!search) break;

    for (const node of search.nodes) {
      if (!node.createdAt) continue; // non-PR node (defensive)
      const createdMs = Date.parse(node.createdAt);
      if (createdMs < sinceMs || createdMs >= untilMs) continue; // exact half-open bounds
      collected.push(normalizePr(node));
    }

    if (!search.pageInfo.hasNextPage) break;
    cursor = search.pageInfo.endCursor;

    if (page === MAX_PR_PAGES - 1) {
      log.warn({ repo, window, fetched: collected.length }, "Hit MAX_PR_PAGES cap; PR result may be truncated");
    }
  }

  log.info({ repo, window, pullRequests: collected.length, graphqlCost: totalCost }, "Fetched pull requests");
  return collected;
}

async function fetchCommits(repo: RepoRef, window: Window, log: Log): Promise<Commit[]> {
  const collected: Commit[] = [];
  let cursor: string | null = null;
  let totalCost = 0;

  for (let page = 0; page < MAX_COMMIT_PAGES; page++) {
    let response: CommitPageResponse;
    try {
      response = await octokit.graphql<CommitPageResponse>(COMMITS_QUERY, {
        owner: repo.owner,
        name: repo.name,
        since: window.since,
        until: window.until,
        cursor,
      });
    } catch (error) {
      throw mapGithubError(error);
    }

    totalCost += response.rateLimit?.cost ?? 0;
    const history = response.repository?.defaultBranchRef?.target?.history;
    if (!history) break; // empty repo / no default branch — treat as zero commits

    for (const node of history.nodes) collected.push(normalizeCommit(node));
    if (!history.pageInfo.hasNextPage) break;
    cursor = history.pageInfo.endCursor;
  }

  log.info({ repo, window, commits: collected.length, graphqlCost: totalCost }, "Fetched commits");
  return collected;
}
