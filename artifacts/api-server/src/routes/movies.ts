import { Router, type Request, type Response } from "express";
import { pool } from "../lib/db";
import { rateLimit } from "express-rate-limit";
import { tmdbFetch, fetchMovieByTmdbId } from "../lib/tmdb-client";

/** Inline auth check for routes that are NOT under /admin/* but still need protection. */
function requireAuth(req: Request, res: Response): boolean {
  const secret = process.env["ADMIN_SECRET"];
  if (!secret) return true; // dev mode: no ADMIN_SECRET set
  const authHeader = req.headers["authorization"];
  const queryToken = req.query["token"] as string | undefined;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : queryToken;
  if (!token || token !== secret) {
    res.status(401).json({ error: "No autorizado" });
    return false;
  }
  return true;
}

const router = Router();

// Rate limiting for public movie endpoints
const movieLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiadas peticiones, por favor intenta más tarde." },
});

const toMovie = (row: Record<string, unknown>) => ({
  id: row.id,
  imdb_id: row.imdb_id,
  title: row.title,
  year: Number(row.year),
  rating: Number(row.rating),
  runtime: Number(row.runtime),
  genres: row.genres,
  language: row.language,
  synopsis: row.synopsis,
  director: row.director,
  cast_list: row.cast_list,
  cast_full: row.cast_full ?? [],
  networks: (row.networks as string[]) ?? [],
  poster_url: row.poster_url,
  background_url: row.background_url,
  yt_trailer_code: row.yt_trailer_code,
  videos: row.videos ?? [],
  reviews: row.reviews ?? [],
  mpa_rating: row.mpa_rating,
  slug: row.slug,
  featured: row.featured,
  video_sources: row.video_sources,
  torrents: row.torrents,
  views: Number(row.views),
  date_added: row.date_added,
  collection_id: row.collection_id,
  collection_name: row.collection_name,
});

