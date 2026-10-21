/**
 * Persistent import jobs.
 *
 * A long import must not depend on the browser staying open, so every import
 * is persisted in `import_jobs` and processed by the API process itself.
 * The admin UI polls the job status and shows live progress.
 *
 * Guarantees:
 *  - bounded concurrency (the TMDB quota is respected);
 *  - a job can be cancelled safely;
 *  - progress and the per-item result survive a page reload;
 *  - only one mass import runs at a time (advisory lock);
 *  - re-importing an item never duplicates it nor erases manual edits.
 */
import { randomUUID } from "node:crypto";
import { pool } from "./db";
import { logger } from "./logger";
import { getConfig } from "./config";
import { mapWithConcurrency } from "./concurrency";
import {
  importMovieByTmdbId,
  importSeriesByTmdbId,
  normalizeImdbId,
  normalizeTmdbId,
  resolveItem,
  type ImportOutcome,
  type ResolvedItem,
} from "./catalog-import";

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
  payload: { items: string[]; retriedFrom?: string };
  result: ImportJobItem[];
  error: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

/** Advisory lock ensuring a single mass import at a time. */
const IMPORT_LOCK_KEY = 918_273_647;
/** Jobs that were running when the process died are considered stale. */
const STALE_JOB_MINUTES = 60;

const runningJobs = new Map<string, boolean>();

