import { Octokit } from "octokit";
import { config } from "../config.js";
import { logger } from "../logger.js";

/**
 * Builds an Octokit configured with the throttling + retry plugins (bundled in
 * the `octokit` umbrella). These honour GitHub's primary and secondary rate
 * limits automatically and back off rather than hammering the API — exactly the
 * "reasonable use of the upstream API" the brief asks for.
 *
 * We only ever talk to api.github.com through this client; no user-supplied URL
 * is ever fetched, which closes the obvious SSRF path.
 */
export function createOctokit(): Octokit {
  return new Octokit({
    auth: config.githubToken,
    throttle: {
      onRateLimit: (
        retryAfter: number,
        options: { method?: string; url?: string },
        _octokit: unknown,
        retryCount: number,
      ) => {
        logger.warn(
          { retryAfter, method: options.method, url: options.url, retryCount },
          "GitHub primary rate limit hit",
        );
        return retryCount < 2;
      },
      onSecondaryRateLimit: (
        retryAfter: number,
        options: { method?: string; url?: string },
        _octokit: unknown,
        retryCount: number,
      ) => {
        logger.warn(
          { retryAfter, method: options.method, url: options.url, retryCount },
          "GitHub secondary rate limit hit",
        );
        return retryCount < 2;
      },
    },
  });
}

/** Process-wide singleton; the client is stateless and safe to share. */
export const octokit = createOctokit();
