import cron from "node-cron";
import { pool } from "../lib/db";
import { logger } from "../lib/logger";
import { tmdbFetch, fetchMovieByTmdbId, fetchSeriesByTmdbId, makeSlug } from "../lib/tmdb-client";

interface TmdbListItem {
  id: number;
  media_type?: string;
}

async function getImdbIdExists(imdbId: string, table: "movies" | "cv_series"): Promise<boolean> {
  const col = table === "movies" ? "imdb_id" : "imdb_id";
  const { rows } = await pool.query(`SELECT 1 FROM ${table} WHERE ${col} = $1 LIMIT 1`, [imdbId]);
  return rows.length > 0;
}

async function importMovie(tmdbId: number): Promise<boolean> {
  try {
    const data = await fetchMovieByTmdbId(tmdbId);
    if (!data || !data.imdb_id) return false;

    const exists = await getImdbIdExists(data.imdb_id as string, "movies");
    if (exists) return false;

    const id = `auto_${data.imdb_id}`;
    const slug = makeSlug(data.title as string, data.year as number);

    await pool.query(
      `INSERT INTO movies (id, imdb_id, title, year, rating, runtime, genres, language, synopsis,
        director, cast_list, poster_url, background_url, yt_trailer_code, mpa_rating, slug,
        featured, video_sources, torrents, views, date_added, auto_imported)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
       ON CONFLICT (id) DO NOTHING`,
      [
        id, data.imdb_id, data.title, data.year, data.rating, data.runtime,
        data.genres, data.language, data.synopsis, data.director, data.cast_list,
        data.poster_url, data.background_url, data.yt_trailer_code, data.mpa_rating,
        slug, false, "[]", "[]", 0, new Date().toISOString(), true,
      ]
    );
    return true;
  } catch (err) {
    logger.warn({ err, tmdbId }, "Failed to import movie");
    return false;
  }
}

async function importSeries(tmdbId: number): Promise<boolean> {
  try {
    const data = await fetchSeriesByTmdbId(tmdbId);
    if (!data || !data.imdb_id) return false;

    const exists = await getImdbIdExists(data.imdb_id as string, "cv_series");
    if (exists) return false;

    const id = `auto_${data.imdb_id}`;

    await pool.query(
      `INSERT INTO cv_series (id, imdb_id, tmdb_id, title, year, end_year, rating, genres, language,
        synopsis, creators, cast_list, poster_url, background_url, yt_trailer_code, status,
        total_seasons, seasons_data, video_sources, featured, views, date_added, auto_imported)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
       ON CONFLICT (id) DO NOTHING`,
      [
        id, data.imdb_id, data.tmdb_id, data.title, data.year, data.end_year || null,
        data.rating, data.genres, data.language, data.synopsis,
        data.creators, data.cast_list, data.poster_url, data.background_url,
        data.yt_trailer_code, data.status, data.total_seasons,
        JSON.stringify(data.seasons_data || []), "[]",
        false, 0, new Date().toISOString(), true,
      ]
    );
    return true;
  } catch (err) {
    logger.warn({ err, tmdbId }, "Failed to import series");
    return false;
  }
}

export type IdImportStatus = "imported" | "existed" | "not_found" | "error";

export interface IdImportResult {
  imdb_id: string;
  title: string | null;
  year?: number | null;
  status: IdImportStatus;
  error?: string;
}