export interface CreateJobInput {
  type: "movie" | "series";
  source: string;
  items: string[];
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

/** Creates a job row and schedules its processing. */
export async function createImportJob(input: CreateJobInput): Promise<ImportJob> {
  const config = getConfig();
  const limit = config.importBatchLimit;
  const items = input.items.slice(0, limit);

  const id = randomUUID();
  await pool.query(
    `INSERT INTO import_jobs (id, type, source, status, total, payload)
     VALUES ($1, $2, $3, 'queued', $4, $5::jsonb)`,
    [id, input.type, input.source, items.length, JSON.stringify({ items })],
  );

  const job = await getImportJob(id);
  if (!job) throw new Error("No se pudo crear el trabajo de importación");

  // Processing happens in the background: the HTTP request returns immediately
  // and the admin UI polls /api/admin/import-jobs/:id for progress.
  void processImportJob(id).catch((err) => {
    logger.error({ err, jobId: id }, "Import job failed");
  });

  return job;
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

/** Marks a job as cancelled. Running jobs stop at the next item boundary. */
export async function cancelImportJob(id: string): Promise<ImportJob | null> {
  const job = await getImportJob(id);
  if (!job) return null;
  if (job.status === "completed" || job.status === "failed" || job.status === "cancelled") {
    return job;
  }
  await pool.query(
    `UPDATE import_jobs SET status = 'cancelled', finished_at = NOW() WHERE id = $1 AND status IN ('queued','running')`,
    [id],
  );
  return getImportJob(id);
}

/** Marks jobs that were interrupted by a restart as failed. */
export async function reapStaleJobs(): Promise<number> {
  const { rowCount } = await pool.query(
    `UPDATE import_jobs
        SET status = 'failed',
            error = 'El proceso se reinició durante la importación',
            finished_at = NOW()
      WHERE status IN ('queued','running')
        AND created_at < NOW() - ($1 || ' minutes')::interval`,
    [String(STALE_JOB_MINUTES)],
  );
  return rowCount ?? 0;
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
    payload: { items: payload.items ?? [], retriedFrom: payload.retriedFrom },
    result,
    error: (row.error as string | null) ?? null,
    created_at: String(row.created_at),
    started_at: (row.started_at as string | null) ?? null,
    finished_at: (row.finished_at as string | null) ?? null,
  };
}

/** Resolves the TMDB id of an item, when the input is an IMDb id. */
async function toTmdbId(input: string, type: "movie" | "series"): Promise<number | null> {
  const direct = normalizeTmdbId(input);
  if (direct) return direct;

  const imdbId = normalizeImdbId(input);
  if (!imdbId) return null;

  const res = await fetch(
    `https://api.themoviedb.org/3/find/${imdbId}?external_source=imdb_id&api_key=${process.env["TMDB_API_KEY"] ?? ""}`,
    { signal: AbortSignal.timeout(12_000) },
  );
  if (!res.ok) return null;
  const data = (await res.json()) as {
    movie_results?: Array<{ id: number }>;
    tv_results?: Array<{ id: number }>;
  };
  const results = type === "movie" ? data.movie_results : data.tv_results;
  return results?.[0]?.id ?? null;
}

/** Processes a job. Resolves to the final job state. */
export async function processImportJob(id: string): Promise<ImportJob | null> {
  if (runningJobs.has(id)) return getImportJob(id);
  runningJobs.set(id, true);

  const client = await pool.connect();
  let locked = false;

  try {
    const lockResult = await client.query("SELECT pg_try_advisory_lock($1) AS locked", [IMPORT_LOCK_KEY]);
    locked = Boolean((lockResult.rows[0] as { locked: boolean }).locked);
    if (!locked) {
      logger.info({ jobId: id }, "Another import is running, job postponed");
      await pool.query(
        `UPDATE import_jobs SET status = 'failed', error = $2, finished_at = NOW() WHERE id = $1`,
        [id, "Ya hay una importación en curso. Reinténtalo en unos minutos."],
      );
      return getImportJob(id);
    }

    const job = await getImportJob(id);
    if (!job) return null;
    if (job.status === "cancelled") return job;

    await pool.query(`UPDATE import_jobs SET status = 'running', started_at = NOW() WHERE id = $1`, [id]);

    const items = job.payload.items ?? [];
    const results: ImportJobItem[] = [];
    let imported = 0;
    let skipped = 0;
    let failed = 0;
    let processed = 0;
    let cancelled = false;

    const outcomes = await mapWithConcurrency(
      items,
      async (input): Promise<ImportJobItem> => {
        const tmdbId = await toTmdbId(input, job.type);
        if (!tmdbId) {
          return {
            input,
            title: null,
            year: null,
            status: "not_found",
            error: "No se encontró en TMDB",
          };
        }

        const outcome: ImportOutcome =
          job.type === "movie" ? await importMovieByTmdbId(tmdbId) : await importSeriesByTmdbId(tmdbId);

        return {
          input,
          title: outcome.title,
          year: outcome.year,
          status: outcome.status,
          ...(outcome.error ? { error: outcome.error } : {}),
        };
      },
      {
        concurrency: 3,
        shouldStop: () => cancelled,
        onProgress: async () => {
          processed += 1;
          if (processed % 5 === 0 || processed === items.length) {
            await pool.query(
              `UPDATE import_jobs SET processed = $2, imported = $3, skipped = $4, failed = $5 WHERE id = $1`,
              [id, processed, imported, skipped, failed],
            );
          }
        },
      },
    );

    for (const outcome of outcomes) {
      if (outcome.status === "fulfilled") {
        const item = outcome.value;
        results.push(item);
        if (item.status === "imported") imported += 1;
        else if (item.status === "error") failed += 1;
        else skipped += 1;
      } else {
        failed += 1;
        results.push({
          input: "desconocido",
          title: null,
          year: null,
          status: "error",
          error: "Error inesperado durante la importación",
        });
      }
    }

    const cancelledNow = await isCancelled(id);
    const finalStatus: ImportJobStatus = cancelledNow ? "cancelled" : failed > 0 ? "partial" : "completed";

    await pool.query(
      `UPDATE import_jobs
          SET status = $2,
              processed = $3,
              imported = $4,
              skipped = $5,
              failed = $6,
              result = $7::jsonb,
              finished_at = NOW()
        WHERE id = $1`,
      [id, finalStatus, results.length, imported, skipped, failed, JSON.stringify(results)],
    );

    logger.info({ jobId: id, imported, skipped, failed, status: finalStatus }, "Import job finished");
    return getImportJob(id);
  } catch (err) {
    logger.error({ err, jobId: id }, "Import job crashed");
    await pool
      .query(`UPDATE import_jobs SET status = 'failed', error = $2, finished_at = NOW() WHERE id = $1`, [
        id,
        "Error interno durante la importación",
      ])
      .catch(() => {});
    return getImportJob(id);
  } finally {
    if (locked) {
      await client.query("SELECT pg_advisory_unlock($1)", [IMPORT_LOCK_KEY]).catch(() => {});
    }
    client.release();
    runningJobs.delete(id);
  }
}

async function isCancelled(id: string): Promise<boolean> {
  const { rows } = await pool.query("SELECT status FROM import_jobs WHERE id = $1", [id]);
  return rows[0]?.status === "cancelled";
}

/**
 * Resolves the requested identifiers without writing anything.
 * Used by the import preview so the admin can pick what to import.
 */
export async function previewItems(items: string[], type: "movie" | "series"): Promise<ResolvedItem[]> {
  const results = await mapWithConcurrency(items, (input) => resolveItem(input, type), {
    concurrency: 3,
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
