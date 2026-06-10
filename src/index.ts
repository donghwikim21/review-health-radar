import { config } from "./config.js";
import { logger } from "./logger.js";
import { buildServer } from "./api/server.js";

async function main(): Promise<void> {
  const app = await buildServer();
  await app.listen({ port: config.port, host: "0.0.0.0" });
}

main().catch((error) => {
  logger.fatal({ err: error }, "Failed to start server");
  process.exit(1);
});
