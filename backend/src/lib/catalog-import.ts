/**
 * Catalog import primitives.
 *
 * These functions are the single place where content enters the catalogue.
 * They are:
 *  - idempotent: importing the same item twice never creates a duplicate;
 *  - conservative: manual edits are preserved, only empty fields are filled;
 *  - structured: every outcome is reported with an explicit status so the
 *    caller can build an accurate summary.
 */
import { pool } from "./db";
import { logger } from "./logger";
import { fetchMovieByTmdbId, fetchSeriesByTmdbId, makeSlug, tmdbFetch } from "./tmdb-client";

/** PostgreSQL error code for a unique constraint violation. */
const UNIQUE_VIOLATION = "23505";

/** True when the error is a unique constraint violation. */
function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === UNIQUE_VIOLATION;
}

export { makeSlug } from "./tmdb-client";

export type ImportStatus = "imported" | "existed" | "not_found" | "skipped" | "error";

export interface ImportOutcome {
  id: string;
  title: string | null;
  year: number | null;
  status: ImportStatus;
  error?: string;
}

const IMDB_ID_PATTERN = /^tt\d{7,10}$/;
const TMDB_ID_MAX = 2_147_483_647;

/** Normalises an IMDb identifier, returning null when it is not valid. */
export function normalizeImdbId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  if (!IMDB_ID_PATTERN.test(trimmed)) return null;
  return trimmed;
}

/** Normalises a TMDB identifier, returning null when it is not valid. */
export function normalizeTmdbId(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > TMDB_ID_MAX) return null;
  return parsed;
}

type TableName = "movies" | "cv_series";

/**
 * Looks for an existing catalogue entry by IMDb id (and TMDB id as a fallback).
 * Returns the local id when found.
 */
export async function findExisting(
  type: "movie" | "series",
  identifiers: { imdbId?: string | null; tmdbId?: number | null },
): Promise<string | null> {
  const table: TableName = type === "movie" ? "movies" : "cv_series";

  if (identifiers.imdbId) {
    const { rows } = await pool.query(`SELECT id FROM ${table} WHERE imdb_id = $1 LIMIT 1`, [
      identifiers.imdbId,
    ]);
    if (rows[0]) return (rows[0] as { id: string }).id;
  }

  if (identifiers.tmdbId) {
    const { rows } = await pool.query(`SELECT id FROM ${table} WHERE tmdb_id = $1 LIMIT 1`, [
      identifiers.tmdbId,
    ]);
    if (rows[0]) return (rows[0] as { id: string }).id;
  }

  return null;
}

interface RawMedia {
  imdb_id?: string | null;
  tmdb_id?: number | null;
  title?: string | null;
  year?: number | null;
  rating?: number | null;
  runtime?: number | null;
  genres?: string[] | null;
  keywords?: string[] | null;
  language?: string | null;
  synopsis?: string | null;
  director?: string | null;
  cast_list?: string[] | null;
  cast_full?: unknown[] | null;
  networks?: string[] | null;
  poster_url?: string | null;
  background_url?: string | null;
  yt_trailer_code?: string | null;
  videos?: unknown[] | null;
  reviews?: unknown[] | null;
  mpa_rating?: string | null;
  slug?: string | null;
  end_year?: number | null;
  creators?: string[] | null;
  status?: string | null;
  total_seasons?: number | null;
  seasons_data?: unknown[] | null;
}

const asStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

/**
 * Imports a movie by TMDB id.
 * Returns the outcome without ever duplicating an existing entry.
 */
export async function importMovieByTmdbId(tmdbId: number): Promise<ImportOutcome> {
  try {
    const data = (await fetchMovieByTmdbId(tmdbId)) as RawMedia | null;
    if (!data || !data.imdb_id) {
      return { id: `tmdb:${tmdbId}`, title: null, year: null, status: "not_found" };
    }

    const runtime = Number(data.runtime ?? 0);
    if (runtime > 0 && runtime < 30) {
      return {
        id: `tmdb:${tmdbId}`,
        title: data.title ?? null,
        year: data.year ?? null,
        status: "skipped",
        error: "Duración inferior a 30 minutos",
      };
    }

    const existing = await findExisting("movie", { imdbId: data.imdb_id, tmdbId });
    if (existing) {
      await fillMissingMovieFields(existing, data, tmdbId);
      return {
        id: existing,
        title: data.title ?? null,
        year: data.year ?? null,
        status: "existed",
      };
    }

    const id = `auto_${data.imdb_id}`;
    const slug = data.slug || makeSlug(data.title ?? "", data.year ?? 0);

    await pool.query(
      `INSERT INTO movies (id, imdb_id, tmdb_id, title, year, rating, runtime, genres, language, synopsis,
        director, cast_list, cast_full, networks, keywords, poster_url, background_url, yt_trailer_code, videos, reviews,
        mpa_rating, slug, featured, video_sources, torrents, views, date_added, auto_imported)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,FALSE,'[]','[]',0,NOW(),TRUE)
       ON CONFLICT (id) DO NOTHING`,
      [
        id,
        data.imdb_id,
        tmdbId,
        data.title ?? "",
        data.year ?? 0,
        data.rating ?? 0,
        runtime,
        asStringArray(data.genres),
        data.language ?? "es",
        data.synopsis ?? "",
        data.director ?? "",
        asStringArray(data.cast_list),
        JSON.stringify(Array.isArray(data.cast_full) ? data.cast_full : []),
        asStringArray(data.networks),
        asStringArray(data.keywords),
        data.poster_url ?? "",
        data.background_url ?? "",
        data.yt_trailer_code ?? "",
        JSON.stringify(Array.isArray(data.videos) ? data.videos : []),
        JSON.stringify(Array.isArray(data.reviews) ? data.reviews : []),
        data.mpa_rating ?? "NR",
        slug,
      ],
    );

    return { id, title: data.title ?? null, year: data.year ?? null, status: "imported" };
  } catch (err) {
    // Another import of the same title won the race: the content is already
    // in the catalogue, which is not an error.
    if (isUniqueViolation(err)) {
      return { id: `tmdb:${tmdbId}`, title: null, year: null, status: "existed" };
    }
    logger.warn({ err, tmdbId }, "Failed to import movie");
    return {
      id: `tmdb:${tmdbId}`,
      title: null,
      year: null,
      status: "error",
      error: "No se pudo importar la película",
    };
  }
}

