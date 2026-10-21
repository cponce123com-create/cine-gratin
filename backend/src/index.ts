import app from "./app";
import { logger } from "./lib/logger";
import { closePool, initDb } from "./lib/db";
import { getConfig } from "./lib/config";
import { startAutoImportCron } from "./jobs/auto-import";
import { reapStaleJobs, resumeQueuedJobs, startImportWorker } from "./lib/import-jobs";

// ── Configuration ─────────────────────────────────────────────────────────────
// The configuration is validated here, before anything is opened: a missing or
// insecure variable stops the process instead of failing at the first request.
const config = getConfig();

logger.info({ nodeEnv: config.nodeEnv, port: config.port }, "Starting Cine Gratin API");

let server: ReturnType<typeof app.listen> | null = null;
let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "Shutting down");

  if (server) {
    await new Promise<void>((resolve) => {
      server?.close(() => resolve());
      // Force the exit if connections keep the server open.
      setTimeout(() => resolve(), 10_000).unref();
    });
  }

  await closePool();
  logger.info("Shutdown complete");
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("unhandledRejection", (reason) => {
  logger.error({ reason }, "Unhandled promise rejection");
});
process.on("uncaughtException", (err) => {
  logger.error({ err }, "Uncaught exception");
  void shutdown("uncaughtException");
});

async function main(): Promise<void> {
  // Migrations are versioned and serialised with an advisory lock, so several
  // instances can boot at the same time without corrupting the schema.
  await initDb();

  const stale = await reapStaleJobs().catch(() => 0);
  if (stale > 0) logger.warn({ stale }, "Stale import jobs returned to the queue");

  // The worker keeps the queue moving: it reclaims the jobs whose lease
  // expired and takes the next queued one.
  startImportWorker();
  const resumed = await resumeQueuedJobs().catch(() => 0);
  if (resumed > 0) logger.info({ resumed }, "Queued import jobs resumed");

  server = app.listen(config.port, () => {
    logger.info({ port: config.port }, "Server listening");
    startAutoImportCron();
  });
}

main().catch((err) => {
  logger.error({ err }, "Failed to start the server");
  void closePool().finally(() => process.exit(1));
});