export async function importByImdbId(
  imdbId: string,
  type: "movie" | "series"
): Promise<IdImportResult> {
  const apiKey = process.env["TMDB_API_KEY"];
  if (!apiKey) {
    return { imdb_id: imdbId, title: null, status: "error", error: "TMDB_API_KEY not configured" };
  }

  try {
    // Find the TMDB entry by IMDb ID
    const findRes = await tmdbFetch(`/find/${imdbId}?external_source=imdb_id`);
    if (!findRes.ok) {
      return { imdb_id: imdbId, title: null, status: "not_found" };
    }

    const findData = await findRes.json() as {
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
      ? (results[0] as { title?: string }).title ?? null
      : (results[0] as { name?: string }).name ?? null;
    const rawDate = isMovie
      ? (results[0] as { release_date?: string }).release_date ?? ""
      : (results[0] as { first_air_date?: string }).first_air_date ?? "";
    const year = rawDate ? Number(rawDate.slice(0, 4)) : null;

    // Check if already in DB
    const table = isMovie ? "movies" : "cv_series";
    const exists = await getImdbIdExists(imdbId, table);
    if (exists) {
      return { imdb_id: imdbId, title: rawTitle, year, status: "existed" };
    }

    // Import it
    const imported = isMovie ? await importMovie(tmdbId) : await importSeries(tmdbId);
    return {
      imdb_id: imdbId,
      title: rawTitle,
      year,
      status: imported ? "imported" : "error",
    };
  } catch (err) {
    return { imdb_id: imdbId, title: null, status: "error", error: String(err) };
  }
}

export async function runAutoImport(): Promise<{ moviesImported: number; seriesImported: number; totalChecked: number }> {
  const apiKey = process.env["TMDB_API_KEY"];
  if (!apiKey) {
    logger.warn("TMDB_API_KEY not set, skipping auto-import");
    return { moviesImported: 0, seriesImported: 0, totalChecked: 0 };
  }

  logger.info("Auto-import: starting");
  let moviesImported = 0;
  let seriesImported = 0;
  let totalChecked = 0;

  try {
    const [trendingMoviesRes, upcomingRes, trendingTvRes] = await Promise.all([
      tmdbFetch("/trending/movie/day"),
      tmdbFetch("/movie/upcoming?language=es-MX&region=MX"),
      tmdbFetch("/trending/tv/week"),
    ]);

    const [trendingMovies, upcoming, trendingTv] = await Promise.all([
      trendingMoviesRes.ok ? trendingMoviesRes.json() : { results: [] },
      upcomingRes.ok ? upcomingRes.json() : { results: [] },
      trendingTvRes.ok ? trendingTvRes.json() : { results: [] },
    ]) as [{ results: TmdbListItem[] }, { results: TmdbListItem[] }, { results: TmdbListItem[] }];

    const movieIds = new Set<number>();
    for (const m of [...(trendingMovies.results || []), ...(upcoming.results || [])]) {
      movieIds.add(m.id);
    }

    const seriesIds = new Set<number>();
    for (const s of trendingTv.results || []) {
      seriesIds.add(s.id);
    }

    totalChecked = movieIds.size + seriesIds.size;

    for (const tmdbId of movieIds) {
      const imported = await importMovie(tmdbId);
      if (imported) moviesImported++;
    }

    for (const tmdbId of seriesIds) {
      const imported = await importSeries(tmdbId);
      if (imported) seriesImported++;
    }

    await pool.query(
      `INSERT INTO cv_auto_import_log (movies_imported, series_imported, total_checked, status)
       VALUES ($1, $2, $3, 'success')`,
      [moviesImported, seriesImported, totalChecked]
    );

    logger.info({ moviesImported, seriesImported, totalChecked }, "Auto-import: completed");
    return { moviesImported, seriesImported, totalChecked };
  } catch (err) {
    const msg = String(err);
    logger.error({ err }, "Auto-import: failed");
    await pool.query(
      `INSERT INTO cv_auto_import_log (movies_imported, series_imported, total_checked, status, error_message)
       VALUES ($1, $2, $3, 'error', $4)`,
      [moviesImported, seriesImported, totalChecked, msg]
    );
    return { moviesImported, seriesImported, totalChecked };
  }
}

export function startAutoImportCron(): void {
  // Run every 24 hours at 3:00 AM
  cron.schedule("0 3 * * *", async () => {
    try {
      const { rows } = await pool.query("SELECT value FROM cv_settings WHERE key = 'auto_import_enabled'");
      const enabled = rows[0]?.value !== "false";
      if (!enabled) {
        logger.info("Auto-import: disabled, skipping scheduled run");
        return;
      }
      await runAutoImport();
    } catch (err) {
      logger.error({ err }, "Auto-import cron error");
    }
  });

  logger.info("Auto-import cron scheduled (daily at 03:00)");

  // Also run once at startup in the background
  setTimeout(async () => {
    try {
      const { rows } = await pool.query("SELECT value FROM cv_settings WHERE key = 'auto_import_enabled'");
      const enabled = rows[0]?.value !== "false";
      if (enabled) {
        logger.info("Auto-import: running initial import at startup");
        await runAutoImport();
      }
    } catch (err) {
      logger.error({ err }, "Auto-import startup run error");
    }
  }, 10000); // 10s delay after startup
}
