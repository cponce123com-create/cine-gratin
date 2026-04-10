import { Router } from "express";
import { pool } from "../lib/db";
import { rateLimit } from "express-rate-limit";

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
  const limit = req.query.limit ? Math.max(1, Number(req.query.limit)) : 5000; // Aumentado a 5000 por defecto para permitir gestión completa
  const offset = (page - 1) * limit;

  try {
    const { rows } = await pool.query(
      `SELECT id, imdb_id, title, year, rating, runtime, genres, language, synopsis,
              director, cast_list, networks, poster_url, background_url, yt_trailer_code,
              mpa_rating, slug, featured, video_sources, torrents, views, date_added,
              vidsrc_status, auto_imported, '[]'::jsonb AS videos, '[]'::jsonb AS reviews
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
        m.collection_id || null, m.collection_name || null
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
  const { password } = req.body;
  try {
    await pool.query("UPDATE cv_auth SET password = $1 WHERE id = 'admin'", [password]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

export default router;
