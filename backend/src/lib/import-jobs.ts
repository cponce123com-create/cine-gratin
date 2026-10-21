/**
 * Persistent import jobs.
 *
 * A long import must not depend on the browser staying open, so every import
 * is persisted in `import_jobs` and processed by the API process itself.
 * The admin UI polls the job status and shows live progress.
 *
 * Guarantees:
 *  - bounded concurrency (the TMDB quota is respected);
 *  - a job is claimed atomically: two instances never process the same job;
 *  - a job that cannot start (another import is running) stays `queued`
 *    instead of failing, and is picked up later;
 *  - a lease prevents a job whose process died from being stuck forever:
 *    expired leases are returned to the queue;
 *  - a job can be cancelled safely: the items in flight finish, the ones not
 *    started are reported as pending, never as errors;
 *  - re-importing an item never duplicates it nor erases manual edits.
 */
import { randomUUID } from "node:crypto";
import { pool } from "./db";
import { logger } from "./logger";
import { getConfig } from "./config";
import { mapWithConcurrency, wasSkipped } from "./concurrency";
import {
  importMovieByTmdbId,
  importSeriesByTmdbId,
  normalizeImdbId,
  normalizeTmdbId,
  resolveItem,
  type ImportOutcome,
  type ResolvedItem,
} from "./catalog-import";
import { tmdbFetch } from "./tmdb-client";
import { badRequest } from "./errors";

export type ImportJobStatus = "queued" | "running" | "completed" | "partial" | "failed" | "cancelled";

export type ImportItemStatus = "imported" | "existed" | "not_found" | "skipped" | "error";

export interface ImportJobItem {
  input: string;
  title: string | null;
  year: number | null;
  status: ImportItemStatus;
  error?: string;
}

export interface ImportJob {
  id: string;
  type: "movie" | "series";
  source: string;
  status: ImportJobStatus;
  total: number;
  processed: number;
  imported: number;
  skipped: number;
  failed: number;
  /** Items that were not started (cancelled job). */
  pending: number;
  attempts: number;
  payload: { items: string[]; retriedFrom?: string };
  result: ImportJobItem[];
  error: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  lease_expires_at: string | null;
}

/**
 * Advisory lock that serialises the mass imports.
 * It is acquired for the duration of a job and always released.
 */
const IMPORT_LOCK_KEY = 918_273_647;
/** Maximum number of times a job is requeued after an expired lease. */
const MAX_ATTEMPTS = 3;
/** Minimum interval between two progress updates. */
const PROGRESS_THROTTLE_MS = 400;

const runningJobs = new Set<string>();

export interface CreateJobInput {
  type: "movie" | "series";
  source: string;
  items: string[];
  /** Internal callers may raise the limit for a bounded TMDB discover job. */
  maxItems?: number;
}

