import { Router } from "express";
import { pool } from "../lib/db";
import { runAutoImport, importByImdbId } from "../jobs/auto-import";

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
  for (const imdbId of imdb_ids.slice(0, 100)) {
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
        ? `https://vidsrc.pro/embed/tv/${imdbId}`
        : `https://vidsrc.pro/embed/movie/${imdbId}`;

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

export default router;
