import { Router } from "express";
import { pool } from "../lib/db";
import { rateLimit } from "express-rate-limit";
import { tmdbFetch } from "../lib/tmdb-client";
import {
  hashPassword,
  verifyPassword,
  isBcryptHash,
  generateToken,
  requireAuth,
} from "../lib/auth-utils";
import { z } from "zod";

const router = Router();

// ── Rate limiters ─────────────────────────────────────────────────────────────

const movieLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiadas peticiones, por favor intenta más tarde." },
});

/** Stricter rate limit for login: max 10 attempts per IP per 15 min */
const loginLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiados intentos de login. Intenta de nuevo en 15 minutos." },
});

// ── Zod schemas ───────────────────────────────────────────────────────────────

const loginSchema = z.object({
  username: z.string().min(1, "Usuario requerido"),
  password: z.string().min(1, "Contraseña requerida"),
});

const changePasswordSchema = z.object({
  password: z.string().min(1, "Contraseña requerida"),
  username: z.string().optional(),
});

const settingsSchema = z.record(z.string(), z.string());

const toMovie = (row: Record<string, unknown>) => ({
  id: row.id,
  imdb_id: row.imdb_id,
  tmdb_id: row.tmdb_id ? Number(row.tmdb_id) : null,
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
});

// ── Public movie endpoints ────────────────────────────────────────────────────

// GET /api/movies — with max limit cap of 100
router.get("/movies", movieLimit, async (req, res) => {
  const page = Math.max(1, Number(req.query.page || 1));
  const limit = Math.min(Math.max(1, Number(req.query.limit || 20)), 100);
  const offset = (page - 1) * limit;

  try {
    const { rows } = await pool.query(
      `SELECT id, imdb_id, title, year, rating, runtime, genres, language, synopsis,
              director, cast_list, networks, poster_url, background_url, yt_trailer_code,
              mpa_rating, slug, featured, video_sources, torrents, views, date_added,
              vidsrc_status, auto_imported,
              '[]'::jsonb AS videos, '[]'::jsonb AS reviews, '[]'::jsonb AS cast_full
       FROM movies ORDER BY year DESC, date_added DESC LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

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

// GET /api/movies/trending
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
    return res.json(toMovie(rows[0]));
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
});

// GET /api/movies/:id
router.get("/movies/:id", movieLimit, async (req, res) => {
  try {
    let { rows } = await pool.query("SELECT * FROM movies WHERE id = $1", [req.params.id]);
    if (!rows[0]) {
      const result = await pool.query(
        "SELECT * FROM movies WHERE slug = $1 OR imdb_id = $1",
        [req.params.id]
      );
      rows = result.rows;
    }
    if (!rows[0]) return res.status(404).json({ error: "Not found" });
    return res.json(toMovie(rows[0]));
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
});

// POST /api/admin/movies/:id — upsert
router.post(["/admin/movies", "/admin/movies/:id"], async (req, res) => {
  const m = req.body;
  const id = req.params.id || m.id || `manual_${Date.now()}`;
  try {
    await pool.query(
      `INSERT INTO movies (id, imdb_id, title, year, rating, runtime, genres, language, synopsis,
        director, cast_list, networks, poster_url, background_url, yt_trailer_code, videos, reviews,
        mpa_rating, slug, featured, video_sources, torrents, views, date_added)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
       ON CONFLICT (id) DO UPDATE SET
         imdb_id=$2, title=$3, year=$4, rating=$5, runtime=$6, genres=$7, language=$8, synopsis=$9,
         director=$10, cast_list=$11, networks=$12, poster_url=$13, background_url=$14,
         yt_trailer_code=$15, videos=$16, reviews=$17, mpa_rating=$18, slug=$19, featured=$20,
         video_sources=$21, torrents=$22, views=$23`,
      [
        id, m.imdb_id, m.title, m.year, m.rating, m.runtime,
        m.genres, m.language, m.synopsis, m.director, m.cast_list,
        m.networks ?? [],
        m.poster_url, m.background_url, m.yt_trailer_code,
        JSON.stringify(m.videos ?? []), JSON.stringify(m.reviews ?? []),
        m.mpa_rating, m.slug, m.featured,
        JSON.stringify(m.video_sources), JSON.stringify(m.torrents),
        m.views || 0, m.date_added || new Date().toISOString(),
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
    const result = await pool.query("DELETE FROM movies WHERE id = $1", [req.params.id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Película no encontrada" });
    }
    return res.json({ ok: true, deleted: result.rowCount });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
});

// PATCH /api/movies/:id/view
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

// POST /api/settings — with Zod validation
router.post("/settings", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const parsed = settingsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Formato inválido", details: parsed.error.issues });
    return;
  }
  try {
    for (const [key, value] of Object.entries(parsed.data)) {
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

// ── Auth ──────────────────────────────────────────────────────────────────────

// POST /api/auth/login — bcrypt + JWT + auto-migration from plaintext
router.post("/auth/login", loginLimit, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Usuario y contraseña requeridos" });
  }
  const { username, password } = parsed.data;

  try {
    const { rows } = await pool.query(
      "SELECT password, username FROM cv_auth WHERE id = 'admin'"
    );
    if (!rows[0]) {
      return res.status(401).json({
        error: "No hay usuario admin configurado. Ejecuta el script set-superadmin.sql",
      });
    }

    const storedHash = rows[0].password as string;
    const storedUsername = rows[0].username as string;

    if (username !== storedUsername) {
      return res.status(401).json({ error: "Usuario o contraseña incorrectos." });
    }

    let passwordValid = false;

    if (isBcryptHash(storedHash)) {
      passwordValid = await verifyPassword(password, storedHash);
    } else {
      // Legacy plaintext — auto-migrate on successful login
      if (password === storedHash) {
        passwordValid = true;
        hashPassword(password).then((hashed) => {
          pool.query("UPDATE cv_auth SET password = $1 WHERE id = 'admin'", [hashed])
            .catch(() => {});
        });
      }
    }

    if (!passwordValid) {
      return res.status(401).json({ error: "Usuario o contraseña incorrectos." });
    }

    const token = generateToken(username);
    return res.json({ ok: true, token });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
});

// POST /api/auth/change-password — stores bcrypt hash
router.post("/auth/change-password", async (req, res) => {
  if (!requireAuth(req, res)) return;

  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Contraseña requerida", details: parsed.error.issues });
  }

  const { password, username } = parsed.data;
  try {
    const hashed = await hashPassword(password);
    if (username) {
      await pool.query(
        "UPDATE cv_auth SET password = $1, username = $2 WHERE id = 'admin'",
        [hashed, username]
      );
    } else {
      await pool.query("UPDATE cv_auth SET password = $1 WHERE id = 'admin'", [hashed]);
    }
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
});

// ── Backfill cast ─────────────────────────────────────────────────────────────

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

        await new Promise(r => setTimeout(r, 120));
      } catch {
        errorCount++;
      }

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

export default router;