/** Validates and normalises the list of identifiers of a job. */
export function normalizeJobItems(items: unknown): { valid: string[]; invalid: string[] } {
  if (!Array.isArray(items)) return { valid: [], invalid: [] };

  const valid: string[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();

  for (const raw of items) {
    if (typeof raw !== "string") {
      invalid.push(String(raw));
      continue;
    }
    const value = raw.trim();
    if (!value) continue;
    const imdbId = normalizeImdbId(value);
    const tmdbId = normalizeTmdbId(value);
    const normalized = imdbId ?? (tmdbId ? String(tmdbId) : null);
    if (!normalized) {
      invalid.push(value);
      continue;
    }
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    valid.push(normalized);
  }

  return { valid, invalid };
}

/**
 * Creates a job row and schedules its processing.
 * The number of items is validated against the configured limit: the request
 * is rejected instead of being silently truncated.
 */
export async function createImportJob(input: CreateJobInput): Promise<ImportJob> {
  const config = getConfig();

  const limit =
    input.maxItems === undefined
      ? config.importBatchLimit
      : Math.min(10_000, Math.max(config.importBatchLimit, input.maxItems));
  if (input.items.length > limit) {
    throw badRequest(`La importación supera el límite configurado (${limit} elementos por trabajo)`, {
      limit,
      received: input.items.length,
    });
  }

  const id = randomUUID();
  await pool.query(
    `INSERT INTO import_jobs (id, type, source, status, total, payload)
     VALUES ($1, $2, $3, 'queued', $4, $5::jsonb)`,
    [id, input.type, input.source, input.items.length, JSON.stringify({ items: input.items })],
  );

  const job = await getImportJob(id);
  if (!job) throw new Error("No se pudo crear el trabajo de importación");

  // Processing happens in the background: the HTTP request returns immediately
  // and the admin UI polls /api/admin/import-jobs/:id for progress.
  void scheduleJob(id);

  return job;
}

/**
 * Claims and processes the oldest queued job.
 * Returns true when a job was processed.
 */
export async function processNextQueuedJob(): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT id FROM import_jobs WHERE status = 'queued' ORDER BY created_at ASC LIMIT 1`,
  );
  if (rows.length === 0) return false;

  const id = (rows[0] as { id: string }).id;
  await processImportJob(id);
  return true;
}

/**
 * Worker loop: keeps the queue moving.
 *
 * It reclaims the jobs whose lease expired (the process died) and takes the
 * next queued job. The loop is idempotent: several instances may run it, the
 * atomic claim guarantees that a job is processed only once.
 */
export function startImportWorker(intervalMs = 5000): NodeJS.Timeout {
  const timer = setInterval(() => {
    void (async () => {
      try {
        await reapStaleJobs();
        if (runningJobs.size > 0) return;
        await processNextQueuedJob();
      } catch (err) {
        logger.error({ err }, "Import worker error");
      }
    })();
  }, intervalMs);

  timer.unref?.();
  return timer;
}

/** Starts the processing of a job in the background. */
function scheduleJob(id: string): void {
  setTimeout(() => {
    void processImportJob(id).catch((err) => {
      logger.error({ err, jobId: id }, "Import job failed");
    });
  }, 0);
}

/** Loads a job by id. */
export async function getImportJob(id: string): Promise<ImportJob | null> {
  const { rows } = await pool.query("SELECT * FROM import_jobs WHERE id = $1", [id]);
  if (!rows[0]) return null;
  return mapJobRow(rows[0]);
}

/** Lists the most recent jobs. */
export async function listImportJobs(limit = 20): Promise<ImportJob[]> {
  const { rows } = await pool.query("SELECT * FROM import_jobs ORDER BY created_at DESC LIMIT $1", [
    Math.min(Math.max(limit, 1), 100),
  ]);
  return rows.map((row) => mapJobRow(row));
}

/**
 * Marks a job as cancelled. The processor stops starting new items, lets the
 * ones in flight finish and records how many stayed pending.
 */
export async function cancelImportJob(id: string): Promise<ImportJob | null> {
  const job = await getImportJob(id);
  if (!job) return null;
  if (["completed", "failed", "cancelled"].includes(job.status)) return job;

  await pool.query(
    `UPDATE import_jobs
        SET status = 'cancelled',
            pending = CASE WHEN status = 'queued' THEN total ELSE pending END,
            finished_at = NOW()
      WHERE id = $1 AND status IN ('queued','running')`,
    [id],
  );
  return getImportJob(id);
}

/**
 * Recovers the jobs that were interrupted.
 *
 * A job whose lease expired (the process died) goes back to the queue until
 * it exhausts its attempts; the jobs that were queued when the application
 * stopped are resumed.
 */
export async function reapStaleJobs(): Promise<number> {
  const { rowCount } = await pool.query(
    `UPDATE import_jobs
        SET status = CASE WHEN attempts >= $1 THEN 'failed' ELSE 'queued' END,
            error = CASE WHEN attempts >= $1 THEN 'El proceso se reinició durante la importación'
                         ELSE error END,
            lease_expires_at = NULL,
            finished_at = CASE WHEN attempts >= $1 THEN NOW() ELSE NULL END
      WHERE status = 'running'
        AND lease_expires_at IS NOT NULL
        AND lease_expires_at < NOW()`,
    [MAX_ATTEMPTS],
  );
  return rowCount ?? 0;
}

/** Resumes the jobs that were waiting in the queue when the process stopped. */
export async function resumeQueuedJobs(): Promise<number> {
  const { rows } = await pool.query(
    `SELECT id FROM import_jobs WHERE status = 'queued' ORDER BY created_at ASC LIMIT 5`,
  );
  for (const row of rows) {
    scheduleJob((row as { id: string }).id);
  }
  return rows.length;
}

function mapJobRow(row: Record<string, unknown>): ImportJob {
  const payload = (row.payload ?? {}) as { items?: string[]; retriedFrom?: string };
  const result = (row.result ?? []) as ImportJobItem[];
  return {
    id: String(row.id),
    type: row.type as "movie" | "series",
    source: String(row.source),
    status: row.status as ImportJobStatus,
    total: Number(row.total ?? 0),
    processed: Number(row.processed ?? 0),
    imported: Number(row.imported ?? 0),
    skipped: Number(row.skipped ?? 0),
    failed: Number(row.failed ?? 0),
    pending: Number(row.pending ?? 0),
    attempts: Number(row.attempts ?? 0),
    payload: { items: payload.items ?? [], retriedFrom: payload.retriedFrom },
    result,
    error: (row.error as string | null) ?? null,
    created_at: String(row.created_at),
    started_at: (row.started_at as string | null) ?? null,
    finished_at: (row.finished_at as string | null) ?? null,
    lease_expires_at: (row.lease_expires_at as string | null) ?? null,
  };
}

/** Resolves the TMDB id of an item, when the input is an IMDb id. */
async function toTmdbId(input: string, type: "movie" | "series"): Promise<number | null> {
  const direct = normalizeTmdbId(input);
  if (direct) return direct;

  const imdbId = normalizeImdbId(input);
  if (!imdbId) return null;

  const res = await tmdbFetch(`/find/${imdbId}?external_source=imdb_id`);

  if (!res.ok) {
    // 404 means the identifier does not exist; anything else (rate limit,
    // server error) is temporary and must be retried.
    if (res.status === 404) return null;
    const error = new Error(`El proveedor de TMDB respondió ${res.status}`) as Error & {
      status?: number;
    };
    error.status = res.status;
    throw error;
  }

  const data = (await res.json()) as {
    movie_results?: Array<{ id: number }>;
    tv_results?: Array<{ id: number }>;
  };
  const results = type === "movie" ? data.movie_results : data.tv_results;
  return results?.[0]?.id ?? null;
}

/** True when the error is worth retrying (temporary failure of the provider). */
function isTransientError(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const error = err as { status?: number; code?: string; name?: string; message?: string };
  if (error.status === 429 || error.status === 500 || error.status === 502 || error.status === 503) {
    return true;
  }
  if (error.code === "ECONNRESET" || error.code === "ETIMEDOUT" || error.code === "ECONNREFUSED") {
    return true;
  }
  if (error.name === "TimeoutError" || error.name === "AbortError") return true;
  return /timeout|timed out|network|socket hang up/i.test(error.message ?? "");
}

/** Waits with an exponential backoff and jitter. */
function backoffDelay(attempt: number): number {
  const base = Math.min(400 * 2 ** attempt, 8000);
  return base + Math.floor(Math.random() * 250);
}

/**
 * Imports a single item, retrying only the temporary failures of the provider.
 * Invalid identifiers are never retried.
 */
async function importItemWithRetry(
  input: string,
  type: "movie" | "series",
  maxRetries: number,
): Promise<ImportJobItem> {
  let lastError = "No se pudo importar el contenido";

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const tmdbId = await toTmdbId(input, type);
      if (!tmdbId) {
        return { input, title: null, year: null, status: "not_found" };
      }

      const outcome: ImportOutcome =
        type === "movie" ? await importMovieByTmdbId(tmdbId) : await importSeriesByTmdbId(tmdbId);

      return {
        input,
        title: outcome.title,
        year: outcome.year,
        status: outcome.status,
        ...(outcome.error ? { error: outcome.error } : {}),
      };
    } catch (err) {
      lastError = err instanceof Error ? err.message : "Error inesperado";
      if (!isTransientError(err) || attempt === maxRetries) break;
      await new Promise((resolve) => setTimeout(resolve, backoffDelay(attempt)));
    }
  }

  return { input, title: null, year: null, status: "error", error: lastError };
}

/**
 * Processes a job.
 *
 * The job is claimed atomically (only one instance can take it) and the
 * process holds a lease that is renewed while it runs.
 */
export async function processImportJob(id: string): Promise<ImportJob | null> {
  if (runningJobs.has(id)) return getImportJob(id);
  runningJobs.add(id);

  const config = getConfig();
  let lockClient: import("pg").PoolClient | null = null;
  let lockHeld = false;

  try {
    // Atomic claim: only the instance that updates the row takes the job.
    const claimed = await pool.query(
      `UPDATE import_jobs
          SET status = 'running',
              started_at = COALESCE(started_at, NOW()),
              attempts = attempts + 1,
              lease_expires_at = NOW() + ($2 || ' seconds')::interval,
              updated_at = NOW()
        WHERE id = $1 AND status = 'queued'
      RETURNING *`,
      [id, String(config.importJobLeaseSeconds)],
    );

    if (claimed.rowCount === 0) {
      // Another instance took it, or it is not queued any more.
      return getImportJob(id);
    }

    // Only one mass import runs at a time: the others stay in the queue.
    lockClient = await pool.connect();
    const lock = await lockClient.query("SELECT pg_try_advisory_lock($1) AS locked", [IMPORT_LOCK_KEY]);
    lockHeld = Boolean((lock.rows[0] as { locked: boolean }).locked);
    if (!lockHeld) {
      logger.info({ jobId: id }, "Another import is running: the job goes back to the queue");
      await pool.query(
        `UPDATE import_jobs
            SET status = 'queued', lease_expires_at = NULL, updated_at = NOW()
          WHERE id = $1`,
        [id],
      );
      return getImportJob(id);
    }

    const job = await getImportJob(id);
    if (!job) return null;

    const items = job.payload.items ?? [];
    const results: ImportJobItem[] = [];
    let imported = 0;
    let skipped = 0;
    let failed = 0;
    let processed = 0;
    let lastProgressAt = 0;
    let cancelled = false;

    // La bandera se refresca al ritmo del progreso: comprobar la base de
    // datos en cada elemento seria demasiado caro.
    const isCancelled = async (): Promise<boolean> => {
      const { rows } = await pool.query("SELECT status FROM import_jobs WHERE id = $1", [id]);
      return rows[0]?.status === "cancelled";
    };

    // Import large catalog jobs in predictable groups of 50. This bounds the
    // amount of in-flight work and lets cancellation take effect between
    // groups while retaining the configured per-item concurrency.
    const JOB_CHUNK_SIZE = 50;
    for (let start = 0; start < items.length; start += JOB_CHUNK_SIZE) {
      if (!cancelled) cancelled = await isCancelled();
      if (cancelled) break;
      const chunk = items.slice(start, start + JOB_CHUNK_SIZE);
      const outcomes = await mapWithConcurrency(
        chunk,
        async (input) => importItemWithRetry(input, job.type, config.importMaxRetries),
        {
          concurrency: config.importConcurrency,
          shouldStop: () => cancelled,
          onProgress: async (completed) => {
            processed = start + completed;
            if (!cancelled) cancelled = await isCancelled();
            const now = Date.now();
            const isChunkComplete = completed === chunk.length;
            if (now - lastProgressAt < PROGRESS_THROTTLE_MS && !isChunkComplete && processed !== items.length)
              return;
            lastProgressAt = now;

            // The lease is renewed with the progress, so a slow import is not
            // considered abandoned.
            await pool.query(
              `UPDATE import_jobs
                  SET processed = $2,
                      lease_expires_at = NOW() + ($3 || ' seconds')::interval,
                      updated_at = NOW()
                WHERE id = $1`,
              [id, processed, String(config.importJobLeaseSeconds)],
            );
          },
        },
      );

      for (let index = 0; index < outcomes.length; index++) {
        const outcome = outcomes[index]!;
        if (wasSkipped(outcome)) {
          // Not started: it is pending, not an error.
          continue;
        }
        if (outcome.status === "fulfilled") {
          const item = outcome.value;
          results.push(item);
          if (item.status === "imported") imported += 1;
          else if (item.status === "error") failed += 1;
          else skipped += 1;
        } else {
          failed += 1;
          results.push({
            input: chunk[index] ?? "desconocido",
            title: null,
            year: null,
            status: "error",
            error: "Error inesperado durante la importación",
          });
        }
      }
    }

    const pending = items.length - results.length;
    const cancelledNow = cancelled || (await isCancelled());

    const finalStatus: ImportJobStatus = cancelledNow ? "cancelled" : failed > 0 ? "partial" : "completed";

    await pool.query(
      `UPDATE import_jobs
          SET status = $2,
              processed = $3,
              imported = $4,
              skipped = $5,
              failed = $6,
              pending = $7,
              result = $8::jsonb,
              lease_expires_at = NULL,
              finished_at = NOW(),
              updated_at = NOW()
        WHERE id = $1`,
      [id, finalStatus, results.length, imported, skipped, failed, pending, JSON.stringify(results)],
    );

    logger.info(
      { jobId: id, imported, skipped, failed, pending, status: finalStatus },
      "Import job finished",
    );
    return getImportJob(id);
  } catch (err) {
    logger.error({ err, jobId: id }, "Import job crashed");
    await pool
      .query(
        `UPDATE import_jobs
            SET status = 'failed', error = $2, finished_at = NOW(), lease_expires_at = NULL, updated_at = NOW()
          WHERE id = $1 AND status = 'running'`,
        [id, "Error interno durante la importación"],
      )
      .catch(() => undefined);
    return getImportJob(id);
  } finally {
    if (lockClient) {
      if (lockHeld) {
        await lockClient.query("SELECT pg_advisory_unlock($1)", [IMPORT_LOCK_KEY]).catch(() => undefined);
      }
      lockClient.release();
    }
    runningJobs.delete(id);
  }
}

/**
 * Resolves the requested identifiers without writing anything.
 * Used by the import preview so the admin can pick what to import.
 */
export async function previewItems(items: string[], type: "movie" | "series"): Promise<ResolvedItem[]> {
  const results = await mapWithConcurrency(items, (input) => resolveItem(input, type), {
    concurrency: getConfig().importConcurrency,
  });

  return results.map((result, index) =>
    result.status === "fulfilled"
      ? result.value
      : {
          input: items[index] ?? "",
          type,
          title: null,
          year: null,
          posterUrl: null,
          imdbId: null,
          tmdbId: null,
          status: "not_found" as const,
        },
  );
}
