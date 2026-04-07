import { Router } from "express";
import { pool } from "../lib/db";

const router = Router();

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
  mpa_rating: row.mpa_rating,
  slug: row.slug,
  featured: row.featured,
  video_sources: row.video_sources,
  torrents: row.torrents,
  views: Number(row.views),
  date_added: row.date_added,
});

// GET /api/movies
router.get("/movies", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM movies ORDER BY date_added DESC");
    res.json(rows.map(toMovie));
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// GET /api/movies/featured
router.get("/movies/featured", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM movies WHERE featured = TRUE ORDER BY date_added DESC LIMIT 10");
    res.json(rows.map(toMovie));
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// GET /api/movies/trending — top 10 most viewed recently
router.get("/movies/trending", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM movies ORDER BY views DESC, date_added DESC LIMIT 10`
    );
    res.json(rows.map(toMovie));
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// GET /api/movies/search?q=...
router.get("/movies/search", async (req, res) => {
  const q = String(req.query.q || "");
  const limit = Math.min(Number(req.query.limit || 20), 50);
  try {
    const { rows } = await pool.query(
      `SELECT * FROM movies WHERE title ILIKE $1 OR synopsis ILIKE $1 ORDER BY views DESC, date_added DESC LIMIT $2`,
      [`%${q}%`, limit]
    );
    res.json(rows.map(toMovie));
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// GET /api/movies/by-slug/:slug
router.get("/movies/by-slug/:slug", async (req, res) => {
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
router.get("/movies/:id", async (req, res) => {
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

// POST /api/movies — upsert (create or update)
router.post("/movies", async (req, res) => {
  const m = req.body;
  try {
    await pool.query(
      `INSERT INTO movies (id, imdb_id, title, year, rating, runtime, genres, language, synopsis,
        director, cast_list, poster_url, background_url, yt_trailer_code, mpa_rating, slug,
        featured, video_sources, torrents, views, date_added)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
       ON CONFLICT (id) DO UPDATE SET
         imdb_id=$2, title=$3, year=$4, rating=$5, runtime=$6, genres=$7, language=$8, synopsis=$9,
         director=$10, cast_list=$11, poster_url=$12, background_url=$13, yt_trailer_code=$14,
         mpa_rating=$15, slug=$16, featured=$17, video_sources=$18, torrents=$19, views=$20`,
      [
        m.id, m.imdb_id, m.title, m.year, m.rating, m.runtime,
        m.genres, m.language, m.synopsis, m.director, m.cast_list,
        m.poster_url, m.background_url, m.yt_trailer_code, m.mpa_rating,
        m.slug, m.featured, JSON.stringify(m.video_sources), JSON.stringify(m.torrents),
        m.views || 0, m.date_added || new Date().toISOString(),
      ]
    );
    const { rows } = await pool.query("SELECT * FROM movies WHERE id = $1", [m.id]);
    res.json(toMovie(rows[0]));
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// DELETE /api/movies/:id
router.delete("/movies/:id", async (req, res) => {
  try {
    await pool.query("DELETE FROM movies WHERE id = $1", [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// PATCH /api/movies/:id/view — increment view count
router.patch("/movies/:id/view", async (req, res) => {
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
      res.json({ ok: true });
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
