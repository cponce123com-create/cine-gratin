import { Router, type IRouter } from "express";
import { pool } from "../lib/db";
import { runAutoImport, importByImdbId, importMovie, importSeries } from "../jobs/auto-import";
import { fetchMovieByTmdbId, fetchSeriesByTmdbId, tmdbFetch } from "../lib/tmdb-client";

const router: IRouter = Router();

// GET /api/admin/stats
router.get("/admin/stats", async (_req, res) => {
  try {
    const [moviesCount, seriesCount, totalViews, topMovies, topSeries, recentTrends] = await Promise.all([
      pool.query("SELECT COUNT(DISTINCT imdb_id) as count FROM movies WHERE vidsrc_status = 'active'"),
      pool.query("SELECT COUNT(DISTINCT imdb_id) as count FROM cv_series WHERE vidsrc_status = 'active'"),
      pool.query(`
        SELECT 
          (SELECT COALESCE(SUM(views), 0) FROM movies) + 
          (SELECT COALESCE(SUM(views), 0) FROM cv_series) as total
      `),
      pool.query("SELECT id, title, views, poster_url FROM movies ORDER BY views DESC LIMIT 10"),
      pool.query("SELECT id, title, views, poster_url FROM cv_series ORDER BY views DESC LIMIT 10"),
      // Simulación de tendencias por fecha de agregado (ya que no hay tabla de logs de vistas por día)
      pool.query(`
        SELECT date_trunc('day', date_added) as day, COUNT(*) as count 
        FROM (
          SELECT date_added FROM movies 
          UNION ALL 
          SELECT date_added FROM cv_series
        ) combined
        WHERE date_added > NOW() - INTERVAL '30 days'
        GROUP BY day 
        ORDER BY day ASC
      `),
    ]);

    res.json({
      global: {
        movies: Number(moviesCount.rows[0]?.count ?? 0),
        series: Number(seriesCount.rows[0]?.count ?? 0),
        totalViews: Number(totalViews.rows[0]?.total ?? 0),
      },
      top10: {
        movies: topMovies.rows,
        series: topSeries.rows,
      },
      trends: recentTrends.rows.map(r => ({
        date: r.day,
        count: Number(r.count ?? 0),
      })),
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// GET /api/admin/auto-import/status
router.get("/admin/auto-import/status", async (_req, res) => {
  try {
    const [settingsRes, logsRes] = await Promise.all([
      pool.query("SELECT value FROM cv_settings WHERE key = 'auto_import_enabled'"),
      pool.query("SELECT * FROM cv_auto_import_log ORDER BY run_at DESC LIMIT 5"),
    ]);

    const enabled = settingsRes.rows[0]?.value !== "false";
    const logs = logsRes.rows.map(r => ({
      id: r.id,
      run_at: r.run_at,
      movies_imported: Number(r.movies_imported),
      series_imported: Number(r.series_imported),
      total_checked: Number(r.total_checked),
      status: r.status,
      error_message: r.error_message,
    }));

    res.json({ enabled, logs });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// POST /api/admin/auto-import/toggle
router.post("/admin/auto-import/toggle", async (req, res) => {
  const { enabled } = req.body as { enabled: boolean };
  try {
    await pool.query(
      `INSERT INTO cv_settings (key, value) VALUES ('auto_import_enabled', $1)
       ON CONFLICT (key) DO UPDATE SET value = $1`,
      [enabled ? "true" : "false"]
    );
    res.json({ ok: true, enabled });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// POST /api/admin/auto-import/run
router.post("/admin/auto-import/run", async (req, res) => {
  const { sources } = req.body as { sources?: string[] };
  try {
    const result = await runAutoImport(sources);
    res.json({
      ok: true,
      movies_imported: result.moviesImported,
      series_imported: result.seriesImported,
      total_checked: result.totalChecked,
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// POST /api/admin/import-by-ids — import specific IMDb IDs via TMDB lookup
router.post("/admin/import-by-ids", async (req, res) => {
  const { imdb_ids, type = "movie" } = req.body as { imdb_ids: string[]; type?: "movie" | "series" };

  if (!Array.isArray(imdb_ids) || imdb_ids.length === 0) {
    return res.status(400).json({ error: "Se requiere un array imdb_ids" });
  }

  const results = [];
  for (const imdbId of imdb_ids.slice(0, 1000)) {
    const result = await importByImdbId(imdbId, type as "movie" | "series");
    results.push(result);
  }

  const summary = {
    imported: results.filter(r => r.status === "imported").length,
    existed: results.filter(r => r.status === "existed").length,
    not_found: results.filter(r => r.status === "not_found").length,
    error: results.filter(r => r.status === "error").length,
  };

  return res.json({ ok: true, results, summary });
});

// POST /api/admin/verify-vidsrc
router.post("/admin/verify-vidsrc", async (req, res) => {
  const { results: clientResults } = req.body as {
    results: { imdb_id: string; type: "movie" | "series"; available: boolean }[];
  };

  if (!Array.isArray(clientResults) || clientResults.length === 0) {
    return res.status(400).json({ error: "Se requiere un array results" });
  }

  try {
    // Separar por tipo y estado
    const movieActive   = clientResults.filter(r => r.type === "movie"   && r.available).map(r => r.imdb_id);
    const movieInactive = clientResults.filter(r => r.type === "movie"   && !r.available).map(r => r.imdb_id);
    const seriesActive  = clientResults.filter(r => r.type === "series"  && r.available).map(r => r.imdb_id);
    const seriesInactive= clientResults.filter(r => r.type === "series"  && !r.available).map(r => r.imdb_id);

    // Un solo UPDATE por grupo usando ANY($1)
    if (movieActive.length)    await pool.query("UPDATE movies     SET vidsrc_status = 'active'   WHERE imdb_id = ANY($1)", [movieActive]);
    if (movieInactive.length)  await pool.query("UPDATE movies     SET vidsrc_status = 'inactive' WHERE imdb_id = ANY($1)", [movieInactive]);
    if (seriesActive.length)   await pool.query("UPDATE cv_series  SET vidsrc_status = 'active'   WHERE imdb_id = ANY($1)", [seriesActive]);
    if (seriesInactive.length) await pool.query("UPDATE cv_series  SET vidsrc_status = 'inactive' WHERE imdb_id = ANY($1)", [seriesInactive]);

    return res.json({ saved: clientResults.length, active: movieActive.length + seriesActive.length, inactive: movieInactive.length + seriesActive.length });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
});

// GET /api/admin/scan-networks-stream — SSE stream para escanear productoras con progreso
router.get("/admin/scan-networks-stream", async (req, res) => {
  const type = (req.query.type as string) === "series" ? "series" : "movie";
  const table = type === "series" ? "cv_series" : "movies";

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const { rows: items } = await pool.query(
      `SELECT id, imdb_id, title, networks FROM ${table} ORDER BY date_added DESC`,
      []
    );

    send("start", { total: items.length });

    let updated = 0, no_change = 0, error = 0;

    for (let i = 0; i < items.length; i++) {
      if (req.destroyed) break;
      const item = items[i];
      try {
        if (!item.imdb_id) {
          error++;
          send("progress", { i: i + 1, total: items.length, title: item.title, status: "error", updated, no_change, error });
          continue;
        }

        const findRes = await tmdbFetch(`/find/${item.imdb_id}?external_source=imdb_id`);
        if (!findRes.ok) { error++; send("progress", { i: i + 1, total: items.length, title: item.title, status: "error", updated, no_change, error }); continue; }
        const findData = await findRes.json() as any;
        const tmdbResults = type === "series" ? findData.tv_results : findData.movie_results;
        if (!tmdbResults?.length) { error++; send("progress", { i: i + 1, total: items.length, title: item.title, status: "error", updated, no_change, error }); continue; }

        const tmdbId = tmdbResults[0].id;
        const data = type === "series" ? await fetchSeriesByTmdbId(tmdbId) : await fetchMovieByTmdbId(tmdbId);
        if (!data?.networks) { error++; send("progress", { i: i + 1, total: items.length, title: item.title, status: "error", updated, no_change, error }); continue; }

        const newNetworks = data.networks as string[];
        const oldNetworks = (item.networks || []) as string[];
        const isDifferent = JSON.stringify([...newNetworks].sort()) !== JSON.stringify([...oldNetworks].sort());

        if (isDifferent) {
          await pool.query(`UPDATE ${table} SET networks = $1 WHERE id = $2`, [newNetworks, item.id]);
          updated++;
          send("progress", { i: i + 1, total: items.length, title: item.title, status: "updated", new_networks: newNetworks, updated, no_change, error });
        } else {
          no_change++;
          send("progress", { i: i + 1, total: items.length, title: item.title, status: "no_change", updated, no_change, error });
        }
      } catch (err) {
        error++;
        send("progress", { i: i + 1, total: items.length, title: item.title, status: "error", updated, no_change, error });
      }
    }

    send("done", { total: items.length, updated, no_change, error });
    res.end();
  } catch (e) {
    send("error", { message: String(e) });
    res.end();
  }
});

// POST /api/admin/scan-networks — scan existing media to update networks/production companies
router.post("/admin/scan-networks", async (req, res) => {
  const { type = "movie", limit = 1000 } = req.body as { type?: "movie" | "series"; limit?: number };
  const table = type === "series" ? "cv_series" : "movies";

  try {
    const { rows: items } = await pool.query(
      `SELECT id, imdb_id, title, networks FROM ${table} ORDER BY date_added DESC LIMIT $1`,
      [limit]
    );

    const results = [];
    for (const item of items) {
      try {
        if (!item.imdb_id) { results.push({ id: item.id, title: item.title, status: "error", error: "No IMDb ID" }); continue; }
        const findRes = await tmdbFetch(`/find/${item.imdb_id}?external_source=imdb_id`);
        if (!findRes.ok) { results.push({ id: item.id, title: item.title, status: "error", error: "TMDB find failed" }); continue; }
        const findData = await findRes.json() as any;
        const tmdbResults = type === "series" ? findData.tv_results : findData.movie_results;
        if (!tmdbResults?.length) { results.push({ id: item.id, title: item.title, status: "error", error: "Not found on TMDB" }); continue; }
        const tmdbId = tmdbResults[0].id;
        const data = type === "series" ? await fetchSeriesByTmdbId(tmdbId) : await fetchMovieByTmdbId(tmdbId);
        if (!data?.networks) { results.push({ id: item.id, title: item.title, status: "error", error: "Could not fetch details" }); continue; }
        const newNetworks = data.networks as string[];
        const oldNetworks = (item.networks || []) as string[];
        const isDifferent = JSON.stringify([...newNetworks].sort()) !== JSON.stringify([...oldNetworks].sort());
        if (isDifferent) {
          await pool.query(`UPDATE ${table} SET networks = $1 WHERE id = $2`, [newNetworks, item.id]);
          results.push({ id: item.id, title: item.title, old_networks: oldNetworks, new_networks: newNetworks, status: "updated" });
        } else {
          results.push({ id: item.id, title: item.title, old_networks: oldNetworks, new_networks: newNetworks, status: "no_change" });
        }
      } catch (err) { results.push({ id: item.id, title: item.title, status: "error", error: String(err) }); }
    }

    const summary = {
      updated: results.filter(r => r.status === "updated").length,
      no_change: results.filter(r => r.status === "no_change").length,
      error: results.filter(r => r.status === "error").length,
    };

    return res.json({ ok: true, results, summary });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
});

// GET /api/m3u-proxy — proxy IPTV-org Spanish playlist to avoid CORS
router.get("/m3u-proxy", async (_req, res) => {
  const M3U_URL = "https://iptv-org.github.io/iptv/languages/spa.m3u";
  try {
    const upstream = await fetch(M3U_URL, {
      headers: { "User-Agent": "CineVault/1.0" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!upstream.ok) {
      res.status(502).json({ error: "Upstream returned " + upstream.status });
      return;
    }
    const text = await upstream.text();
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.send(text);
  } catch (err: any) {
    res.status(502).json({ error: err.message || "Failed to fetch M3U" });
  }
});

// POST /api/admin/cleanup-missing-images — delete movies/series without poster_url
router.post("/admin/cleanup-missing-images", async (req, res) => {
  const { type = "all" } = req.body as { type?: "movie" | "series" | "all" };
  try {
    let deletedMovies = 0;
    let deletedSeries = 0;

    if (type === "movie" || type === "all") {
      const result = await pool.query(
        "DELETE FROM movies WHERE poster_url IS NULL OR poster_url = '' OR poster_url = 'N/A' RETURNING id"
      );
      deletedMovies = result.rowCount || 0;
    }

    if (type === "series" || type === "all") {
      const result = await pool.query(
        "DELETE FROM cv_series WHERE poster_url IS NULL OR poster_url = '' OR poster_url = 'N/A' RETURNING id"
      );
      deletedSeries = result.rowCount || 0;
    }

    res.json({
      ok: true,
      summary: {
        movies: deletedMovies,
        series: deletedSeries,
        total: deletedMovies + deletedSeries
      }
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// GET /api/admin/tmdb-genres/:type — fetch genre list from TMDB
router.get("/admin/tmdb-genres/:type", async (req, res) => {
  const type = req.params["type"] as string;
  const endpoint = type === "series" ? "/genre/tv/list" : "/genre/movie/list";
  try {
    const r = await tmdbFetch(`${endpoint}?language=es-MX`);
    if (!r.ok) { res.status(502).json({ error: "Error al consultar TMDB" }); return; }
    const data = await r.json() as { genres?: { id: number; name: string }[] };
    res.json(data.genres || []);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// POST /api/admin/tmdb-discover — discover content from TMDB with filters
router.post("/admin/tmdb-discover", async (req, res) => {
  const {
    type = "movie",
    genre_ids,
    year_from,
    year_to,
    sort_by = "popularity.desc",
    language,
    min_votes = 50,
    page = 1,
    count = 2000,
  } = req.body as {
    type?: "movie" | "series";
    genre_ids?: string;
    year_from?: number;
    year_to?: number;
    sort_by?: string;
    language?: string;
    min_votes?: number;
    page?: number;
    count?: number;
  };

  // Each TMDB page = 20 items. Clamp batch size to [20, 500].
  const batchSize = Math.min(Math.max(20, count), 2000);
  const pagesPerBatch = Math.ceil(batchSize / 20); // e.g. 25 for 500
  const startTmdbPage = (page - 1) * pagesPerBatch + 1;

  type TmdbItem = {
    id: number;
    title?: string;
    name?: string;
    poster_path?: string | null;
    release_date?: string;
    first_air_date?: string;
    vote_average?: number;
    vote_count?: number;
    overview?: string;
  };
  type TmdbPageData = { results: TmdbItem[]; total_results: number; total_pages: number };

  try {
    const baseParams = new URLSearchParams();
    baseParams.set("language", "es-MX");
    baseParams.set("sort_by", sort_by);
    baseParams.set("vote_count.gte", String(min_votes || 0));
    if (genre_ids) baseParams.set("with_genres", genre_ids);
    if (year_from) baseParams.set(type === "series" ? "first_air_date.gte" : "primary_release_date.gte", `${year_from}-01-01`);
    if (year_to) baseParams.set(type === "series" ? "first_air_date.lte" : "primary_release_date.lte", `${year_to}-12-31`);
    if (language) baseParams.set("with_original_language", language);

    const endpoint = type === "series" ? "/discover/tv" : "/discover/movie";
    const TMDB_IMG = "https://image.tmdb.org/t/p";

    let tmdbTotalResults = 0;
    let tmdbTotalPages = 0;
    const allItems: TmdbItem[] = [];

    // TMDB max page = 500. Collect the pages we need for this batch.
    const pagesToFetch = Array.from({ length: pagesPerBatch }, (_, i) => startTmdbPage + i)
      .filter((p) => p <= 500);

    // Fetch in parallel chunks of 5 to respect TMDB rate limits.
    for (let i = 0; i < pagesToFetch.length; i += 5) {
      const chunk = pagesToFetch.slice(i, i + 5);
      const responses = await Promise.all(
        chunk.map((tmdbPage) => {
          const p = new URLSearchParams(baseParams);
          p.set("page", String(tmdbPage));
          return tmdbFetch(`${endpoint}?${p.toString()}`);
        })
      );
      for (const r of responses) {
        if (!r.ok) continue;
        const d = await r.json() as TmdbPageData;
        if (d.total_results > tmdbTotalResults) tmdbTotalResults = d.total_results;
        if (d.total_pages > tmdbTotalPages) tmdbTotalPages = d.total_pages;
        allItems.push(...(d.results || []));
      }
    }

    const results = allItems.slice(0, batchSize).map((item) => ({
      tmdb_id: item.id,
      title: item.title || item.name || "",
      year: (item.release_date || item.first_air_date || "").slice(0, 4),
      poster_url: item.poster_path ? `${TMDB_IMG}/w342${item.poster_path}` : "",
      rating: Math.round((item.vote_average || 0) * 10) / 10,
      vote_count: item.vote_count || 0,
      overview: (item.overview || "").slice(0, 150),
    }));

    // Re-express total_pages in terms of batches (not individual TMDB pages).
    const totalBatchPages = Math.ceil(Math.min(tmdbTotalPages, 500) / pagesPerBatch);

    res.json({
      ok: true,
      results,
      total_results: tmdbTotalResults,
      total_pages: totalBatchPages,
      page,
      count: batchSize,
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// POST /api/admin/cleanup-no-vidsrc — delete movies/series where vidsrc_status = 'inactive'
router.post("/admin/cleanup-no-vidsrc", async (_req, res) => {
  try {
    const movieResult = await pool.query(
      "DELETE FROM movies WHERE vidsrc_status = 'inactive' OR vidsrc_status IS NULL RETURNING id"
    );
    const seriesResult = await pool.query(
      "DELETE FROM cv_series WHERE vidsrc_status = 'inactive' OR vidsrc_status IS NULL RETURNING id"
    );
    const deletedMovies = movieResult.rowCount || 0;
    const deletedSeries = seriesResult.rowCount || 0;
    res.json({
      ok: true,
      summary: {
        movies: deletedMovies,
        series: deletedSeries,
        total: deletedMovies + deletedSeries,
      },
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});


// GET /api/admin/vidsrc-range?type=movie|series&from=1&to=100
// GET /api/admin/vidsrc-range?type=movie|series&from=N&to=M
// Descarga páginas [from..to] de vidsrc.me UNA POR UNA con 150ms de pausa
// Lento pero 100% confiable — vidsrc.me rate-limita requests paralelas
router.get("/admin/vidsrc-range", async (req, res) => {
  const type = req.query.type === "series" ? "tvshows" : "movies";
  const from = Math.max(1, parseInt(String(req.query.from ?? "1"), 10) || 1);
  const to   = Math.min(from + 49, parseInt(String(req.query.to ?? String(from + 49)), 10) || from + 49);

  const fetchPage = async (page: number): Promise<string[]> => {
    const url = `https://vidsrc.me/${type}/latest/page-${page}.json`;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const r = await fetch(url, {
          headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/json" },
          signal: AbortSignal.timeout(15_000),
        });
        if (!r.ok) { await new Promise(r => setTimeout(r, 1000)); continue; }
        const data = await r.json() as { result?: { imdb_id?: string }[]; pages?: number };
        const ids = (data.result ?? []).map(i => i.imdb_id).filter(Boolean) as string[];
        if (ids.length === 0 && attempt < 2) {
          await new Promise(r => setTimeout(r, 500)); continue;
        }
        return ids;
      } catch { await new Promise(r => setTimeout(r, 1000)); }
    }
    return [];
  };

  try {
    let totalPages = to;
    const allIds: string[] = [];

    // Página 1 devuelve el total real de páginas
    if (from === 1) {
      const r1 = await fetch(`https://vidsrc.me/${type}/latest/page-1.json`, {
        headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/json" },
        signal: AbortSignal.timeout(15_000),
      });
      if (!r1.ok) return res.status(500).json({ error: "vidsrc.me no responde" });
      const d1 = await r1.json() as { result?: { imdb_id?: string }[]; pages?: number };
      totalPages = d1.pages ?? to;
      allIds.push(...(d1.result ?? []).map(i => i.imdb_id).filter(Boolean) as string[]);
    }

    // Descargar páginas UNA A UNA con pausa de 150ms — respeta el rate limit
    const startPage = from === 1 ? 2 : from;
    for (let p = startPage; p <= to; p++) {
      const ids = await fetchPage(p);
      allIds.push(...ids);
      await new Promise(r => setTimeout(r, 150));
    }

    return res.json({ totalPages, imdb_ids: allIds });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
});

// GET /api/admin/vidsrc-list?type=movie|series&page=N  (kept for compatibility)
router.get("/admin/vidsrc-list", async (req, res) => {
  const type = req.query.type === "series" ? "tvshows" : "movies";
  const page = parseInt(String(req.query.page ?? "1"), 10) || 1;
  const url = `https://vidsrc.me/${type}/latest/page-${page}.json`;
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/json" },
    });
    if (!r.ok) return res.status(r.status).json({ error: `vidsrc.me responded ${r.status}` });
    const data = await r.json();
    return res.json(data);
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
});


// GET /api/admin/vidsrc-test — busca IMDb IDs específicos en todas las páginas de series
router.get("/admin/vidsrc-test", async (_req, res) => {
  const targetIds = new Set(["tt5555260", "tt6226232", "tt31938062"]); // This Is Us, Young Sheldon, The Pitt
  const found: Record<string, number> = {};
  let totalPages = 410;

  for (let p = 1; p <= totalPages; p++) {
    try {
      const r = await fetch(`https://vidsrc.me/tvshows/latest/page-${p}.json`, {
        headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(10_000),
      });
      if (!r.ok) continue;
      const d = await r.json() as { result?: { imdb_id?: string }[]; pages?: number };
      if (p === 1) totalPages = d.pages ?? 410;
      for (const item of d.result ?? []) {
        if (item.imdb_id && targetIds.has(item.imdb_id)) {
          found[item.imdb_id] = p;
          targetIds.delete(item.imdb_id);
        }
      }
      if (targetIds.size === 0) break; // found all
      await new Promise(r => setTimeout(r, 150));
    } catch { /* continue */ }
  }

  res.json({ totalPages, found, notFound: Array.from(targetIds) });
});














// ── VIDSRC Scanner (SSE) ───────────────────────────────────────────────────────
// GET /api/admin/vidsrc-scan-stream
// Descarga la lista completa de vidsrc.me en paralelo y cruza con el catálogo local.
// Transmite progreso vía SSE.
router.get("/admin/vidsrc-scan-stream", async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const send = (event: string, data: unknown) => {
    if (req.destroyed) return;
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    // 1. Cargar catálogo local
    const [movieRows, seriesRows] = await Promise.all([
      pool.query("SELECT imdb_id, title FROM movies WHERE imdb_id IS NOT NULL"),
      pool.query("SELECT imdb_id, title FROM cv_series WHERE imdb_id IS NOT NULL"),
    ]);
    const localMovies = movieRows.rows as { imdb_id: string; title: string }[];
    const localSeries = seriesRows.rows as { imdb_id: string; title: string }[];
    const totalItems = localMovies.length + localSeries.length;

    send("start", { totalMovies: localMovies.length, totalSeries: localSeries.length, totalItems });

    // 2. Descargar lista de vidsrc.me
    const buildVidsrcSet = async (type: "movie" | "series"): Promise<Set<string>> => {
      const pathType = type === "series" ? "tvshows" : "movies";
      const available = new Set<string>();
      const CONCURRENCY = 10;
      const RETRIES = 2;

      // Página 1 para obtener totalPages
      let totalPages = 0;
      try {
        const r1 = await fetch(`https://vidsrc.me/${pathType}/latest/page-1.json`, {
          headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
          signal: AbortSignal.timeout(15_000),
        });
        if (!r1.ok) return available;
        const d1 = await r1.json() as { result?: { imdb_id?: string }[]; pages?: number };
        totalPages = d1.pages ?? 0;
        for (const item of d1.result ?? []) {
          if (item.imdb_id) available.add(item.imdb_id);
        }
      } catch {
        send("error", { message: `Error al obtener página 1 de ${type}` });
        return available;
      }

      send("page_progress", { type, pagesLoaded: 1, totalPages });

      // Descargar páginas restantes en paralelo (CONCURRENCY a la vez)
      const pages = Array.from({ length: totalPages - 1 }, (_, i) => i + 2);
      for (let i = 0; i < pages.length; i += CONCURRENCY) {
        if (req.destroyed) break;
        const batch = pages.slice(i, i + CONCURRENCY);
        const results = await Promise.allSettled(
          batch.map(async (page) => {
            for (let attempt = 0; attempt <= RETRIES; attempt++) {
              try {
                const r = await fetch(`https://vidsrc.me/${pathType}/latest/page-${page}.json`, {
                  headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
                  signal: AbortSignal.timeout(15_000),
                });
                if (!r.ok) {
                  if (attempt < RETRIES) await new Promise(r => setTimeout(r, 1000));
                  continue;
                }
                const data = await r.json() as { result?: { imdb_id?: string }[] };
                const ids = (data.result ?? []).map(item => item.imdb_id).filter(Boolean) as string[];
                return ids;
              } catch {
                if (attempt < RETRIES) await new Promise(r => setTimeout(r, 1000));
              }
            }
            return [] as string[];
          })
        );

        for (const result of results) {
          if (result.status === "fulfilled") {
            for (const id of result.value) available.add(id);
          }
        }

        send("page_progress", {
          type,
          pagesLoaded: 1 + Math.min(i + CONCURRENCY, totalPages - 1),
          totalPages,
        });
      }

      return available;
    };

    send("phase", { phase: "downloading" });

    // Descargar ambas listas en paralelo
    const [movieVidsrcSet, seriesVidsrcSet] = await Promise.all([
      buildVidsrcSet("movie"),
      buildVidsrcSet("series"),
    ]);

    if (req.destroyed) { res.end(); return; }

    // 3. Cruzar catálogos
    send("phase", { phase: "matching" });

    type BatchItem = { imdb_id: string; title?: string; type: "movie" | "series" };
    let matchedCount = 0;
    const activeItems: BatchItem[] = [];
    const inactiveItems: BatchItem[] = [];
    const MOVIE_BATCH_SIZE = 100;

    // Películas
    for (const row of localMovies) {
      if (req.destroyed) break;
      const available = movieVidsrcSet.has(row.imdb_id);
      if (available) activeItems.push({ imdb_id: row.imdb_id, type: "movie" });
      else inactiveItems.push({ imdb_id: row.imdb_id, type: "movie" });
      matchedCount++;
      if (matchedCount % MOVIE_BATCH_SIZE === 0) {
        send("match_progress", { matched: matchedCount, total: totalItems });
      }
    }

    // Series
    for (const row of localSeries) {
      if (req.destroyed) break;
      const available = seriesVidsrcSet.has(row.imdb_id);
      if (available) activeItems.push({ imdb_id: row.imdb_id, type: "series" });
      else inactiveItems.push({ imdb_id: row.imdb_id, type: "series" });
      matchedCount++;
      if (matchedCount % 100 === 0) {
        send("match_progress", { matched: matchedCount, total: totalItems });
      }
    }

    // Reporte final de matching
    send("match_progress", { matched: matchedCount, total: totalItems });

    // 4. Guardar en BD
    if (!req.destroyed) {
      send("phase", { phase: "saving" });

      const saveResults = async (
        items: BatchItem[],
        available: boolean
      ) => {
        const movieIds = items.filter(i => i.type === "movie").map(i => i.imdb_id);
        const seriesIds = items.filter(i => i.type === "series").map(i => i.imdb_id);
        const status = available ? "active" : "inactive";

        const ops: Promise<unknown>[] = [];
        if (movieIds.length > 0) {
          ops.push(pool.query("UPDATE movies SET vidsrc_status = $1 WHERE imdb_id = ANY($2)", [status, movieIds]));
        }
        if (seriesIds.length > 0) {
          ops.push(pool.query("UPDATE cv_series SET vidsrc_status = $1 WHERE imdb_id = ANY($2)", [status, seriesIds]));
        }
        await Promise.all(ops);
      };

      // Guardar activos e inactivos en paralelo
      await Promise.all([
        saveResults(activeItems, true),
        saveResults(inactiveItems, false),
      ]);
    }

    // 5. Done
    if (!req.destroyed) {
      send("done", {
        active: activeItems.length,
        inactive: inactiveItems.length,
        total: totalItems,
        moviesActive: activeItems.filter(i => i.type === "movie").length,
        moviesInactive: inactiveItems.filter(i => i.type === "movie").length,
        seriesActive: activeItems.filter(i => i.type === "series").length,
        seriesInactive: inactiveItems.filter(i => i.type === "series").length,
      });
    }

    res.end();
  } catch (e) {
    if (!req.destroyed) {
      send("error", { message: String(e) });
      res.end();
    }
  }
});

// POST /api/admin/import-by-tmdb-ids — import movies/series directly by TMDB IDs
router.post("/admin/import-by-tmdb-ids", async (req, res) => {
  const { tmdb_ids, type = "movie" } = req.body as { tmdb_ids: number[]; type?: "movie" | "series" };

  if (!Array.isArray(tmdb_ids) || tmdb_ids.length === 0) {
    return res.status(400).json({ error: "Se requiere un array tmdb_ids" });
  }

  const results = [];
  for (const tmdbId of tmdb_ids.slice(0, 100)) {
    try {
      const importer = type === "movie" ? importMovie : importSeries;
      const ok = await importer(tmdbId);
      results.push({ tmdb_id: tmdbId, status: ok ? "imported" : "existed_or_error" });
    } catch (e) {
      results.push({ tmdb_id: tmdbId, status: "error", error: String(e) });
    }
  }

  const imported = results.filter(r => r.status === "imported").length;
  const existedOrError = results.length - imported;

  return res.json({ ok: true, summary: { imported, existed_or_error: existedOrError, total: results.length } });
});

// POST /api/admin/sagas/:id/refresh — refresh saga data from TMDB, optionally import missing
router.post("/admin/sagas/:id/refresh", async (req, res) => {
  const collectionId = Number(req.params.id);
  if (!collectionId || isNaN(collectionId)) {
    return res.status(400).json({ error: "Invalid collection ID" });
  }

  const { autoImport = false } = req.body as { autoImport?: boolean };

  try {
    // Fetch collection from TMDB
    const tmdbRes = await tmdbFetch(`/collection/${collectionId}?language=es-MX`);
    if (!tmdbRes.ok) {
      return res.status(404).json({ error: "Collection not found on TMDB" });
    }
    const collection = await tmdbRes.json() as {
      id: number; name: string; overview: string;
      poster_path: string | null; backdrop_path: string | null;
      parts: Array<{ id: number; title: string; poster_path: string | null; backdrop_path: string | null; release_date: string; vote_average: number; overview: string }>;
    };

    const TMDB_IMG = "https://image.tmdb.org/t/p";
    const parts = collection.parts
      .filter((p: any) => p.title)
      .sort((a: any, b: any) => {
        const yearA = a.release_date ? Number(a.release_date.slice(0, 4)) : 0;
        const yearB = b.release_date ? Number(b.release_date.slice(0, 4)) : 0;
        return yearA - yearB;
      });

    const tmdbIds = parts.map((p: any) => p.id);

    // Find which movies exist locally
    const localResult = await pool.query(
      `SELECT tmdb_id, id FROM movies WHERE tmdb_id = ANY($1) AND tmdb_id IS NOT NULL`,
      [tmdbIds],
    );
    const localMap = new Map<number, string>();
    for (const row of localResult.rows) {
      localMap.set(Number(row.tmdb_id), row.id);
    }

    const enrichedParts = parts.map((p: any) => {
      const localId = localMap.get(p.id) || null;
      return {
        id: p.id,
        title: p.title,
        poster_url: p.poster_path ? `${TMDB_IMG}/w500${p.poster_path}` : null,
        backdrop_url: p.backdrop_path ? `${TMDB_IMG}/w1280${p.backdrop_path}` : null,
        release_date: p.release_date,
        year: p.release_date ? Number(p.release_date.slice(0, 4)) : null,
        vote_average: p.vote_average,
        overview: p.overview || "",
        tmdb_id: p.id,
        local_id: localId,
        is_imported: localId !== null,
      };
    });

    // Auto-import missing movies if requested
    let imported = 0;
    if (autoImport) {
      const missingTmdbIds = enrichedParts
        .filter((p) => !p.is_imported)
        .map((p) => p.tmdb_id);
      for (const tmdbId of missingTmdbIds) {
        try {
          const ok = await importMovie(tmdbId);
          if (ok) imported++;
          // Update local_id after import
          const r = await pool.query(
            `SELECT id FROM movies WHERE tmdb_id = $1 LIMIT 1`,
            [tmdbId],
          );
          if (r.rows.length > 0) {
            const part = enrichedParts.find((p) => p.tmdb_id === tmdbId);
            if (part) {
              part.local_id = r.rows[0].id;
              part.is_imported = true;
            }
          }
        } catch {
          // skip
        }
      }
    }

    return res.json({
      id: collection.id,
      name: collection.name,
      poster_path: collection.poster_path ? `${TMDB_IMG}/w500${collection.poster_path}` : null,
      backdrop_path: collection.backdrop_path ? `${TMDB_IMG}/w1280${collection.backdrop_path}` : null,
      overview: collection.overview || "",
      parts: enrichedParts,
      imported,
    });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
});

export default router;

