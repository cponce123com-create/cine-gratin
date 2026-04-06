import { Router, type IRouter } from "express";

const router: IRouter = Router();

const TMDB_BASE = "https://api.themoviedb.org/3";
const TMDB_IMG = "https://image.tmdb.org/t/p";

function buildHeaders(): Record<string, string> {
  const key = process.env["TMDB_API_KEY"] || "";
  // If it's a Bearer token (long JWT-like string), use Authorization header
  // If it's a short v3 API key, use api_key query param approach via headers
  if (key.length > 50) {
    return {
      "Authorization": `Bearer ${key}`,
      "Content-Type": "application/json",
    };
  }
  // v3 key — we'll append as query param in the URL
  return { "Content-Type": "application/json" };
}

function appendKey(url: string): string {
  const key = process.env["TMDB_API_KEY"] || "";
  if (key.length > 50) return url; // Bearer token, no api_key param needed
  return `${url}${url.includes("?") ? "&" : "?"}api_key=${key}`;
}

async function tmdbFetch(path: string): Promise<Response> {
  return fetch(appendKey(`${TMDB_BASE}${path}`), { headers: buildHeaders() });
}

router.get("/tmdb/movie/:imdbId", async (req, res) => {
  const { imdbId } = req.params;

  if (!imdbId || !/^tt\d+$/.test(imdbId)) {
    res.status(400).json({ error: "ID de IMDb inválido. Debe tener el formato tt1234567" });
    return;
  }

  const key = process.env["TMDB_API_KEY"];
  if (!key) {
    res.status(500).json({ error: "TMDB_API_KEY no configurada en el servidor" });
    return;
  }

  try {
    // Find TMDB ID from IMDb ID
    const findRes = await tmdbFetch(`/find/${imdbId}?external_source=imdb_id`);

    if (!findRes.ok) {
      const err = await findRes.json() as { status_message?: string; status_code?: number };
      if (err.status_code === 7) {
        res.status(401).json({ error: "Clave API de TMDB inválida. Ve a Configuración → Editar Secretos → TMDB_API_KEY y usa la clave API v3 (32 caracteres) de tu cuenta TMDB." });
        return;
      }
      res.status(502).json({ error: err.status_message || "Error al consultar TMDB" });
      return;
    }

    const findData = await findRes.json() as { movie_results?: { id: number }[] };
    const tmdbMovie = findData.movie_results?.[0];

    if (!tmdbMovie) {
      res.status(404).json({ error: "Película no encontrada en TMDB con ese ID de IMDb" });
      return;
    }

    const tmdbId = tmdbMovie.id;
    const langParam = "language=es-MX";

    // Fetch full details + credits + videos + images in parallel
    const [detailsRes, creditsRes, videosRes, imagesRes] = await Promise.all([
      tmdbFetch(`/movie/${tmdbId}?${langParam}`),
      tmdbFetch(`/movie/${tmdbId}/credits?${langParam}`),
      tmdbFetch(`/movie/${tmdbId}/videos?${langParam}&include_video_language=es,en`),
      tmdbFetch(`/movie/${tmdbId}/images?include_image_language=es,en,null`),
    ]);

    const [details, credits, videos, images] = await Promise.all([
      detailsRes.json(),
      creditsRes.json(),
      videosRes.json(),
      imagesRes.json(),
    ]) as [Record<string, unknown>, Record<string, unknown>, Record<string, unknown>, Record<string, unknown>];

    // If Spanish overview is empty, fetch English
    let synopsis = (details.overview as string) || "";
    if (!synopsis) {
      const enRes = await tmdbFetch(`/movie/${tmdbId}?language=en-US`);
      const enData = await enRes.json() as Record<string, unknown>;
      synopsis = (enData.overview as string) || "";
    }

    // Director
    const crew = (credits.crew as Array<{ job: string; name: string }>) || [];
    const director = crew.find(c => c.job === "Director")?.name || "";

    // Cast (top 12)
    const castRaw = (credits.cast as Array<{ name: string; character: string; profile_path: string | null; order: number }>) || [];
    const cast = castRaw
      .sort((a, b) => a.order - b.order)
      .slice(0, 12)
      .map(c => ({
        name: c.name,
        character: c.character,
        profile: c.profile_path ? `${TMDB_IMG}/w185${c.profile_path}` : null,
      }));

    // Trailer — prefer Spanish, fallback English
    const videoList = (videos.results as Array<{ type: string; site: string; key: string; iso_639_1: string; official?: boolean }>) || [];
    const trailer =
      videoList.find(v => v.type === "Trailer" && v.site === "YouTube" && v.iso_639_1 === "es") ||
      videoList.find(v => v.type === "Trailer" && v.site === "YouTube" && v.official) ||
      videoList.find(v => v.type === "Trailer" && v.site === "YouTube") ||
      videoList.find(v => v.site === "YouTube");

    // Genres
    const genreList = (details.genres as Array<{ name: string }>) || [];
    const genres = genreList.map(g => g.name);

    // Images
    const backdropPath = details.backdrop_path as string | null;
    const posterPath = details.poster_path as string | null;

    const backdropList = (images.backdrops as Array<{ file_path: string; vote_average: number }>) || [];
    const extraBackdrops = backdropList
      .sort((a, b) => b.vote_average - a.vote_average)
      .slice(0, 5)
      .map(b => `${TMDB_IMG}/original${b.file_path}`);

    const posterList = (images.posters as Array<{ file_path: string; vote_average: number }>) || [];
    const extraPosters = posterList
      .sort((a, b) => b.vote_average - a.vote_average)
      .slice(0, 6)
      .map(p => `${TMDB_IMG}/w500${p.file_path}`);

    const companies = (details.production_companies as Array<{ name: string }>) || [];
    const langs = (details.spoken_languages as Array<{ name: string }>) || [];

    const result = {
      imdb_id: imdbId,
      tmdb_id: tmdbId,
      title: (details.title as string) || (details.original_title as string) || "",
      original_title: (details.original_title as string) || "",
      year: details.release_date
        ? Number((details.release_date as string).slice(0, 4))
        : new Date().getFullYear(),
      release_date: (details.release_date as string) || "",
      rating: Math.round(((details.vote_average as number) || 0) * 10) / 10,
      vote_count: (details.vote_count as number) || 0,
      runtime: (details.runtime as number) || 0,
      synopsis,
      tagline: (details.tagline as string) || "",
      genres,
      language: (details.original_language as string) || "en",
      spoken_languages: langs.map(l => l.name),
      director,
      cast,
      poster_url: posterPath ? `${TMDB_IMG}/w500${posterPath}` : "",
      poster_original: posterPath ? `${TMDB_IMG}/original${posterPath}` : "",
      background_url: backdropPath ? `${TMDB_IMG}/original${backdropPath}` : "",
      extra_backdrops: extraBackdrops,
      extra_posters: extraPosters,
      yt_trailer_code: trailer?.key || "",
      mpa_rating: "NR",
      budget: (details.budget as number) || 0,
      revenue: (details.revenue as number) || 0,
      production_companies: companies.map(c => c.name),
      homepage: (details.homepage as string) || "",
    };

    res.json(result);
  } catch (err) {
    console.error("TMDB fetch error:", err);
    res.status(500).json({ error: "Error al conectar con TMDB. Intenta de nuevo." });
  }
});

