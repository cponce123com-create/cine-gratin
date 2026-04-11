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

// GET /api/tmdb/person/:personId — fetch actor/person profile from TMDB
router.get("/tmdb/person/:personId", async (req, res) => {
  const personId = parseInt(req.params["personId"] ?? "", 10);
  if (isNaN(personId)) { res.status(400).json({ error: "ID de persona inválido" }); return; }

  try {
    const [detailsRes, creditsRes, imagesRes] = await Promise.all([
      tmdbFetch(`/person/${personId}?language=es-MX`),
      tmdbFetch(`/person/${personId}/combined_credits?language=es-MX`),
      tmdbFetch(`/person/${personId}/images`),
    ]);

    if (!detailsRes.ok) { res.status(404).json({ error: "Persona no encontrada" }); return; }

    const [details, credits, images] = await Promise.all([
      detailsRes.json(),
      creditsRes.ok ? creditsRes.json() : Promise.resolve({ cast: [] }),
      imagesRes.ok ? imagesRes.json() : Promise.resolve({ profiles: [] }),
    ]) as [Record<string, unknown>, Record<string, unknown>, Record<string, unknown>];

    // Biography fallback to English
    let biography = (details.biography as string) || "";
    if (!biography) {
      const enRes = await tmdbFetch(`/person/${personId}?language=en-US`);
      if (enRes.ok) {
        const enData = await enRes.json() as Record<string, unknown>;
        biography = (enData.biography as string) || "";
      }
    }

    // Known for: top 8 most popular works
    const castCredits = (credits.cast as Array<{
      id: number; title?: string; name?: string; media_type: string;
      poster_path?: string | null; release_date?: string; first_air_date?: string;
      vote_average?: number; character?: string; popularity?: number;
    }>) || [];

    const knownFor = [...castCredits]
      .sort((a, b) => (b.popularity || 0) - (a.popularity || 0))
      .slice(0, 12)
      .map(c => ({
        id: c.id,
        media_type: c.media_type,
        title: c.title || c.name || "",
        character: c.character || "",
        poster_url: c.poster_path ? `${TMDB_IMG}/w185${c.poster_path}` : "",
        year: (c.release_date || c.first_air_date || "").slice(0, 4),
        rating: Math.round((c.vote_average || 0) * 10) / 10,
      }));

    // All credits sorted by date desc
    const allCredits = [...castCredits]
      .sort((a, b) => {
        const da = (a.release_date || a.first_air_date || "0000");
        const db = (b.release_date || b.first_air_date || "0000");
        return db.localeCompare(da);
      })
      .slice(0, 40)
      .map(c => ({
        id: c.id,
        media_type: c.media_type,
        title: c.title || c.name || "",
        character: c.character || "",
        year: (c.release_date || c.first_air_date || "").slice(0, 4),
        poster_url: c.poster_path ? `${TMDB_IMG}/w92${c.poster_path}` : "",
      }));

    // Profile photos
    const profileList = (images.profiles as Array<{ file_path: string; vote_average: number }>) || [];
    const profilePhotos = profileList
      .sort((a, b) => b.vote_average - a.vote_average)
      .slice(0, 6)
      .map(p => `${TMDB_IMG}/w185${p.file_path}`);

    const profilePath = details.profile_path as string | null;

    res.setHeader("Cache-Control", "public, max-age=3600");
    res.json({
      id: personId,
      name: (details.name as string) || "",
      biography,
      birthday: (details.birthday as string) || null,
      deathday: (details.deathday as string) || null,
      place_of_birth: (details.place_of_birth as string) || null,
      known_for_department: (details.known_for_department as string) || "",
      profile_url: profilePath ? `${TMDB_IMG}/w342${profilePath}` : "",
      profile_photos: profilePhotos,
      known_for: knownFor,
      all_credits: allCredits,
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// GET /api/tmdb/media/:imdbId?type=movie|series
// Devuelve galería completa de imágenes (backdrops + posters) y recomendaciones desde TMDB.
// Se llama de forma lazy desde el frontend cuando el usuario llega a esa sección.
router.get("/tmdb/media/:imdbId", async (req, res) => {
  const imdbId = req.params["imdbId"] as string;
  const type = req.query.type === "series" ? "series" : "movie";

  if (!imdbId) { res.status(400).json({ error: "Se requiere imdbId" }); return; }

  try {
    // Find TMDB id from imdb_id
    const findRes = await tmdbFetch(`/find/${imdbId}?external_source=imdb_id`);
    if (!findRes.ok) { res.status(502).json({ error: "Error al consultar TMDB" }); return; }

    const findData = await findRes.json() as {
      movie_results?: { id: number }[];
      tv_results?: { id: number }[];
    };

    const tmdbId = type === "series"
      ? findData.tv_results?.[0]?.id
      : findData.movie_results?.[0]?.id;

    if (!tmdbId) { res.status(404).json({ error: "No encontrado en TMDB" }); return; }

    const endpoint = type === "series" ? "tv" : "movie";

    // Fetch images and recommendations in parallel
    const [imagesRes, recommendationsRes] = await Promise.all([
      tmdbFetch(`/${endpoint}/${tmdbId}/images?include_image_language=es,en,null`),
      tmdbFetch(`/${endpoint}/${tmdbId}/recommendations?language=es-MX&page=1`),
    ]);

    const [imagesData, recsData] = await Promise.all([
      imagesRes.ok ? imagesRes.json() : Promise.resolve({ backdrops: [], posters: [] }),
      recommendationsRes.ok ? recommendationsRes.json() : Promise.resolve({ results: [] }),
    ]) as [
      { backdrops?: Array<{ file_path: string; vote_average: number; width: number; height: number }>;
        posters?: Array<{ file_path: string; vote_average: number; iso_639_1: string }> },
      { results?: Array<{ id: number; title?: string; name?: string; poster_path?: string | null;
          release_date?: string; first_air_date?: string; vote_average?: number; media_type?: string }> }
    ];

    // Backdrops: sort by vote_average, return up to 20
    const backdrops = (imagesData.backdrops ?? [])
      .sort((a, b) => b.vote_average - a.vote_average)
      .slice(0, 20)
      .map(b => ({
        url: `${TMDB_IMG}/w1280${b.file_path}`,
        url_original: `${TMDB_IMG}/original${b.file_path}`,
        thumb: `${TMDB_IMG}/w300${b.file_path}`,
        vote_average: b.vote_average,
      }));

    // Posters: show all languages, prioritize rated ones, up to 30
    const posters = (imagesData.posters ?? [])
      .sort((a, b) => {
        // Spanish/English first, then by vote
        const langA = a.iso_639_1 === "es" ? 2 : a.iso_639_1 === "en" ? 1 : 0;
        const langB = b.iso_639_1 === "es" ? 2 : b.iso_639_1 === "en" ? 1 : 0;
        if (langA !== langB) return langB - langA;
        return b.vote_average - a.vote_average;
      })
      .slice(0, 30)
      .map(p => ({
        url: `${TMDB_IMG}/w500${p.file_path}`,
        url_original: `${TMDB_IMG}/original${p.file_path}`,
        thumb: `${TMDB_IMG}/w185${p.file_path}`,
        lang: p.iso_639_1,
      }));

    // Recommendations: top 12
    const recommendations = (recsData.results ?? [])
      .slice(0, 12)
      .map(r => ({
        tmdb_id: r.id,
        media_type: r.media_type ?? type,
        title: r.title || r.name || "",
        poster_url: r.poster_path ? `${TMDB_IMG}/w342${r.poster_path}` : "",
        year: (r.release_date || r.first_air_date || "").slice(0, 4),
        rating: Math.round((r.vote_average || 0) * 10) / 10,
      }));

    res.setHeader("Cache-Control", "public, max-age=3600");
    res.json({ backdrops, posters, recommendations });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});


const cache = new Map<string, { data: unknown; expires: number }>();
function fromCache<T>(key: string): T | null {
  const entry = cache.get(key);
  if (entry && entry.expires > Date.now()) return entry.data as T;
  return null;
}
function toCache(key: string, data: unknown, ttlMs = 30 * 60 * 1000) {
  cache.set(key, { data, expires: Date.now() + ttlMs });
}

// GET /api/tmdb/images/:imdbId?type=movie|series
router.get("/tmdb/images/:imdbId", async (req, res) => {
  const { imdbId } = req.params;
  const type = req.query.type === "series" ? "series" : "movie";
  const cacheKey = `images_${imdbId}_${type}`;

  const cached = fromCache<unknown>(cacheKey);
  if (cached) { res.setHeader("Cache-Control", "public, max-age=3600"); res.json(cached); return; }

  try {
    const findRes = await tmdbFetch(`/find/${imdbId}?external_source=imdb_id`);
    if (!findRes.ok) { res.status(502).json({ error: "Error TMDB" }); return; }
    const findData = await findRes.json() as { movie_results?: { id: number }[]; tv_results?: { id: number }[] };
    const tmdbId = type === "series" ? findData.tv_results?.[0]?.id : findData.movie_results?.[0]?.id;
    if (!tmdbId) { res.status(404).json({ error: "No encontrado en TMDB" }); return; }

    const endpoint = type === "series" ? "tv" : "movie";
    const imagesRes = await tmdbFetch(`/${endpoint}/${tmdbId}/images?include_image_language=es,en,null`);
    if (!imagesRes.ok) { res.status(502).json({ error: "Error al obtener imágenes" }); return; }

    const images = await imagesRes.json() as {
      backdrops?: Array<{ file_path: string; vote_average: number }>;
      posters?: Array<{ file_path: string; vote_average: number }>;
    };

    const backdrops = (images.backdrops ?? [])
      .sort((a, b) => b.vote_average - a.vote_average)
      .slice(0, 20)
      .map(b => ({
        url: `${TMDB_IMG}/w1280${b.file_path}`,
        url_original: `${TMDB_IMG}/original${b.file_path}`,
        thumb: `${TMDB_IMG}/w300${b.file_path}`,
      }));

    const posters = (images.posters ?? [])
      .sort((a, b) => b.vote_average - a.vote_average)
      .slice(0, 20)
      .map(p => ({
        url: `${TMDB_IMG}/w500${p.file_path}`,
        url_original: `${TMDB_IMG}/original${p.file_path}`,
        thumb: `${TMDB_IMG}/w185${p.file_path}`,
      }));

    const result = { backdrops, posters };
    toCache(cacheKey, result, 60 * 60 * 1000);
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// GET /api/tmdb/recommendations/:imdbId?type=movie|series
router.get("/tmdb/recommendations/:imdbId", async (req, res) => {
  const { imdbId } = req.params;
  const type = req.query.type === "series" ? "series" : "movie";
  const cacheKey = `recs_${imdbId}_${type}`;

  const cached = fromCache<unknown>(cacheKey);
  if (cached) { res.setHeader("Cache-Control", "public, max-age=3600"); res.json(cached); return; }

  try {
    const findRes = await tmdbFetch(`/find/${imdbId}?external_source=imdb_id`);
    if (!findRes.ok) { res.status(502).json({ error: "Error TMDB" }); return; }
    const findData = await findRes.json() as { movie_results?: { id: number }[]; tv_results?: { id: number }[] };
    const tmdbId = type === "series" ? findData.tv_results?.[0]?.id : findData.movie_results?.[0]?.id;
    if (!tmdbId) { res.status(404).json({ error: "No encontrado" }); return; }

    const endpoint = type === "series" ? "tv" : "movie";
    const [recsRes, simRes] = await Promise.all([
      tmdbFetch(`/${endpoint}/${tmdbId}/recommendations?language=es-MX`),
      tmdbFetch(`/${endpoint}/${tmdbId}/similar?language=es-MX`),
    ]);

    type TmdbItem = {
      id: number; title?: string; name?: string;
      poster_path?: string | null; backdrop_path?: string | null;
      release_date?: string; first_air_date?: string;
      vote_average?: number; overview?: string;
    };

    const recsData = recsRes.ok ? await recsRes.json() as { results: TmdbItem[] } : { results: [] };
    const simData = simRes.ok ? await simRes.json() as { results: TmdbItem[] } : { results: [] };

    const seen = new Set<number>();
    const merged: TmdbItem[] = [];
    for (const item of [...(recsData.results ?? []), ...(simData.results ?? [])]) {
      if (!seen.has(item.id)) { seen.add(item.id); merged.push(item); }
    }

    const results = merged.slice(0, 18).map(item => ({
      tmdb_id: item.id,
      media_type: type === "series" ? "tv" : "movie",
      title: item.title || item.name || "",
      poster_url: item.poster_path ? `${TMDB_IMG}/w342${item.poster_path}` : "",
      year: (item.release_date || item.first_air_date || "").slice(0, 4),
      rating: Math.round((item.vote_average || 0) * 10) / 10,
      overview: (item.overview || "").slice(0, 120),
    }));

    toCache(cacheKey, results, 60 * 60 * 1000);
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.json(results);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// GET /api/tmdb/trending?window=day|week
// Devuelve las tendencias del día o de la semana desde TMDB
router.get("/tmdb/trending", async (req, res) => {
  const window = req.query.window === "week" ? "week" : "day";
  const cacheKey = `trending_${window}`;

  const cached = fromCache<unknown[]>(cacheKey);
  if (cached) { res.json(cached); return; }

  try {
    const r = await tmdbFetch(`/trending/all/${window}?language=es-MX`);
    if (!r.ok) { res.status(502).json({ error: "Error al consultar TMDB" }); return; }

    const data = await r.json() as {
      results: {
        id: number;
        media_type: "movie" | "tv";
        title?: string;
        name?: string;
        poster_path?: string | null;
        backdrop_path?: string | null;
        release_date?: string;
        first_air_date?: string;
        vote_average?: number;
        overview?: string;
      }[];
    };

    const results = (data.results ?? []).slice(0, 20).map(item => ({
      tmdb_id: item.id,
      media_type: item.media_type,
      title: item.title || item.name || "",
      poster_url: item.poster_path ? `${TMDB_IMG}/w342${item.poster_path}` : "",
      backdrop_url: item.backdrop_path ? `${TMDB_IMG}/w780${item.backdrop_path}` : "",
      year: (item.release_date || item.first_air_date || "").slice(0, 4),
      rating: Math.round((item.vote_average || 0) * 10) / 10,
      overview: (item.overview || "").slice(0, 180),
    }));

    toCache(cacheKey, results);
    res.setHeader("Cache-Control", "public, max-age=1800");
    res.json(results);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// GET /api/tmdb/trailers?type=popular|streaming|theatres
// Devuelve películas/series trending con su tráiler de YouTube
router.get("/tmdb/trailers", async (req, res) => {
  const type = (req.query.type as string) || "popular";
  const cacheKey = `trailers_${type}`;

  const cached = fromCache<unknown[]>(cacheKey);
  if (cached) { res.json(cached); return; }

  try {
    // Endpoint según el tipo de filtro
    let endpoint = "/trending/movie/day?language=es-MX";
    if (type === "streaming") endpoint = "/discover/movie?language=es-MX&sort_by=popularity.desc&with_watch_monetization_types=flatrate";
    if (type === "theatres")  endpoint = "/movie/now_playing?language=es-MX&region=MX";

    const listRes = await tmdbFetch(endpoint);
    if (!listRes.ok) { res.status(502).json({ error: "Error al consultar TMDB" }); return; }
    const listData = await listRes.json() as { results: { id: number; title?: string; name?: string; backdrop_path?: string | null; poster_path?: string | null; release_date?: string; first_air_date?: string }[] };

    const items = (listData.results ?? []).slice(0, 15);

    // Para cada item buscar tráiler en paralelo (máx 10 simultáneos)
    const withTrailers = await Promise.all(
      items.map(async (item) => {
        try {
          const vRes = await tmdbFetch(`/movie/${item.id}/videos?language=es-MX&include_video_language=es,en`);
          if (!vRes.ok) return null;
          const vData = await vRes.json() as { results: { type: string; site: string; key: string; iso_639_1: string; official?: boolean; name?: string }[] };
          const videos = vData.results ?? [];
          const trailer =
            videos.find(v => v.type === "Trailer" && v.site === "YouTube" && v.iso_639_1 === "es") ||
            videos.find(v => v.type === "Trailer" && v.site === "YouTube" && v.official) ||
            videos.find(v => v.type === "Trailer" && v.site === "YouTube") ||
            videos.find(v => v.site === "YouTube");

          if (!trailer) return null;

          return {
            tmdb_id: item.id,
            media_type: "movie" as const,
            title: item.title || item.name || "",
            backdrop_url: item.backdrop_path ? `${TMDB_IMG}/w780${item.backdrop_path}` : "",
            poster_url: item.poster_path ? `${TMDB_IMG}/w342${item.poster_path}` : "",
            year: (item.release_date || item.first_air_date || "").slice(0, 4),
            trailer_key: trailer.key,
            trailer_name: trailer.name || "Tráiler oficial",
            youtube_url: `https://www.youtube.com/watch?v=${trailer.key}`,
            thumbnail_url: `https://img.youtube.com/vi/${trailer.key}/mqdefault.jpg`,
          };
        } catch { return null; }
      })
    );

    const results = withTrailers.filter(Boolean).slice(0, 10);
    toCache(cacheKey, results, 30 * 60 * 1000);
    res.setHeader("Cache-Control", "public, max-age=1800");
    res.json(results);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// GET /api/tmdb/collections/search?query=... — search TMDB collections
router.get("/tmdb/collections/search", async (req, res) => {
  const { query } = req.query;
  if (!query) {
    res.status(400).json({ error: "Falta el parámetro query" });
    return;
  }

  try {
    const searchRes = await tmdbFetch(`/search/collection?query=${encodeURIComponent(query as string)}&language=es-MX`);
    if (!searchRes.ok) {
      const err = await searchRes.json() as { status_message?: string };
      res.status(502).json({ error: err.status_message || "Error al buscar colecciones en TMDB" });
      return;
    }

    const data = await searchRes.json() as { results: any[] };
    const results = data.results.map(c => ({
      id: c.id,
      name: c.name,
      poster_path: c.poster_path ? `${TMDB_IMG}/w342${c.poster_path}` : null,
      backdrop_path: c.backdrop_path ? `${TMDB_IMG}/w780${c.backdrop_path}` : null,
    }));

    res.json(results);
  } catch (err) {
    console.error("TMDB collection search error:", err);
    res.status(500).json({ error: "Error al conectar con TMDB" });
  }
});

export default router;

