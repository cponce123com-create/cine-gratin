/**
 * Automatic catalogue import.
 *
 * The scheduled run is protected by a PostgreSQL advisory lock so several
 * instances (Render can run more than one) never import at the same time.
 * The heavy lifting is delegated to `lib/catalog-import`, which contains the
 * idempotent write logic.
 */
import cron from "node-cron";
import { pool } from "../lib/db";
import { logger } from "../lib/logger";
import { tmdbFetch } from "../lib/tmdb-client";
import { mapWithConcurrency } from "../lib/concurrency";
import { findExisting, importMovieByTmdbId, importSeriesByTmdbId, makeSlug } from "../lib/catalog-import";

/** Advisory lock that serialises the automatic import across instances. */
const AUTO_IMPORT_LOCK_KEY = 918_273_648;

interface TmdbListItem {
  id: number;
  media_type?: string;
}

export type IdImportStatus = "imported" | "existed" | "not_found" | "error";

export interface IdImportResult {
  imdb_id: string;
  title: string | null;
  year?: number | null;
  status: IdImportStatus;
  error?: string;
}

/** Imports a movie by TMDB id. Returns true when a new entry was created. */
export async function importMovie(tmdbId: number): Promise<boolean> {
  const outcome = await importMovieByTmdbId(tmdbId);
  return outcome.status === "imported";
}

/** Imports a series by TMDB id. Returns true when a new entry was created. */
export async function importSeries(tmdbId: number): Promise<boolean> {
  const outcome = await importSeriesByTmdbId(tmdbId);
  return outcome.status === "imported";
}

/**
 * Imports a title by IMDb id.
 * Sports events use custom identifiers (`ev...`) that do not exist in TMDB;
 * those are stored as placeholder entries.
 */
export async function importByImdbId(imdbId: string, type: "movie" | "series"): Promise<IdImportResult> {
  if (!process.env["TMDB_API_KEY"]) {
    return { imdb_id: imdbId, title: null, status: "error", error: "TMDB_API_KEY no configurada" };
  }

  try {
    if (imdbId.startsWith("ev")) {
      const existing = await findExisting(type, { imdbId });
      if (existing) {
        return { imdb_id: imdbId, title: "Evento Deportivo", status: "existed" };
      }

      const id = `custom_${imdbId}`;
      const title = `Evento ${imdbId}`;
      const slug = makeSlug(title, new Date().getFullYear());

      if (type === "movie") {
        await pool.query(
          `INSERT INTO movies (id, imdb_id, title, year, genres, slug, auto_imported, networks, video_sources, torrents, videos, reviews)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) ON CONFLICT (id) DO NOTHING`,
          [
            id,
            imdbId,
            title,
            new Date().getFullYear(),
            ["Fútbol"],
            slug,
            true,
            ["Deportes"],
            "[]",
            "[]",
            "[]",
            "[]",
          ],
        );
      } else {
        await pool.query(
          `INSERT INTO cv_series (id, imdb_id, title, year, genres, auto_imported, networks, video_sources, seasons_data, videos, reviews)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) ON CONFLICT (id) DO NOTHING`,
          [
            id,
            imdbId,
            title,
            new Date().getFullYear(),
            ["Fútbol"],
            true,
            ["Deportes"],
            "[]",
            "[]",
            "[]",
            "[]",
          ],
        );
      }

      return { imdb_id: imdbId, title, status: "imported" };
    }

    const findRes = await tmdbFetch(`/find/${imdbId}?external_source=imdb_id`);
    if (!findRes.ok) {
      return { imdb_id: imdbId, title: null, status: "not_found" };
    }

    const findData = (await findRes.json()) as {
      movie_results: Array<{ id: number; title?: string; release_date?: string }>;
      tv_results: Array<{ id: number; name?: string; first_air_date?: string }>;
    };

    const isMovie = type === "movie";
    const results = isMovie ? findData.movie_results : findData.tv_results;

    if (!results || results.length === 0) {
      return { imdb_id: imdbId, title: null, status: "not_found" };
    }

    const tmdbId = results[0].id;
    const rawTitle = isMovie
      ? ((results[0] as { title?: string }).title ?? null)
      : ((results[0] as { name?: string }).name ?? null);
    const rawDate = isMovie
      ? ((results[0] as { release_date?: string }).release_date ?? "")
      : ((results[0] as { first_air_date?: string }).first_air_date ?? "");
    const year = rawDate ? Number(rawDate.slice(0, 4)) : null;

    const existing = await findExisting(type, { imdbId });
    if (existing) {
      return { imdb_id: imdbId, title: rawTitle, year, status: "existed" };
    }

    const outcome = isMovie ? await importMovieByTmdbId(tmdbId) : await importSeriesByTmdbId(tmdbId);

    return {
      imdb_id: imdbId,
      title: outcome.title ?? rawTitle,
      year: outcome.year ?? year,
      status: outcome.status === "imported" ? "imported" : outcome.status === "existed" ? "existed" : "error",
      ...(outcome.error ? { error: outcome.error } : {}),
    };
  } catch (err) {
    logger.warn({ err, imdbId, type }, "Failed to import by IMDb id");
    return { imdb_id: imdbId, title: null, status: "error", error: "Error al importar" };
  }
}