// GET /api/tmdb/series/:imdbId — fetch TV series data from TMDB
router.get("/tmdb/series/:imdbId", async (req, res) => {
  const { imdbId } = req.params;

  if (!imdbId || !/^tt\d+$/.test(imdbId)) {
    res.status(400).json({ error: "ID de IMDb inválido. Formato: tt1234567" });
    return;
  }

  const key = process.env["TMDB_API_KEY"];
  if (!key) {
    res.status(500).json({ error: "TMDB_API_KEY no configurada" });
    return;
  }

  try {
    // Find TMDB TV ID from IMDb ID
    const findRes = await tmdbFetch(`/find/${imdbId}?external_source=imdb_id`);
    if (!findRes.ok) {
      const err = await findRes.json() as { status_message?: string; status_code?: number };
      if (err.status_code === 7) {
        res.status(401).json({ error: "Clave API de TMDB inválida." });
        return;
      }
      res.status(502).json({ error: err.status_message || "Error al consultar TMDB" });
      return;
    }

    const findData = await findRes.json() as { tv_results?: { id: number }[] };
    const tvResult = findData.tv_results?.[0];

    if (!tvResult) {
      res.status(404).json({ error: "Serie no encontrada en TMDB con ese ID de IMDb. Asegúrate de que el ID corresponde a una serie de TV." });
      return;
    }

    const tmdbId = tvResult.id;
    const langParam = "language=es-MX";

    // Fetch full details + credits + videos + images in parallel
    const [detailsRes, creditsRes, videosRes, imagesRes] = await Promise.all([
      tmdbFetch(`/tv/${tmdbId}?${langParam}&append_to_response=external_ids`),
      tmdbFetch(`/tv/${tmdbId}/credits?${langParam}`),
      tmdbFetch(`/tv/${tmdbId}/videos?${langParam}&include_video_language=es,en`),
      tmdbFetch(`/tv/${tmdbId}/images?include_image_language=es,en,null`),
    ]);

    const [details, credits, videos, images] = await Promise.all([
      detailsRes.json(),
      creditsRes.json(),
      videosRes.json(),
      imagesRes.json(),
    ]) as [Record<string, unknown>, Record<string, unknown>, Record<string, unknown>, Record<string, unknown>];

    // Spanish synopsis fallback
    let synopsis = (details.overview as string) || "";
    if (!synopsis) {
      const enRes = await tmdbFetch(`/tv/${tmdbId}?language=en-US`);
      const enData = await enRes.json() as Record<string, unknown>;
      synopsis = (enData.overview as string) || "";
    }

    // Creators
    const createdBy = (details.created_by as Array<{ name: string }>) || [];
    const creators = createdBy.map(c => c.name);

    // Cast (top 12)
    const castRaw = (credits.cast as Array<{ name: string; character: string; profile_path: string | null; order: number }>) || [];
    const cast = castRaw
      .sort((a, b) => a.order - b.order)
      .slice(0, 12)
      .map(c => ({
        name: c.name,
        character: c.character,
        profile: c.profile_path ? `${TMDB_IMG}/w185${c.profile_path}` : null,
      }));

    // Trailer
    const videoList = (videos.results as Array<{ type: string; site: string; key: string; iso_639_1: string; official?: boolean }>) || [];
    const trailer =
      videoList.find(v => v.type === "Trailer" && v.site === "YouTube" && v.iso_639_1 === "es") ||
      videoList.find(v => v.type === "Trailer" && v.site === "YouTube" && v.official) ||
      videoList.find(v => v.type === "Trailer" && v.site === "YouTube") ||
      videoList.find(v => v.site === "YouTube");

    // Genres
    const genreList = (details.genres as Array<{ name: string }>) || [];

    // Images
    const backdropPath = details.backdrop_path as string | null;
    const posterPath = details.poster_path as string | null;
    const backdropList = (images.backdrops as Array<{ file_path: string; vote_average: number }>) || [];
    const extraBackdrops = backdropList.sort((a, b) => b.vote_average - a.vote_average).slice(0, 5).map(b => `${TMDB_IMG}/original${b.file_path}`);
    const posterList = (images.posters as Array<{ file_path: string; vote_average: number }>) || [];
    const extraPosters = posterList.sort((a, b) => b.vote_average - a.vote_average).slice(0, 6).map(p => `${TMDB_IMG}/w500${p.file_path}`);

    // Seasons (skip specials = season 0)
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

    const firstAir = details.first_air_date as string | null;
    const lastAir = details.last_air_date as string | null;
    const tvStatus = details.status as string || "";

    res.json({
      imdb_id: imdbId,
      tmdb_id: tmdbId,
      title: (details.name as string) || (details.original_name as string) || "",
      original_title: (details.original_name as string) || "",
      year: firstAir ? Number(firstAir.slice(0, 4)) : 0,
      end_year: (tvStatus === "Ended" && lastAir) ? Number(lastAir.slice(0, 4)) : null,
      rating: Math.round(((details.vote_average as number) || 0) * 10) / 10,
      vote_count: (details.vote_count as number) || 0,
      genres: genreList.map(g => g.name),
      language: (details.original_language as string) || "en",
      synopsis,
      creators,
      cast,
      poster_url: posterPath ? `${TMDB_IMG}/w500${posterPath}` : "",
      poster_original: posterPath ? `${TMDB_IMG}/original${posterPath}` : "",
      background_url: backdropPath ? `${TMDB_IMG}/original${backdropPath}` : "",
      extra_backdrops: extraBackdrops,
      extra_posters: extraPosters,
      yt_trailer_code: trailer?.key || "",
      status: tvStatus,
      total_seasons: (details.number_of_seasons as number) || seasons.length,
      total_episodes: (details.number_of_episodes as number) || 0,
      seasons,
      homepage: (details.homepage as string) || "",
    });
  } catch (err) {
    console.error("TMDB series fetch error:", err);
    res.status(500).json({ error: "Error al conectar con TMDB. Intenta de nuevo." });
  }
});

export default router;
