/**
 * PostgreSQL access layer.
 *
 * - A single pooled client set shared by the whole process, sized for the
 *   real capacity of the hosting plan instead of an arbitrary default.
 * - Schema management goes through the versioned migration runner, which is
 *   serialised with a PostgreSQL advisory lock so concurrent instances cannot
 *   apply the same migration twice.
 * - The pool is closed gracefully on shutdown so in-flight requests are not
 *   cut off and the database does not keep the connection open.
 */
import { Pool, type PoolClient } from "pg";
import { getConfig } from "./config";
import { logger } from "./logger";
import { MIGRATIONS, SEED_CURATED_SAGAS } from "./migrations";

/** Arbitrary but stable key for the migration advisory lock. */
const MIGRATION_LOCK_KEY = 918_273_645;

function buildPool(): Pool {
  const config = getConfig();
  const max = Number(process.env["DB_POOL_MAX"] ?? 10);
  const min = Number(process.env["DB_POOL_MIN"] ?? 0);

  return new Pool({
    connectionString: config.databaseUrl,
    max: Number.isFinite(max) && max > 0 ? Math.min(max, 50) : 10,
    min: Number.isFinite(min) && min >= 0 ? Math.min(min, 10) : 0,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    statement_timeout: 30_000,
    application_name: "cine-gratin-api",
  });
}

export const pool: Pool = buildPool();

pool.on("error", (err) => {
  logger.error({ err }, "Unexpected error on idle client");
});

/**
 * Applies every pending migration.
 * Returns the number of migrations applied during this call.
 */
export async function runMigrations(): Promise<number> {
  let client: PoolClient | null = null;
  let applied = 0;

  try {
    client = await pool.connect();
    await client.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK_KEY]);

    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const { rows } = await client.query("SELECT version FROM schema_migrations");
    const appliedVersions = new Set(rows.map((row) => Number((row as { version: number }).version)));

    for (const migration of MIGRATIONS) {
      if (appliedVersions.has(migration.version)) continue;

      try {
        await client.query("BEGIN");
        await client.query(migration.sql);
        await client.query("INSERT INTO schema_migrations (version, name) VALUES ($1, $2)", [
          migration.version,
          migration.name,
        ]);
        await client.query("COMMIT");
        applied += 1;
        logger.info({ version: migration.version, name: migration.name }, "Migration applied");
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        if (migration.optional) {
          logger.warn(
            { err, version: migration.version, name: migration.name },
            "Optional migration skipped",
          );
          continue;
        }
        throw err;
      }
    }
  } finally {
    if (client) {
      await client.query("SELECT pg_advisory_unlock($1)", [MIGRATION_LOCK_KEY]).catch(() => {});
      client.release();
    }
  }

  return applied;
}

/** Inserts the curated saga collections when they are not present yet. */
export async function seedCuratedSagas(): Promise<void> {
  try {
    for (const collectionId of SEED_CURATED_SAGAS) {
      await pool.query(
        `INSERT INTO cv_sagas (collection_id, name, is_curated)
         VALUES ($1, $2, TRUE)
         ON CONFLICT (collection_id) DO NOTHING`,
        [collectionId, `Collection ${collectionId}`],
      );
    }
  } catch (err) {
    logger.warn({ err }, "Could not seed curated sagas");
  }
}

/**
 * Boots the database: runs migrations and seeds reference data.
 * Kept as the public entry point used by `index.ts`.
 */
export async function initDb(): Promise<void> {
  const applied = await runMigrations();
  if (applied > 0) {
    logger.info({ applied }, "Database schema up to date");
  }
  await seedCuratedSagas();
}

/** Closes the pool. Safe to call more than once. */
export async function closePool(): Promise<void> {
  await pool.end().catch((err) => logger.warn({ err }, "Error closing the database pool"));
}