const ALL_SOURCES = [
  "/trending/movie/day",
  "/trending/movie/week",
  "/trending/tv/day",
  "/trending/tv/week",
  "/movie/upcoming?language=es-MX&region=MX",
  "/movie/top_rated?language=es-MX",
  "/tv/top_rated?language=es-MX",
  "/movie/popular?language=es-MX",
  "/tv/popular?language=es-MX",
];

/**
 * Runs the automatic import over the configured TMDB sources.
 * Safe to call concurrently: the advisory lock guarantees a single run.
 */
export async function runAutoImport(
  sources?: string[],
): Promise<{ moviesImported: number; seriesImported: number; totalChecked: number }> {
  if (!process.env["TMDB_API_KEY"]) {
    logger.warn("TMDB_API_KEY not set, skipping auto-import");
    return { moviesImported: 0, seriesImported: 0, totalChecked: 0 };
  }

  const client = await pool.connect();
  let locked = false;

  try {
    const lockResult = await client.query("SELECT pg_try_advisory_lock($1) AS locked", [
      AUTO_IMPORT_LOCK_KEY,
    ]);
    locked = Boolean((lockResult.rows[0] as { locked: boolean }).locked);
    if (!locked) {
      logger.info("Auto-import already running in another instance, skipping");
      return { moviesImported: 0, seriesImported: 0, totalChecked: 0 };
    }

    logger.info({ sources }, "Auto-import: starting");
    const activeSources = sources && sources.length > 0 ? sources : ALL_SOURCES;

    const responses = await Promise.all(activeSources.map((source) => tmdbFetch(source)));
    const data = (await Promise.all(
      responses.map((response) => (response.ok ? response.json() : { results: [] })),
    )) as { results: TmdbListItem[] }[];

    const movieIds = new Set<number>();
    const seriesIds = new Set<number>();

    activeSources.forEach((source, index) => {
      const results = data[index]?.results || [];
      const isTv = source.includes("/tv/");
      results.forEach((item) => {
        if (isTv) seriesIds.add(item.id);
        else movieIds.add(item.id);
      });
    });

    const totalChecked = movieIds.size + seriesIds.size;
    let moviesImported = 0;
    let seriesImported = 0;

    // Bounded concurrency keeps the TMDB quota and the API latency under control.
    const movieResults = await mapWithConcurrency([...movieIds], async (tmdbId) => importMovie(tmdbId), {
      concurrency: 3,
    });
    moviesImported = movieResults.filter((result) => result.status === "fulfilled" && result.value).length;

    const seriesResults = await mapWithConcurrency([...seriesIds], async (tmdbId) => importSeries(tmdbId), {
      concurrency: 3,
    });
    seriesImported = seriesResults.filter((result) => result.status === "fulfilled" && result.value).length;

    await pool.query(
      `INSERT INTO cv_auto_import_log (movies_imported, series_imported, total_checked, status)
       VALUES ($1, $2, $3, 'success')`,
      [moviesImported, seriesImported, totalChecked],
    );

    logger.info({ moviesImported, seriesImported, totalChecked }, "Auto-import: completed");
    return { moviesImported, seriesImported, totalChecked };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err }, "Auto-import: failed");
    await pool
      .query(
        `INSERT INTO cv_auto_import_log (movies_imported, series_imported, total_checked, status, error_message)
         VALUES ($1, $2, $3, 'error', $4)`,
        [0, 0, 0, msg.slice(0, 500)],
      )
      .catch(() => {});
    return { moviesImported: 0, seriesImported: 0, totalChecked: 0 };
  } finally {
    if (locked) {
      await client.query("SELECT pg_advisory_unlock($1)", [AUTO_IMPORT_LOCK_KEY]).catch(() => {});
    }
    client.release();
  }
}

/** True when the automatic import is enabled in the settings table. */
async function isAutoImportEnabled(): Promise<boolean> {
  const { rows } = await pool.query("SELECT value FROM cv_settings WHERE key = 'auto_import_enabled'");
  return rows[0]?.value !== "false";
}

/** Schedules the daily automatic import and triggers one run at startup. */
export function startAutoImportCron(): void {
  cron.schedule("0 3 * * *", async () => {
    try {
      if (!(await isAutoImportEnabled())) {
        logger.info("Auto-import: disabled, skipping scheduled run");
        return;
      }
      await runAutoImport();
    } catch (err) {
      logger.error({ err }, "Auto-import cron error");
    }
  });

  logger.info("Auto-import cron scheduled (daily at 03:00)");

  setTimeout(async () => {
    try {
      if (!(await isAutoImportEnabled())) return;
      logger.info("Auto-import: running initial import at startup");
      await runAutoImport();
    } catch (err) {
      logger.error({ err }, "Auto-import startup run error");
    }
  }, 10_000);
}
