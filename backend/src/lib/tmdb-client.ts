import { getConfig } from "./config";
const TMDB_BASE = "https://api.themoviedb.org/3";
const TMDB_IMG = "https://image.tmdb.org/t/p";

/** Default timeout for a single TMDB call. */
const TMDB_TIMEOUT_MS = 12_000;
/** Maximum number of retries for transient failures. */
const TMDB_MAX_RETRIES = 3;
const TMDB_BASE_DELAY_MS = 400;

export function buildHeaders(): Record<string, string> {
  const key = getConfig().tmdbApiKey ?? "";
  if (key.length > 50) {
    return { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
  }
  return { "Content-Type": "application/json" };
}

export function appendKey(url: string): string {
  const key = getConfig().tmdbApiKey ?? "";
  if (key.length > 50) return url;
  return `${url}${url.includes("?") ? "&" : "?"}api_key=${key}`;
}

/** Waits `ms` milliseconds. */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Exponential backoff with jitter, capped so a burst of retries cannot hammer
 * the upstream provider.
 */
function backoffDelay(attempt: number): number {
  const exponential = Math.min(TMDB_BASE_DELAY_MS * 2 ** attempt, 8_000);
  return exponential + Math.floor(Math.random() * 250);
}

/**
 * Performs a TMDB request with a timeout and bounded retries.
 *
 * Only transient failures are retried (network errors, timeouts, 429 and 5xx).
 * Permanent failures (400, 401, 404) are returned to the caller immediately so
 * invalid identifiers are not requested again.
 */
export async function tmdbFetch(
  path: string,
  options: { timeoutMs?: number; retries?: number } = {},
): Promise<Response> {
  const timeoutMs = options.timeoutMs ?? TMDB_TIMEOUT_MS;
  const maxRetries = options.retries ?? TMDB_MAX_RETRIES;
  const url = appendKey(`${TMDB_BASE}${path}`);

  let lastError: unknown = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: buildHeaders(),
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (res.ok) return res;

      const retryable = res.status === 429 || res.status >= 500;
      if (!retryable || attempt === maxRetries) return res;

      // Respect the Retry-After header when the provider sends one.
      const retryAfter = Number(res.headers.get("retry-after"));
      const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : backoffDelay(attempt);
      await delay(Math.min(wait, 15_000));
    } catch (err) {
      lastError = err;
      if (attempt === maxRetries) break;
      await delay(backoffDelay(attempt));
    }
  }

  throw lastError instanceof Error ? lastError : new Error("TMDB request failed");
}

export function makeSlug(title: string, year: number): string {
  return (
    title
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") + (year ? `-${year}` : "")
  );
}

interface TmdbVideoRaw {
  type: string;
  site: string;
  key: string;
  name: string;
  official: boolean;
  published_at?: string;
}

interface TmdbReviewRaw {
  author: string;
  content: string;
  author_details: { rating: number | null };
  created_at: string;
}

const VIDEO_TYPES_WANTED = ["Trailer", "Teaser", "Clip", "Featurette", "Behind the Scenes", "Bloopers"];

function parseVideos(videoList: TmdbVideoRaw[]) {
  return videoList
    .filter((v) => v.site === "YouTube" && VIDEO_TYPES_WANTED.includes(v.type))
    .slice(0, 12)
    .map((v) => ({
      key: v.key,
      name: v.name,
      type: v.type,
      official: v.official ?? false,
    }));
}

function parseReviews(reviewList: TmdbReviewRaw[]) {
  return reviewList.slice(0, 5).map((r) => ({
    author: r.author,
    content: (r.content || "").slice(0, 600),
    rating: r.author_details?.rating ?? null,
    created_at: r.created_at,
  }));
}

/**
 * Short-lived cache of the details of a title.
 *
 * The import preview resolves the identifiers and the import job resolves them
 * again: without this cache every title would be fetched twice from TMDB,
 * burning the quota for nothing. The cache is short-lived (it only has to
 * survive the preview → import round trip) and bounded.
 */
