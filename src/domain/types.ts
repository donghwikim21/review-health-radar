/**
 * Core domain model. These are the *normalised* shapes the rest of the service
 * works with — deliberately decoupled from the GitHub API wire format so that a
 * second provider (GitLab, etc.) could populate the same types.
 */

export type ReviewState =
  | "APPROVED"
  | "CHANGES_REQUESTED"
  | "COMMENTED"
  | "DISMISSED"
  | "PENDING";

/** A single review left on a pull request. */
export interface Review {
  author: string | null;
  state: ReviewState;
  submittedAt: string | null;
  /** Number of inline review comments attached to this review. */
  commentCount: number;
}

export interface PullRequest {
  number: number;
  author: string | null;
  authorAssociation: string;
  createdAt: string;
  mergedAt: string | null;
  closedAt: string | null;
  reviews: Review[];
  /** Total reviews reported by the API (may exceed reviews.length if truncated). */
  reviewTotalCount: number;
}

export interface Commit {
  oid: string;
  author: string | null;
  committedDate: string;
  additions: number;
  deletions: number;
}

export interface RepoRef {
  owner: string;
  name: string;
}

/** Half-open interval [since, until) of ISO-8601 instants. */
export interface Window {
  since: string;
  until: string;
}

/** Everything we fetch upstream for one (repo, window), cached as a unit. */
export interface RepoActivity {
  repo: RepoRef;
  window: Window;
  pullRequests: PullRequest[];
  commits: Commit[];
  /** When this snapshot was fetched from upstream (ISO-8601). */
  fetchedAt: string;
}