/** Imports a series by TMDB id. */
export async function importSeriesByTmdbId(tmdbId: number): Promise<ImportOutcome> {
  try {
    const data = (await fetchSeriesByTmdbId(tmdbId)) as RawMedia | null;
    if (!data || !data.imdb_id) {
      return { id: `tmdb:${tmdbId}`, title: null, year: null, status: "not_found" };
    }

    const existing = await findExisting("series", { imdbId: data.imdb_id, tmdbId });
    if (existing) {
      await fillMissingSeriesFields(existing, data, tmdbId);
      return {
        id: existing,
        title: data.title ?? null,
        year: data.year ?? null,
        status: "existed",
      };
    }

    const id = `auto_${data.imdb_id}`;
    const slug = data.slug || makeSlug(data.title ?? "", data.year ?? 0);

    await pool.query(
      `INSERT INTO cv_series (id, imdb_id, tmdb_id, title, year, end_year, rating, genres, language,
        synopsis, creators, cast_list, cast_full, networks, keywords, poster_url, background_url, yt_trailer_code,
        videos, reviews, status, total_seasons, seasons_data, video_sources, slug, featured, views, date_added, auto_imported)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,'[]',$24,FALSE,0,NOW(),TRUE)
       ON CONFLICT (id) DO NOTHING`,
      [
        id,
        data.imdb_id,
        tmdbId,
        data.title ?? "",
        data.year ?? 0,
        data.end_year ?? null,
        data.rating ?? 0,
        asStringArray(data.genres),
        data.language ?? "en",
        data.synopsis ?? "",
        asStringArray(data.creators),
        asStringArray(data.cast_list),
        JSON.stringify(Array.isArray(data.cast_full) ? data.cast_full : []),
        asStringArray(data.networks),
        asStringArray(data.keywords),
        data.poster_url ?? "",
        data.background_url ?? "",
        data.yt_trailer_code ?? "",
        JSON.stringify(Array.isArray(data.videos) ? data.videos : []),
        JSON.stringify(Array.isArray(data.reviews) ? data.reviews : []),
        data.status ?? "",
        data.total_seasons ?? 1,
        JSON.stringify(Array.isArray(data.seasons_data) ? data.seasons_data : []),
        slug,
      ],
    );

    return { id, title: data.title ?? null, year: data.year ?? null, status: "imported" };
  } catch (err) {
    if (isUniqueViolation(err)) {
      return { id: `tmdb:${tmdbId}`, title: null, year: null, status: "existed" };
    }
    logger.warn({ err, tmdbId }, "Failed to import series");
    return {
      id: `tmdb:${tmdbId}`,
      title: null,
      year: null,
      status: "error",
      error: "No se pudo importar la serie",
    };
  }
}

/**
 * Fills only the fields that are still empty on an existing entry.
 * Values edited by hand are never overwritten.
 */
async function fillMissingMovieFields(id: string, data: RawMedia, tmdbId: number): Promise<void> {
  const castFull = Array.isArray(data.cast_full) ? data.cast_full : [];

  await pool.query(
    `UPDATE movies
        SET cast_full = CASE WHEN jsonb_array_length($1::jsonb) > 0 THEN $1::jsonb ELSE cast_full END,
            tmdb_id = COALESCE(tmdb_id, $2),
            poster_url = COALESCE(NULLIF(poster_url, ''), $3),
            background_url = COALESCE(NULLIF(background_url, ''), $4),
            keywords = CASE WHEN cardinality(keywords) = 0 THEN $5 ELSE keywords END,
            cast_list = CASE WHEN cardinality(cast_list) = 0 THEN $6 ELSE cast_list END,
            synopsis = CASE WHEN synopsis = '' THEN $7 ELSE synopsis END,
            genres = CASE WHEN cardinality(genres) = 0 THEN $8 ELSE genres END
      WHERE id = $9`,
    [
      JSON.stringify(castFull),
      tmdbId,
      data.poster_url ?? "",
      data.background_url ?? "",
      asStringArray(data.keywords),
      asStringArray(data.cast_list),
      data.synopsis ?? "",
      asStringArray(data.genres),
      id,
    ],
  );
}

