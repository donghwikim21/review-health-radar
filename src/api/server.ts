import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import { config } from "../config.js";
import { AppError, httpStatusFor } from "../errors.js";
import { registerRoutes } from "./routes.js";

export async function buildServer(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: config.logLevel,
      // Defence in depth: even though we never log tokens explicitly, redact any
      // path that could carry one if a future change starts logging requests.
      redact: {
        paths: ["req.headers.authorization", "req.headers.cookie", "*.token", "*.authorization"],
        censor: "[redacted]",
      },
    },
    // Generate a request id per request for traceable logs.
    genReqId: () => randomUUID(),
  });

  await app.register(cors, { origin: true });

  // Serve the built SPA when present, so `docker compose up` exposes UI + API on
  // one URL. In local dev the frontend runs separately on Vite (:5173) instead.
  const webDist = join(process.cwd(), "web", "dist");
  if (existsSync(join(webDist, "index.html"))) {
    await app.register(fastifyStatic, { root: webDist });
    app.log.info({ webDist }, "Serving built frontend");
  }

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      const status = httpStatusFor(error);
      // Client errors are expected noise; server/upstream errors deserve a stack.
      if (status >= 500) request.log.error({ err: error, code: error.code }, error.message);
      else request.log.info({ code: error.code }, error.message);
      if (error.retryAfterSeconds !== undefined) {
        reply.header("Retry-After", String(error.retryAfterSeconds));
      }
      return reply.status(status).send({ error: { code: error.code, message: error.message } });
    }

    // Fastify's own validation errors → 400.
    const err = error as Error & { validation?: unknown };
    if (err.validation) {
      return reply.status(400).send({ error: { code: "BAD_REQUEST", message: err.message } });
    }

    request.log.error({ err: error }, "Unhandled error");
    return reply.status(500).send({ error: { code: "INTERNAL", message: "Internal server error" } });
  });

  app.setNotFoundHandler((request, reply) => {
    reply.status(404).send({ error: { code: "NOT_FOUND", message: `No route for ${request.method} ${request.url}` } });
  });

  await registerRoutes(app);
  return app;
}
