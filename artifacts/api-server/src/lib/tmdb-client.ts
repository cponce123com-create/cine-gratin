const TMDB_BASE = "https://api.themoviedb.org/3";
const TMDB_IMG = "https://image.tmdb.org/t/p";

export function buildHeaders(): Record<string, string> {
  const key = process.env["TMDB_API_KEY"] || "";
  if (key.length > 50) {
    return { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" };
  }
  return { "Content-Type": "application/json" };
}

export function appendKey(url: string): string {
  const key = process.env["TMDB_API_KEY"] || "";
  if (key.length > 50) return url;
  return `${url}${url.includes("?") ? "&" : "?"}api_key=${key}`;
}

export async function tmdbFetch(path: string): Promise<Response> {
  return fetch(appendKey(`${TMDB_BASE}${path}`), { headers: buildHeaders() });
}

export function makeSlug(title: string, year: number): string {
  return title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    + (year ? `-${year}` : "");
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
    .filter(v => v.site === "YouTube" && VIDEO_TYPES_WANTED.includes(v.type))
    .slice(0, 12)
    .map(v => ({
      key: v.key,
      name: v.name,
      type: v.type,
      official: v.official ?? false,
    }));
}

function parseReviews(reviewList: TmdbReviewRaw[]) {
  return reviewList
    .slice(0, 5)
    .map(r => ({
      author: r.author,
      content: (r.content || "").slice(0, 600),
      rating: r.author_details?.rating ?? null,
      created_at: r.created_at,
    }));
}

export async function fetchMovieByTmdbId(tmdbId: number): Promise<Record<string, unknown> | null> {
  try {
    const [detailsRes, creditsRes, videosRes, extIdsRes, reviewsRes] = await Promise.all([
      tmdbFetch(`/movie/${tmdbId}?language=es-MX`),
      tmdbFetch(`/movie/${tmdbId}/credits?language=es-MX`),
      tmdbFetch(`/movie/${tmdbId}/videos?language=es-MX&include_video_language=es,en`),
      tmdbFetch(`/movie/${tmdbId}/external_ids`),
      tmdbFetch(`/movie/${tmdbId}/reviews?language=es-MX`),
    ]);

    if (!detailsRes.ok || !extIdsRes.ok) return null;

    const [details, credits, videos, extIds, reviews] = await Promise.all([
      detailsRes.json(),
      creditsRes.ok ? creditsRes.json() : Promise.resolve({ crew: [], cast: [] }),
      videosRes.ok ? videosRes.json() : Promise.resolve({ results: [] }),
      extIdsRes.json(),
      reviewsRes.ok ? reviewsRes.json() : Promise.resolve({ results: [] }),
    ]) as [Record<string, unknown>, Record<string, unknown>, Record<string, unknown>, Record<string, unknown>, Record<string, unknown>];

    const imdbId = extIds.imdb_id as string | null;
    if (!imdbId) return null;

    let synopsis = (details.overview as string) || "";
    if (!synopsis) {
      const enRes = await tmdbFetch(`/movie/${tmdbId}?language=en-US`);
      if (enRes.ok) {
        const enData = await enRes.json() as Record<string, unknown>;
        synopsis = (enData.overview as string) || "";
      }
    }

    const crew = (credits.crew as Array<{ job: string; name: string }>) || [];
    const director = crew.find(c => c.job === "Director")?.name || "";
    const castRaw = (credits.cast as Array<{ id: number; name: string; character: string; profile_path: string | null; order: number }>) || [];
    const castList = castRaw.slice(0, 12).map(c => c.name);
    const castFull = castRaw.slice(0, 15).map(c => ({
      id: c.id,
      name: c.name,
      character: c.character || "",
      profile_url: c.profile_path ? `${TMDB_IMG}/w185${c.profile_path}` : null,
    }));

    const videoList = (videos.results as TmdbVideoRaw[]) || [];
    const allVideos = parseVideos(videoList);
    // Pick main trailer for yt_trailer_code
    const trailer = videoList
      .filter(v => v.type === "Trailer" && v.site === "YouTube")
      .sort((a, b) => (b.official ? 1 : 0) - (a.official ? 1 : 0))[0];

    const reviewList = (reviews.results as TmdbReviewRaw[]) || [];
    const allReviews = parseReviews(reviewList);

    const genreList = (details.genres as Array<{ name: string }>) || [];
    const posterPath = details.poster_path as string | null;
    const backdropPath = details.backdrop_path as string | null;
    const releaseDate = (details.release_date as string) || "";
    const year = releaseDate ? Number(releaseDate.slice(0, 4)) : 0;
    const title = (details.title as string) || (details.original_title as string) || "";
    const runtime = (details.runtime as number) || 0;
    const rating = Math.round(((details.vote_average as number) || 0) * 10) / 10;

    const productionCompanies = (details.production_companies as Array<{ name: string }>) || [];
    const networks = productionCompanies.slice(0, 5).map(c => c.name);

    const belongsToCollection = details.belongs_to_collection as { id: number; name: string } | null;

    return {
      imdb_id: imdbId,
      tmdb_id: tmdbId,
      title,
      year,
      rating,
      runtime,
      genres: genreList.map(g => g.name),
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
      collection_id: belongsToCollection?.id || null,
      collection_name: belongsToCollection?.name || null,
    };
  } catch {
    return null;
  }
}

export async function fetchSeriesByTmdbId(tmdbId: number): Promise<Record<string, unknown> | null> {
  try {
    const [detailsRes, creditsRes, videosRes, extIdsRes, reviewsRes] = await Promise.all([
      tmdbFetch(`/tv/${tmdbId}?language=es-MX`),
      tmdbFetch(`/tv/${tmdbId}/credits?language=es-MX`),
      tmdbFetch(`/tv/${tmdbId}/videos?language=es-MX&include_video_language=es,en`),
      tmdbFetch(`/tv/${tmdbId}/external_ids`),
      tmdbFetch(`/tv/${tmdbId}/reviews?language=es-MX`),
    ]);

    if (!detailsRes.ok || !extIdsRes.ok) return null;

    const [details, credits, videos, extIds, reviews] = await Promise.all([
      detailsRes.json(),
      creditsRes.ok ? creditsRes.json() : Promise.resolve({ crew: [], cast: [] }),
      videosRes.ok ? videosRes.json() : Promise.resolve({ results: [] }),
      extIdsRes.json(),
      reviewsRes.ok ? reviewsRes.json() : Promise.resolve({ results: [] }),
    ]) as [Record<string, unknown>, Record<string, unknown>, Record<string, unknown>, Record<string, unknown>, Record<string, unknown>];

    const imdbId = extIds.imdb_id as string | null;
    if (!imdbId) return null;

    let synopsis = (details.overview as string) || "";
    if (!synopsis) {
      const enRes = await tmdbFetch(`/tv/${tmdbId}?language=en-US`);
      if (enRes.ok) {
        const enData = await enRes.json() as Record<string, unknown>;
        synopsis = (enData.overview as string) || "";
      }
    }

    const crewRaw = (credits.crew as Array<{ job: string; name: string }>) || [];
    const castRaw = (credits.cast as Array<{ id: number; name: string; character: string; profile_path: string | null; order: number }>) || [];
    const seriesCastFull = castRaw.slice(0, 15).map(c => ({
      id: c.id,
      name: c.name,
      character: c.character || "",
      profile_url: c.profile_path ? `${TMDB_IMG}/w185${c.profile_path}` : null,
    }));
    const creators = (details.created_by as Array<{ name: string }>) || [];
    const creatorNames = creators.map(c => c.name);
    if (!creatorNames.length) {
      const director = crewRaw.find(c => c.job === "Director")?.name;
      if (director) creatorNames.push(director);
    }

    const videoList = (videos.results as TmdbVideoRaw[]) || [];
    const allVideos = parseVideos(videoList);
    const trailer = videoList.filter(v => v.type === "Trailer" && v.site === "YouTube")
      .sort((a, b) => (b.official ? 1 : 0) - (a.official ? 1 : 0))[0];

    const reviewList = (reviews.results as TmdbReviewRaw[]) || [];
    const allReviews = parseReviews(reviewList);

    const genreList = (details.genres as Array<{ name: string }>) || [];
    const posterPath = details.poster_path as string | null;
    const backdropPath = details.backdrop_path as string | null;
    const firstAir = (details.first_air_date as string) || "";
    const lastAir = (details.last_air_date as string) || "";
    const tvStatus = (details.status as string) || "";
    const year = firstAir ? Number(firstAir.slice(0, 4)) : 0;
    const endYear = (tvStatus === "Ended" && lastAir) ? Number(lastAir.slice(0, 4)) : null;
    const title = (details.name as string) || (details.original_name as string) || "";

    const seasonsRaw = (details.seasons as Array<{ season_number: number; episode_count: number; name: string; poster_path: string | null; air_date: string | null }>) || [];
    const seasons = seasonsRaw
      .filter(s => s.season_number > 0)
      .map(s => ({
        season: s.season_number,
        episodes: s.episode_count,
        name: s.name,
        poster: s.poster_path ? `${TMDB_IMG}/w300${s.poster_path}` : null,
        air_date: s.air_date,
      }));

    const networksRaw = (details.networks as Array<{ name: string }>) || [];
    const networks = networksRaw.map(n => n.name);

    const belongsToCollection = details.belongs_to_collection as { id: number; name: string } | null;

    return {
      imdb_id: imdbId,
      tmdb_id: tmdbId,
      title,
      year,
      end_year: endYear,
      rating: Math.round(((details.vote_average as number) || 0) * 10) / 10,
      genres: genreList.map(g => g.name),
      language: (details.original_language as string) || "en",
      synopsis,
      creators: creatorNames,
      cast_list: castRaw.slice(0, 12).map(c => c.name),
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
      collection_id: belongsToCollection?.id || null,
      collection_name: belongsToCollection?.name || null,
    };
  } catch {
    return null;
  }
}
