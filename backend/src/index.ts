import app from "./app";
import { logger } from "./lib/logger";
import { initDb } from "./lib/db";
import { startAutoImportCron } from "./jobs/auto-import";
import { initSportsTables, initEventsTables, initSagasTable } from "./routes";

// ── Validate critical environment variables ───────────────────────────────────
// DATABASE_URL and PORT are strictly required — app can't function without them.
// JWT_SECRET gets a dev fallback if missing (auth will still work but with a
// predictable key — override in production for real security).
const HARD_REQUIRED = ["DATABASE_URL", "PORT"] as const;
const missing: string[] = [];
for (const envVar of HARD_REQUIRED) {
  if (!process.env[envVar]) {
    missing.push(envVar);
  }
}
if (missing.length > 0) {
  throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
}
if (!process.env["JWT_SECRET"]) {
  logger.warn("JWT_SECRET not set — using dev fallback. Set it in production.");
  process.env["JWT_SECRET"] = "dev-jwt-secret-do-not-use-in-production";
}

const rawPort = process.env["PORT"];
if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

initDb()
  .then(() => initSportsTables())
  .then(() => initEventsTables())
  .then(() => initSagasTable())
  .then(() => {
    app.listen(port, (err) => {
      if (err) {
        logger.error({ err }, "Error listening on port");
        process.exit(1);
      }
      logger.info({ port }, "Server listening");
      startAutoImportCron();
    });
  })
  .catch((err) => {
    logger.error({ err }, "Failed to initialize database");
    process.exit(1);
  });
