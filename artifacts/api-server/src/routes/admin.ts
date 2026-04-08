import { Router } from "express";
import { pool } from "../lib/db";
import { runAutoImport, importByImdbId, importMovie, importSeries } from "../jobs/auto-import";
import { fetchMovieByTmdbId, fetchSeriesByTmdbId, tmdbFetch } from "../lib/tmdb-client";

const router = Router();

// GET /api/admin/stats
router.get("/admin/stats", async (_req, res) => {
  try {
    const [moviesCount, seriesCount, totalViews, topMovies, topSeries, recentTrends] = await Promise.all([
      pool.query("SELECT COUNT(*) as count FROM movies"),
      pool.query("SELECT COUNT(*) as count FROM cv_series"),
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
        movies: parseInt(moviesCount.rows[0].count),
        series: parseInt(seriesCount.rows[0].count),
        totalViews: parseInt(totalViews.rows[0].total),
      },
      top10: {
        movies: topMovies.rows,
        series: topSeries.rows,
      },
      trends: recentTrends.rows.map(r => ({
        date: r.day,
        count: parseInt(r.count)
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
router.post("/admin/auto-import/run", async (_req, res) => {
  try {
    const result = await runAutoImport();
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

  res.json({ ok: true, results, summary });
});

// POST /api/admin/verify-vidsrc
router.post("/admin/verify-vidsrc", async (req, res) => {
  const { imdb_ids, type = "movie" } = req.body as { imdb_ids: string[]; type?: "movie" | "series" };

  if (!Array.isArray(imdb_ids) || imdb_ids.length === 0) {
    return res.status(400).json({ error: "Se requiere un array imdb_ids" });
  }

  const results: { imdb_id: string; available: boolean }[] = [];

  for (const imdbId of imdb_ids.slice(0, 50)) {
    try {
      const url = type === "series"
        ? `https://vidsrc.net/embed/tv/${imdbId}/`
        : `https://vidsrc.net/embed/movie/${imdbId}/`;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);

      let available = false;
      try {
        const r = await fetch(url, {
          method: "HEAD",
          signal: controller.signal,
          headers: { "User-Agent": "Mozilla/5.0" },
        });
        available = r.status < 400;
      } catch {
        available = false;
      } finally {
        clearTimeout(timeout);
      }

      results.push({ imdb_id: imdbId, available });

      // Update DB
      const status = available ? "active" : "inactive";
      const table = type === "series" ? "cv_series" : "movies";
      await pool.query(`UPDATE ${table} SET vidsrc_status = $1 WHERE imdb_id = $2`, [status, imdbId]);
    } catch (err) {
      results.push({ imdb_id: imdbId, available: false });
    }
  }

  res.json(results);
});

// POST /api/admin/scan-networks — scan existing media to update networks/production companies
router.post("/admin/scan-networks", async (req, res) => {
  const { type = "movie", limit = 1000 } = req.body as { type?: "movie" | "series"; limit?: number };
  const table = type === "series" ? "cv_series" : "movies";

  try {
    // Get items that have empty networks or we want to refresh
    const { rows: items } = await pool.query(
      `SELECT id, imdb_id, title, networks FROM ${table} ORDER BY date_added DESC LIMIT $1`,
      [limit]
    );

    const results = [];
    for (const item of items) {
      try {
        if (!item.imdb_id) {
          results.push({ id: item.id, title: item.title, status: "error", error: "No IMDb ID" });
          continue;
        }

        // Find TMDB ID first
        const findRes = await tmdbFetch(`/find/${item.imdb_id}?external_source=imdb_id`);
        if (!findRes.ok) {
          results.push({ id: item.id, title: item.title, status: "error", error: "TMDB find failed" });
          continue;
        }
        const findData = await findRes.json() as any;
        const tmdbResults = type === "series" ? findData.tv_results : findData.movie_results;

        if (!tmdbResults || tmdbResults.length === 0) {
          results.push({ id: item.id, title: item.title, status: "error", error: "Not found on TMDB" });
          continue;
        }

        const tmdbId = tmdbResults[0].id;
        const data = type === "series" ? await fetchSeriesByTmdbId(tmdbId) : await fetchMovieByTmdbId(tmdbId);

        if (!data || !data.networks) {
          results.push({ id: item.id, title: item.title, status: "error", error: "Could not fetch details" });
          continue;
        }

        const newNetworks = data.networks as string[];
        const oldNetworks = (item.networks || []) as string[];

        // Check if they are different
        const isDifferent = JSON.stringify([...newNetworks].sort()) !== JSON.stringify([...oldNetworks].sort());

        if (isDifferent) {
          await pool.query(`UPDATE ${table} SET networks = $1 WHERE id = $2`, [newNetworks, item.id]);
          results.push({
            id: item.id,
            title: item.title,
            old_networks: oldNetworks,
            new_networks: newNetworks,
            status: "updated"
          });
        } else {
          results.push({
            id: item.id,
            title: item.title,
            old_networks: oldNetworks,
            new_networks: newNetworks,
            status: "no_change"
          });
        }
      } catch (err) {
        results.push({ id: item.id, title: item.title, status: "error", error: String(err) });
      }
    }

    const summary = {
      updated: results.filter(r => r.status === "updated").length,
      no_change: results.filter(r => r.status === "no_change").length,
      error: results.filter(r => r.status === "error").length,
    };

    res.json({ ok: true, results, summary });
  } catch (e) {
    res.status(500).json({ error: String(e) });
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
    count = 500,
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
  const batchSize = Math.min(Math.max(20, count), 500);
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

// POST /api/admin/import-by-tmdb-ids — import content directly by TMDB IDs
router.post("/admin/import-by-tmdb-ids", async (req, res) => {
  const { tmdb_ids, type = "movie" } = req.body as { tmdb_ids: number[]; type?: "movie" | "series" };

  if (!Array.isArray(tmdb_ids) || tmdb_ids.length === 0) {
    return res.status(400).json({ error: "Se requiere un array tmdb_ids" });
  }

  let imported = 0, existed = 0;
  for (const tmdbId of tmdb_ids.slice(0, 500)) {
    try {
      const ok = type === "movie" ? await importMovie(tmdbId) : await importSeries(tmdbId);
      if (ok) imported++; else existed++;
    } catch {
      existed++;
    }
  }

  res.json({ ok: true, summary: { imported, existed_or_error: existed, total: Math.min(tmdb_ids.length, 500) } });
});

// POST /api/admin/cleanup-no-vidsrc — delete movies/series where vidsrc_status = 'inactive'
router.post("/admin/cleanup-no-vidsrc", async (_req, res) => {
  try {
    const movieResult = await pool.query(
      "DELETE FROM movies WHERE vidsrc_status = 'inactive' RETURNING id"
    );
    const seriesResult = await pool.query(
      "DELETE FROM cv_series WHERE vidsrc_status = 'inactive' RETURNING id"
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

export default router;