const detailsCache = new Map<string, { data: Record<string, unknown>; expires: number }>();
const DETAILS_CACHE_TTL_MS = 5 * 60 * 1000;
const DETAILS_CACHE_MAX = 500;

function readCache(key: string): Record<string, unknown> | null {
  const entry = detailsCache.get(key);
  if (!entry) return null;
  if (entry.expires <= Date.now()) {
    detailsCache.delete(key);
    return null;
  }
  return entry.data;
}

function writeCache(key: string, data: Record<string, unknown>): void {
  if (detailsCache.size >= DETAILS_CACHE_MAX) {
    // Simple eviction: the oldest entry is removed.
    const oldest = detailsCache.keys().next();
    if (!oldest.done) detailsCache.delete(oldest.value);
  }
  detailsCache.set(key, { data, expires: Date.now() + DETAILS_CACHE_TTL_MS });
}

/** Empties the details cache (used by the tests). */
export function clearDetailsCache(): void {
  detailsCache.clear();
}

export async function fetchMovieByTmdbId(tmdbId: number): Promise<Record<string, unknown> | null> {
  const cacheKey = `movie:${tmdbId}`;
  const cached = readCache(cacheKey);
  if (cached) return cached;

  try {
    const [detailsRes, creditsRes, videosRes, extIdsRes, reviewsRes, keywordsRes] = await Promise.all([
      tmdbFetch(`/movie/${tmdbId}?language=es-MX`),
      tmdbFetch(`/movie/${tmdbId}/credits?language=es-MX`),
      tmdbFetch(`/movie/${tmdbId}/videos?language=es-MX&include_video_language=es,en`),
      tmdbFetch(`/movie/${tmdbId}/external_ids`),
      tmdbFetch(`/movie/${tmdbId}/reviews?language=es-MX`),
      tmdbFetch(`/movie/${tmdbId}/keywords`),
    ]);

    if (!detailsRes.ok || !extIdsRes.ok) return null;

    const [details, credits, videos, extIds, reviews, keywords] = (await Promise.all([
      detailsRes.json(),
      creditsRes.ok ? creditsRes.json() : Promise.resolve({ crew: [], cast: [] }),
      videosRes.ok ? videosRes.json() : Promise.resolve({ results: [] }),
      extIdsRes.json(),
      reviewsRes.ok ? reviewsRes.json() : Promise.resolve({ results: [] }),
      keywordsRes.ok ? keywordsRes.json() : Promise.resolve({ keywords: [] }),
    ])) as [
      Record<string, unknown>,
      Record<string, unknown>,
      Record<string, unknown>,
      Record<string, unknown>,
      Record<string, unknown>,
      Record<string, unknown>,
    ];

    const imdbId = extIds.imdb_id as string | null;
    if (!imdbId) return null;

    let synopsis = (details.overview as string) || "";
    if (!synopsis) {
      const enRes = await tmdbFetch(`/movie/${tmdbId}?language=en-US`);
      if (enRes.ok) {
        const enData = (await enRes.json()) as Record<string, unknown>;
        synopsis = (enData.overview as string) || "";
      }
    }

    const crew = (credits.crew as Array<{ job: string; name: string }>) || [];
    const director = crew.find((c) => c.job === "Director")?.name || "";
    const castRaw =
      (credits.cast as Array<{
        id: number;
        name: string;
        character: string;
        profile_path: string | null;
        order: number;
      }>) || [];
    const castList = castRaw.slice(0, 30).map((c) => c.name);
    const castFull = castRaw.slice(0, 15).map((c) => ({
      id: c.id,
      name: c.name,
      character: c.character || "",
      profile_url: c.profile_path ? `${TMDB_IMG}/w185${c.profile_path}` : null,
    }));

    const videoList = (videos.results as TmdbVideoRaw[]) || [];
    const allVideos = parseVideos(videoList);
    // Pick main trailer for yt_trailer_code
    const trailer = videoList
      .filter((v) => v.type === "Trailer" && v.site === "YouTube")
      .sort((a, b) => (b.official ? 1 : 0) - (a.official ? 1 : 0))[0];

    const reviewList = (reviews.results as TmdbReviewRaw[]) || [];
    const allReviews = parseReviews(reviewList);

    const genreList = (details.genres as Array<{ name: string }>) || [];
    const keywordList = (keywords.keywords as Array<{ name: string }>) || [];
    const keywordNames = keywordList.map((keyword) => keyword.name).filter(Boolean);
    const posterPath = details.poster_path as string | null;
    const backdropPath = details.backdrop_path as string | null;
    const releaseDate = (details.release_date as string) || "";
    const year = releaseDate ? Number(releaseDate.slice(0, 4)) : 0;
    const title = (details.title as string) || (details.original_title as string) || "";
    const runtime = (details.runtime as number) || 0;
    const rating = Math.round(((details.vote_average as number) || 0) * 10) / 10;

    const productionCompanies = (details.production_companies as Array<{ name: string }>) || [];
    const networks = productionCompanies.slice(0, 5).map((c) => c.name);

    const result = {
      imdb_id: imdbId,
      tmdb_id: tmdbId,
      title,
      year,
      rating,
      runtime,
      genres: genreList.map((g) => g.name),
      keywords: keywordNames,
      language: (details.original_language as string) || "en",
      synopsis,
      director,
      cast_list: castList,
      cast_full: castFull,
      networks,
      poster_url: posterPath ? `${TMDB_IMG}/w500${posterPath}` : "",
      background_url: backdropPath ? `${TMDB_IMG}/w1280${backdropPath}` : "",
      yt_trailer_code: trailer?.key || "",
      videos: allVideos,
      reviews: allReviews,
      mpa_rating: "NR",
      slug: makeSlug(title, year),
    };

    writeCache(cacheKey, result);
    return result;
  } catch {
    return null;
  }
}