async function fillMissingSeriesFields(id: string, data: RawMedia, tmdbId: number): Promise<void> {
  const castFull = Array.isArray(data.cast_full) ? data.cast_full : [];

  await pool.query(
    `UPDATE cv_series
        SET cast_full = CASE WHEN jsonb_array_length($1::jsonb) > 0 THEN $1::jsonb ELSE cast_full END,
            tmdb_id = COALESCE(tmdb_id, $2),
            poster_url = COALESCE(NULLIF(poster_url, ''), $3),
            background_url = COALESCE(NULLIF(background_url, ''), $4),
            keywords = CASE WHEN cardinality(keywords) = 0 THEN $5 ELSE keywords END,
            cast_list = CASE WHEN cardinality(cast_list) = 0 THEN $6 ELSE cast_list END,
            synopsis = CASE WHEN synopsis = '' THEN $7 ELSE synopsis END,
            genres = CASE WHEN cardinality(genres) = 0 THEN $8 ELSE genres END
      WHERE id = $9`,
    [
      JSON.stringify(castFull),
      tmdbId,
      data.poster_url ?? "",
      data.background_url ?? "",
      asStringArray(data.keywords),
      asStringArray(data.cast_list),
      data.synopsis ?? "",
      asStringArray(data.genres),
      id,
    ],
  );
}

/** Result of resolving an identifier without writing anything. */
export interface ResolvedItem {
  input: string;
  type: "movie" | "series";
  title: string | null;
  year: number | null;
  posterUrl: string | null;
  imdbId: string | null;
  tmdbId: number | null;
  status: "new" | "existed" | "not_found" | "invalid";
}

/**
 * Resolves an identifier into catalogue metadata without writing to the
 * database. Used by the import preview.
 */
export async function resolveItem(input: string, type: "movie" | "series"): Promise<ResolvedItem> {
  const tmdbId = normalizeTmdbId(input);
  const imdbId = normalizeImdbId(input);

  if (!tmdbId && !imdbId) {
    return {
      input,
      type,
      title: null,
      year: null,
      posterUrl: null,
      imdbId: null,
      tmdbId: null,
      status: "invalid",
    };
  }

  let resolvedTmdbId = tmdbId;
  let title: string | null = null;
  let year: number | null = null;
  let posterUrl: string | null = null;
  let resolvedImdbId: string | null = imdbId;

  if (!resolvedTmdbId && imdbId) {
    const res = await tmdbFetch(`/find/${imdbId}?external_source=imdb_id`);
    if (!res.ok) {
      return {
        input,
        type,
        title: null,
        year: null,
        posterUrl: null,
        imdbId,
        tmdbId: null,
        status: "not_found",
      };
    }
    interface TmdbSearchItem {
      id: number;
      title?: string;
      name?: string;
      release_date?: string;
      first_air_date?: string;
      poster_path?: string | null;
    }
    const data = (await res.json()) as {
      movie_results?: TmdbSearchItem[];
      tv_results?: TmdbSearchItem[];
    };
    const results = type === "movie" ? data.movie_results : data.tv_results;
    const first = results?.[0];
    if (!first) {
      return {
        input,
        type,
        title: null,
        year: null,
        posterUrl: null,
        imdbId,
        tmdbId: null,
        status: "not_found",
      };
    }
    resolvedTmdbId = first.id;
    title = first.title ?? first.name ?? null;
    const date = first.release_date ?? first.first_air_date ?? "";
    year = date ? Number(date.slice(0, 4)) : null;
    posterUrl = first.poster_path ? `https://image.tmdb.org/t/p/w185${first.poster_path}` : null;
  }

  if (!resolvedTmdbId) {
    return {
      input,
      type,
      title: null,
      year: null,
      posterUrl: null,
      imdbId: resolvedImdbId,
      tmdbId: null,
      status: "not_found",
    };
  }

  const details = (
    type === "movie" ? await fetchMovieByTmdbId(resolvedTmdbId) : await fetchSeriesByTmdbId(resolvedTmdbId)
  ) as RawMedia | null;

  if (details) {
    title = details.title ?? title;
    year = details.year ?? year;
    posterUrl = details.poster_url || posterUrl;
    resolvedImdbId = details.imdb_id ?? resolvedImdbId;
  }

  const existing = await findExisting(type, { imdbId: resolvedImdbId, tmdbId: resolvedTmdbId });

  return {
    input,
    type,
    title,
    year,
    posterUrl,
    imdbId: resolvedImdbId,
    tmdbId: resolvedTmdbId,
    status: existing ? "existed" : "new",
  };
}
