import { Router } from "express";
import { pool } from "../lib/db";
import { rateLimit } from "express-rate-limit";

const router = Router();

// Rate limiting for public series endpoints
const seriesLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiadas peticiones, por favor intenta más tarde." },
});

const toSeries = (row: Record<string, unknown>) => ({
  id: row.id,
  imdb_id: row.imdb_id,
  tmdb_id: row.tmdb_id ? Number(row.tmdb_id) : null,
  title: row.title,
  year: Number(row.year),
  end_year: row.end_year ? Number(row.end_year) : null,
  rating: Number(row.rating),
  genres: row.genres,
  language: row.language,
  synopsis: row.synopsis,
  creators: row.creators,
  cast_list: row.cast_list,
  networks: (row.networks as string[]) ?? [],
  poster_url: row.poster_url,
  background_url: row.background_url,
  yt_trailer_code: row.yt_trailer_code,
  videos: row.videos ?? [],
  reviews: row.reviews ?? [],
  status: row.status,
  total_seasons: Number(row.total_seasons),
  seasons_data: row.seasons_data,
  video_sources: row.video_sources,
  featured: row.featured,
  views: Number(row.views),
  date_added: row.date_added,
  collection_id: row.collection_id,
  collection_name: row.collection_name,
});

// GET /api/series - Added pagination and rate limiting
router.get("/series", seriesLimit, async (req, res) => {
  const page = Math.max(1, Number(req.query.page || 1));
  const limit = req.query.limit ? Math.max(1, Number(req.query.limit)) : 5000; // Aumentado a 5000 por defecto para permitir gestión completa
  const offset = (page - 1) * limit;

  try {
    const { rows } = await pool.query(
      `SELECT id, imdb_id, tmdb_id, title, year, end_year, rating, genres, language, synopsis,
              creators, cast_list, networks, poster_url, background_url, yt_trailer_code,
              status, total_seasons, video_sources, featured, views, date_added,
              vidsrc_status, auto_imported, collection_id, collection_name,
              '[]'::jsonb AS videos, '[]'::jsonb AS reviews, '[]'::jsonb AS seasons_data
       FROM cv_series ORDER BY year DESC, date_added DESC LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    
    // Cache for 5 minutes, stale-while-revalidate for 1 hour
    res.setHeader("Cache-Control", "public, max-age=300, stale-while-revalidate=3600");
    res.json(rows.map(toSeries));
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// GET /api/series/trending
router.get("/series/trending", seriesLimit, async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT * FROM cv_series ORDER BY views DESC, date_added DESC LIMIT 10"
    );
    res.setHeader("Cache-Control", "public, max-age=1800, stale-while-revalidate=86400");
    res.json(rows.map(toSeries));
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// GET /api/series/search?q=
router.get("/series/search", seriesLimit, async (req, res) => {
  const q = String(req.query.q || "");
  const limit = Math.min(Number(req.query.limit || 20), 50);
  try {
    const { rows } = await pool.query(
      `SELECT * FROM cv_series WHERE title ILIKE $1 OR synopsis ILIKE $1 ORDER BY views DESC, date_added DESC LIMIT $2`,
      [`%${q}%`, limit]
    );
    res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
    res.json(rows.map(toSeries));
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// GET /api/series/:id
router.get("/series/:id", seriesLimit, async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT * FROM cv_series WHERE id = $1 OR imdb_id = $1",
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: "Not found" });
    res.json(toSeries(rows[0]));
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// POST /api/admin/series/:id — upsert
router.post(["/admin/series", "/admin/series/:id"], async (req, res) => {
  const s = req.body;
  const id = req.params.id || s.id;
  try {
    await pool.query(
      `INSERT INTO cv_series (id, imdb_id, tmdb_id, title, year, end_year, rating, genres, language,
        synopsis, creators, cast_list, networks, poster_url, background_url, yt_trailer_code,
        videos, reviews, status, total_seasons, seasons_data, video_sources, featured, views, date_added, collection_id, collection_name)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27)
       ON CONFLICT (id) DO UPDATE SET
         imdb_id=$2, tmdb_id=$3, title=$4, year=$5, end_year=$6, rating=$7, genres=$8, language=$9,
         synopsis=$10, creators=$11, cast_list=$12, networks=$13, poster_url=$14, background_url=$15,
         yt_trailer_code=$16, videos=$17, reviews=$18, status=$19, total_seasons=$20,
         seasons_data=$21, video_sources=$22, featured=$23, views=$24, collection_id=$26, collection_name=$27`,
      [
        id, s.imdb_id, s.tmdb_id || null, s.title, s.year, s.end_year || null,
        s.rating, s.genres, s.language, s.synopsis, s.creators, s.cast_list,
        s.networks ?? [],
        s.poster_url, s.background_url, s.yt_trailer_code,
        JSON.stringify(s.videos ?? []), JSON.stringify(s.reviews ?? []),
        s.status || "",
        s.total_seasons, JSON.stringify(s.seasons_data || []),
        JSON.stringify(s.video_sources || []),
        s.featured || false, s.views || 0,
        s.date_added || new Date().toISOString(),
        s.collection_id !== undefined ? s.collection_id : null, s.collection_name ?? null
      ]
    );
    const { rows } = await pool.query("SELECT * FROM cv_series WHERE id = $1", [id]);
    res.json(toSeries(rows[0]));
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// DELETE /api/admin/series/:id
router.delete("/admin/series/:id", async (req, res) => {
  try {
    await pool.query("DELETE FROM cv_series WHERE id = $1", [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// PATCH /api/series/:id/view
router.patch("/series/:id/view", seriesLimit, async (req, res) => {
  try {
    await pool.query("UPDATE cv_series SET views = views + 1 WHERE id = $1", [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

export default router;
