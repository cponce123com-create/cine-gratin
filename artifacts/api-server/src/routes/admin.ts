import { Router } from "express";
import { pool } from "../lib/db";
import { runAutoImport } from "../jobs/auto-import";

const router = Router();

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
    res.json({ ok: true, ...result });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
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