// GET /api/movies - Added pagination and rate limiting
router.get("/movies", movieLimit, async (req, res) => {
  const page = Math.max(1, Number(req.query.page || 1));
  const limit = req.query.limit ? Math.max(1, Number(req.query.limit)) : 20; // Límite por defecto optimizado
  const offset = (page - 1) * limit;

  try {
    const { rows } = await pool.query(
      `SELECT id, imdb_id, title, year, rating, runtime, genres, language, synopsis,
              director, cast_list, networks, poster_url, background_url, yt_trailer_code,
              mpa_rating, slug, featured, video_sources, torrents, views, date_added,
              vidsrc_status, auto_imported, collection_id, collection_name,
              '[]'::jsonb AS videos, '[]'::jsonb AS reviews, '[]'::jsonb AS cast_full
       FROM movies ORDER BY year DESC, date_added DESC LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    
    // Cache for 5 minutes, stale-while-revalidate for 1 hour
    res.setHeader("Cache-Control", "public, max-age=300, stale-while-revalidate=3600");
    res.json(rows.map(toMovie));
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// GET /api/movies/featured
router.get("/movies/featured", movieLimit, async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM movies WHERE featured = TRUE ORDER BY date_added DESC LIMIT 10");
    res.setHeader("Cache-Control", "public, max-age=600, stale-while-revalidate=7200");
    res.json(rows.map(toMovie));
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// GET /api/movies/trending — top 10 most viewed recently
router.get("/movies/trending", movieLimit, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM movies ORDER BY views DESC, date_added DESC LIMIT 10`
    );
    res.setHeader("Cache-Control", "public, max-age=1800, stale-while-revalidate=86400");
    res.json(rows.map(toMovie));
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// GET /api/movies/search?q=...
router.get("/movies/search", movieLimit, async (req, res) => {
  const q = String(req.query.q || "");
  const limit = Math.min(Number(req.query.limit || 20), 50);
  try {
    const { rows } = await pool.query(
      `SELECT * FROM movies WHERE title ILIKE $1 OR synopsis ILIKE $1 ORDER BY views DESC, date_added DESC LIMIT $2`,
      [`%${q}%`, limit]
    );
    res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
    res.json(rows.map(toMovie));
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// GET /api/movies/by-slug/:slug
router.get("/movies/by-slug/:slug", movieLimit, async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT * FROM movies WHERE slug = $1 OR id = $1 OR imdb_id = $1",
      [req.params.slug]
    );
    if (!rows[0]) return res.status(404).json({ error: "Not found" });
    res.json(toMovie(rows[0]));
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// GET /api/movies/:id
router.get("/movies/:id", movieLimit, async (req, res) => {
  try {
    // Try by id first, then by slug or imdb_id
    let { rows } = await pool.query("SELECT * FROM movies WHERE id = $1", [req.params.id]);
    if (!rows[0]) {
      const result = await pool.query(
        "SELECT * FROM movies WHERE slug = $1 OR imdb_id = $1",
        [req.params.id]
      );
      rows = result.rows;
    }
    if (!rows[0]) return res.status(404).json({ error: "Not found" });
    res.json(toMovie(rows[0]));
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// POST /api/admin/movies/:id — upsert (create or update)
router.post(["/admin/movies", "/admin/movies/:id"], async (req, res) => {
  const m = req.body;
  const id = req.params.id || m.id;
  try {
    await pool.query(
      `INSERT INTO movies (id, imdb_id, title, year, rating, runtime, genres, language, synopsis,
        director, cast_list, networks, poster_url, background_url, yt_trailer_code, videos, reviews,
        mpa_rating, slug, featured, video_sources, torrents, views, date_added, collection_id, collection_name)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26)
       ON CONFLICT (id) DO UPDATE SET
         imdb_id=$2, title=$3, year=$4, rating=$5, runtime=$6, genres=$7, language=$8, synopsis=$9,
         director=$10, cast_list=$11, networks=$12, poster_url=$13, background_url=$14,
         yt_trailer_code=$15, videos=$16, reviews=$17, mpa_rating=$18, slug=$19, featured=$20,
         video_sources=$21, torrents=$22, views=$23, collection_id=$25, collection_name=$26`,
      [
        id, m.imdb_id, m.title, m.year, m.rating, m.runtime,
        m.genres, m.language, m.synopsis, m.director, m.cast_list,
        m.networks ?? [],
        m.poster_url, m.background_url, m.yt_trailer_code,
        JSON.stringify(m.videos ?? []), JSON.stringify(m.reviews ?? []),
        m.mpa_rating, m.slug, m.featured,
        JSON.stringify(m.video_sources), JSON.stringify(m.torrents),
        m.views || 0, m.date_added || new Date().toISOString(),
        m.collection_id !== undefined ? m.collection_id : null, m.collection_name ?? null
      ]
    );
    const { rows } = await pool.query("SELECT * FROM movies WHERE id = $1", [id]);
    res.json(toMovie(rows[0]));
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// DELETE /api/admin/movies/:id
router.delete("/admin/movies/:id", async (req, res) => {
  try {
    await pool.query("DELETE FROM movies WHERE id = $1", [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// PATCH /api/movies/:id/view — increment view count
router.patch("/movies/:id/view", movieLimit, async (req, res) => {
  try {
    await pool.query("UPDATE movies SET views = views + 1 WHERE id = $1", [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// GET /api/settings
router.get("/settings", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT key, value FROM cv_settings");
    const obj: Record<string, string> = {};
    rows.forEach(r => { obj[r.key] = r.value; });
    res.json(obj);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// POST /api/settings
router.post("/settings", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const settings: Record<string, string> = req.body;
  try {
    for (const [key, value] of Object.entries(settings)) {
      await pool.query(
        `INSERT INTO cv_settings (key, value) VALUES ($1, $2)
         ON CONFLICT (key) DO UPDATE SET value = $2`,
        [key, String(value)]
      );
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// GET /api/servers
router.get("/servers", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM cv_servers ORDER BY sort_order");
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// POST /api/servers
router.post("/servers", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const servers: Array<{ id: string; name: string; base_url: string; active: boolean; sort_order: number }> = req.body;
  try {
    await pool.query("DELETE FROM cv_servers");
    for (const s of servers) {
      await pool.query(
        `INSERT INTO cv_servers (id, name, base_url, active, sort_order) VALUES ($1,$2,$3,$4,$5)`,
        [s.id, s.name, s.base_url || "", s.active, s.sort_order || 0]
      );
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// POST /api/auth/login
router.post("/auth/login", async (req, res) => {
  const { password } = req.body;
  try {
    const { rows } = await pool.query("SELECT password FROM cv_auth WHERE id = 'admin'");
    const stored = rows[0]?.password || "admin123";
    if (password === stored) {
      const token = process.env["ADMIN_SECRET"] ?? null;
      res.json({ ok: true, token });
    } else {
      res.status(401).json({ error: "Contraseña incorrecta" });
    }
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// POST /api/auth/change-password
router.post("/auth/change-password", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const { password } = req.body;
  try {
    await pool.query("UPDATE cv_auth SET password = $1 WHERE id = 'admin'", [password]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// GET /api/admin/backfill-cast-stream
// Recorre todas las películas/series sin cast_full y lo rellena desde TMDB.
// Usa SSE para mostrar progreso en tiempo real.
router.get("/admin/backfill-cast-stream", async (req, res) => {
  const type = req.query.type === "series" ? "series" : "movie";
  const table = type === "series" ? "cv_series" : "movies";

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    // Only process rows with empty cast_full
    const { rows } = await pool.query(
      `SELECT id, imdb_id, title FROM ${table}
       WHERE imdb_id IS NOT NULL AND imdb_id != ''
         AND (cast_full IS NULL OR cast_full = '[]'::jsonb)
       ORDER BY date_added DESC`
    );

    send("start", { total: rows.length });

    let updated = 0, skipped = 0, errorCount = 0;

    for (let i = 0; i < rows.length; i++) {
      if (req.destroyed) break;
      const row = rows[i] as { id: string; imdb_id: string; title: string };

      try {
        // Find TMDB id from imdb_id
        const findRes = await tmdbFetch(
          `/find/${row.imdb_id}?external_source=imdb_id`
        );
        if (!findRes.ok) { skipped++; continue; }

        const findData = await findRes.json() as {
          movie_results?: { id: number }[];
          tv_results?: { id: number }[];
        };

        const tmdbId = type === "series"
          ? findData.tv_results?.[0]?.id
          : findData.movie_results?.[0]?.id;

        if (!tmdbId) { skipped++; continue; }

        // Fetch credits
        const creditsRes = await tmdbFetch(
          `/${type === "series" ? "tv" : "movie"}/${tmdbId}/credits?language=es-MX`
        );
        if (!creditsRes.ok) { skipped++; continue; }

        const credits = await creditsRes.json() as {
          cast?: Array<{ id: number; name: string; character: string; profile_path: string | null; order: number }>;
        };

        const TMDB_IMG = "https://image.tmdb.org/t/p";
        const castFull = (credits.cast ?? [])
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
          .slice(0, 15)
          .map(c => ({
            id: c.id,
            name: c.name,
            character: c.character || "",
            profile_url: c.profile_path ? `${TMDB_IMG}/w185${c.profile_path}` : null,
          }));

        await pool.query(
          `UPDATE ${table} SET cast_full = $1 WHERE id = $2`,
          [JSON.stringify(castFull), row.id]
        );

        updated++;
        send("progress", {
          i: i + 1, total: rows.length, title: row.title,
          status: "updated", cast_count: castFull.length,
          updated, skipped, error: errorCount,
        });

        // Respect TMDB rate limit
        await new Promise(r => setTimeout(r, 120));
      } catch {
        errorCount++;
      }

      // Send heartbeat every 20 items even if no update
      if (i % 20 === 0 && updated === 0) {
        send("progress", {
          i: i + 1, total: rows.length, title: row.title,
          status: "scanning", updated, skipped, error: errorCount,
        });
      }
    }

    send("done", { total: rows.length, updated, skipped, error: errorCount });
    res.end();
  } catch (e) {
    send("error", { message: String(e) });
    res.end();
  }
});

// GET /api/sagas — sagas activas con más de 3 títulos (público)
router.get("/sagas", movieLimit, async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        combined.collection_id,
        MAX(combined.collection_name) AS collection_name,
        COUNT(*) AS item_count,
        (
          SELECT poster_url FROM (
            SELECT poster_url, year FROM movies
              WHERE collection_id = combined.collection_id
            UNION ALL
            SELECT poster_url, year FROM cv_series
              WHERE collection_id = combined.collection_id
          ) sub ORDER BY year ASC LIMIT 1
        ) AS cover_url
      FROM (
        SELECT collection_id, collection_name FROM movies
          WHERE collection_id IS NOT NULL AND collection_id != -1
        UNION ALL
        SELECT collection_id, collection_name FROM cv_series
          WHERE collection_id IS NOT NULL AND collection_id != -1
      ) combined
      INNER JOIN cv_active_sagas act ON act.collection_id = combined.collection_id
      GROUP BY combined.collection_id
      HAVING COUNT(*) > 3
      ORDER BY COUNT(*) DESC, MAX(collection_name)
    `);
    res.setHeader("Cache-Control", "public, max-age=600, stale-while-revalidate=3600");
    res.json(rows.map((r) => ({
      collection_id: Number(r.collection_id),
      collection_name: r.collection_name as string,
      item_count: Number(r.item_count),
      cover_url: (r.cover_url as string) ?? "",
    })));
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

export default router;