export async function fetchSeriesByTmdbId(tmdbId: number): Promise<Record<string, unknown> | null> {
  const cacheKey = `series:${tmdbId}`;
  const cached = readCache(cacheKey);
  if (cached) return cached;

  try {
    const [detailsRes, creditsRes, videosRes, extIdsRes, reviewsRes, keywordsRes] = await Promise.all([
      tmdbFetch(`/tv/${tmdbId}?language=es-MX`),
      tmdbFetch(`/tv/${tmdbId}/credits?language=es-MX`),
      tmdbFetch(`/tv/${tmdbId}/videos?language=es-MX&include_video_language=es,en`),
      tmdbFetch(`/tv/${tmdbId}/external_ids`),
      tmdbFetch(`/tv/${tmdbId}/reviews?language=es-MX`),
      tmdbFetch(`/tv/${tmdbId}/keywords`),
    ]);

    if (!detailsRes.ok || !extIdsRes.ok) return null;

    const [details, credits, videos, extIds, reviews, keywords] = (await Promise.all([
      detailsRes.json(),
      creditsRes.ok ? creditsRes.json() : Promise.resolve({ crew: [], cast: [] }),
      videosRes.ok ? videosRes.json() : Promise.resolve({ results: [] }),
      extIdsRes.json(),
      reviewsRes.ok ? reviewsRes.json() : Promise.resolve({ results: [] }),
      keywordsRes.ok ? keywordsRes.json() : Promise.resolve({ results: [] }),
    ])) as [
      Record<string, unknown>,
      Record<string, unknown>,
      Record<string, unknown>,
      Record<string, unknown>,
      Record<string, unknown>,
      Record<string, unknown>,
    ];

    const imdbId = extIds.imdb_id as string | null;
    if (!imdbId) return null;

    let synopsis = (details.overview as string) || "";
    if (!synopsis) {
      const enRes = await tmdbFetch(`/tv/${tmdbId}?language=en-US`);
      if (enRes.ok) {
        const enData = (await enRes.json()) as Record<string, unknown>;
        synopsis = (enData.overview as string) || "";
      }
    }

    const crewRaw = (credits.crew as Array<{ job: string; name: string }>) || [];
    const castRaw =
      (credits.cast as Array<{
        id: number;
        name: string;
        character: string;
        profile_path: string | null;
        order: number;
      }>) || [];
    const seriesCastFull = castRaw.slice(0, 15).map((c) => ({
      id: c.id,
      name: c.name,
      character: c.character || "",
      profile_url: c.profile_path ? `${TMDB_IMG}/w185${c.profile_path}` : null,
    }));
    const creators = (details.created_by as Array<{ name: string }>) || [];
    const creatorNames = creators.map((c) => c.name);
    if (!creatorNames.length) {
      const director = crewRaw.find((c) => c.job === "Director")?.name;
      if (director) creatorNames.push(director);
    }

    const videoList = (videos.results as TmdbVideoRaw[]) || [];
    const allVideos = parseVideos(videoList);
    const trailer = videoList
      .filter((v) => v.type === "Trailer" && v.site === "YouTube")
      .sort((a, b) => (b.official ? 1 : 0) - (a.official ? 1 : 0))[0];

    const reviewList = (reviews.results as TmdbReviewRaw[]) || [];
    const allReviews = parseReviews(reviewList);

    const genreList = (details.genres as Array<{ name: string }>) || [];
    const keywordList = (keywords.results as Array<{ name: string }>) || [];
    const keywordNames = keywordList.map((keyword) => keyword.name).filter(Boolean);
    const posterPath = details.poster_path as string | null;
    const backdropPath = details.backdrop_path as string | null;
    const firstAir = (details.first_air_date as string) || "";
    const lastAir = (details.last_air_date as string) || "";
    const tvStatus = (details.status as string) || "";
    const year = firstAir ? Number(firstAir.slice(0, 4)) : 0;
    const endYear = tvStatus === "Ended" && lastAir ? Number(lastAir.slice(0, 4)) : null;
    const title = (details.name as string) || (details.original_name as string) || "";

    const seasonsRaw =
      (details.seasons as Array<{
        season_number: number;
        episode_count: number;
        name: string;
        poster_path: string | null;
        air_date: string | null;
      }>) || [];
    const seasons = seasonsRaw
      .filter((s) => s.season_number > 0)
      .map((s) => ({
        season: s.season_number,
        episodes: s.episode_count,
        name: s.name,
        poster: s.poster_path ? `${TMDB_IMG}/w300${s.poster_path}` : null,
        air_date: s.air_date,
      }));

    const networksRaw = (details.networks as Array<{ name: string }>) || [];
    const networks = networksRaw.map((n) => n.name);

    const result = {
      imdb_id: imdbId,
      tmdb_id: tmdbId,
      title,
      year,
      end_year: endYear,
      rating: Math.round(((details.vote_average as number) || 0) * 10) / 10,
      genres: genreList.map((g) => g.name),
      keywords: keywordNames,
      language: (details.original_language as string) || "en",
      synopsis,
      creators: creatorNames,
      cast_list: castRaw.slice(0, 30).map((c) => c.name),
      cast_full: seriesCastFull,
      networks,
      poster_url: posterPath ? `${TMDB_IMG}/w500${posterPath}` : "",
      background_url: backdropPath ? `${TMDB_IMG}/w1280${backdropPath}` : "",
      yt_trailer_code: trailer?.key || "",
      videos: allVideos,
      reviews: allReviews,
      status: tvStatus,
      total_seasons: (details.number_of_seasons as number) || seasons.length,
      seasons_data: seasons,
      slug: makeSlug(title, year),
    };

    writeCache(cacheKey, result);
    return result;
  } catch {
    return null;
  }
}
