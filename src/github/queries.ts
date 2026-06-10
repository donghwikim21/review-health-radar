/**
 * GraphQL is the backbone here: a single nested query returns each PR together
 * with its reviews (author, state, submittedAt, comment counts) — collapsing what
 * would be N+1 REST calls (one per PR for reviews, one per review for comments)
 * into a handful of paginated requests. We also ask for `rateLimit { cost }` so we
 * can log how much budget each call actually consumed.
 */

export const PULL_REQUESTS_QUERY = /* GraphQL */ `
  query PullRequests($owner: String!, $name: String!, $cursor: String) {
    repository(owner: $owner, name: $name) {
      pullRequests(
        first: 50
        after: $cursor
        orderBy: { field: CREATED_AT, direction: DESC }
        states: [OPEN, CLOSED, MERGED]
      ) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          number
          createdAt
          mergedAt
          closedAt
          updatedAt
          authorAssociation
          author {
            login
          }
          reviews(first: 50) {
            totalCount
            nodes {
              state
              submittedAt
              author {
                login
              }
              comments {
                totalCount
              }
            }
          }
        }
      }
    }
    rateLimit {
      cost
      remaining
    }
  }
`;

export const COMMITS_QUERY = /* GraphQL */ `
  query Commits(
    $owner: String!
    $name: String!
    $since: GitTimestamp!
    $until: GitTimestamp!
    $cursor: String
  ) {
    repository(owner: $owner, name: $name) {
      defaultBranchRef {
        target {
          ... on Commit {
            history(since: $since, until: $until, first: 100, after: $cursor) {
              pageInfo {
                hasNextPage
                endCursor
              }
              nodes {
                oid
                committedDate
                additions
                deletions
                author {
                  user {
                    login
                  }
                  name
                }
              }
            }
          }
        }
      }
    }
    rateLimit {
      cost
      remaining
    }
  }
`;
