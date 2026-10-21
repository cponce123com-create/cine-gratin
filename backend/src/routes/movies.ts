import { Router, type Request, type Response } from "express";
import { pool } from "../lib/db";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { currentClaims, requireAdmin } from "../middlewares/adminAuth";
import { revokeSession } from "../lib/session-store";
import { asyncHandler, parseBody, parsePagination, parseStringParam } from "../lib/http";
import { badRequest, notFound, sendError } from "../lib/errors";
import {
  generateCsrfToken,
  generateToken,
  hashPassword,
  isBcryptHash,
  sessionCookieOptions,
  SESSION_COOKIE,
  verifyPassword,
} from "../lib/auth-utils";
import { getConfig } from "../lib/config";

const router = Router();

// ── Rate limiters ─────────────────────────────────────────────────────────────

const movieLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiadas peticiones, por favor intenta más tarde." },
});

/** Stricter rate limit for the login endpoint. */
const loginLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: "Demasiados intentos de acceso. Intenta de nuevo en 15 minutos." },
});

/** Changing the password is a sensitive operation. */
const passwordChangeLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiados cambios de contraseña. Intenta más tarde." },
});

// ── Zod schemas ───────────────────────────────────────────────────────────────

const loginSchema = z.object({
  username: z.string().min(1, "Usuario requerido").max(120),
  password: z.string().min(1, "Contraseña requerida").max(200),
});

const changePasswordSchema = z.object({
  password: z
    .string()
    .min(10, "La contraseña debe tener al menos 10 caracteres")
    .max(200)
    .regex(/[a-z]/, "Debe incluir al menos una letra minúscula")
    .regex(/[A-Z]/, "Debe incluir al menos una letra mayúscula")
    .regex(/[0-9]/, "Debe incluir al menos un número"),
  username: z.string().min(3).max(60).optional(),
});

const settingsSchema = z.record(z.string().min(1).max(80), z.string().max(5000));

const serverSchema = z.object({
  id: z.string().min(1).max(80),
  name: z.string().min(1).max(120),
  base_url: z.string().max(500).optional().default(""),
  active: z.boolean().optional().default(true),
  sort_order: z.number().int().min(0).max(10_000).optional().default(0),
});

const serversSchema = z.array(serverSchema).max(50);

const stringArray = z.array(z.string().max(200)).max(100).optional();

const moviePayloadSchema = z
  .object({
    id: z.string().min(1).max(120).optional(),
    imdb_id: z.string().min(1).max(40).optional(),
    tmdb_id: z.number().int().positive().optional().nullable(),
    title: z.string().min(1, "El título es obligatorio").max(300),
    year: z.number().int().min(0).max(2100).optional(),
    rating: z.number().min(0).max(10).optional(),
    runtime: z.number().int().min(0).max(1000).optional(),
    genres: stringArray,
    language: z.string().max(20).optional(),
    synopsis: z.string().max(10_000).optional(),
    director: z.string().max(200).optional(),
    cast_list: stringArray,
    cast_full: z.array(z.record(z.string(), z.unknown())).max(50).optional(),
    networks: stringArray,
    poster_url: z.string().max(1000).optional(),
    background_url: z.string().max(1000).optional(),
    yt_trailer_code: z.string().max(50).optional(),
    videos: z.array(z.record(z.string(), z.unknown())).max(50).optional(),
    reviews: z.array(z.record(z.string(), z.unknown())).max(50).optional(),
    mpa_rating: z.string().max(20).optional(),
    slug: z.string().max(300).optional(),
    featured: z.boolean().optional(),
    video_sources: z.array(z.record(z.string(), z.unknown())).max(50).optional(),
    torrents: z.array(z.record(z.string(), z.unknown())).max(50).optional(),
    views: z.number().int().min(0).optional(),
  })
  .partial()
  .refine((data) => data.title !== undefined || data.id !== undefined, {
    message: "Se requiere al menos el título",
  });

// ── Serialisers ───────────────────────────────────────────────────────────────

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
  vidsrc_status: row.vidsrc_status ?? "unknown",
  auto_imported: row.auto_imported ?? false,
});

/** Columns that an administrator may write. Anything else is ignored. */
const MOVIE_COLUMNS: Record<string, string> = {
  imdb_id: "imdb_id",
  tmdb_id: "tmdb_id",
  title: "title",
  year: "year",
  rating: "rating",
  runtime: "runtime",
  genres: "genres",
  language: "language",
  synopsis: "synopsis",
  director: "director",
  cast_list: "cast_list",
  cast_full: "cast_full",
  networks: "networks",
  poster_url: "poster_url",
  background_url: "background_url",
  yt_trailer_code: "yt_trailer_code",
  videos: "videos",
  reviews: "reviews",
  mpa_rating: "mpa_rating",
  slug: "slug",
  featured: "featured",
  video_sources: "video_sources",
  torrents: "torrents",
  views: "views",
};

const JSON_COLUMNS = new Set(["cast_full", "videos", "reviews", "video_sources", "torrents"]);

// ── Public movie endpoints ────────────────────────────────────────────────────

// GET /api/movies — paginated, capped
router.get(
  "/movies",
  movieLimit,
  asyncHandler(async (req: Request, res: Response) => {
    const { limit, offset } = parsePagination(req.query, { defaultLimit: 20, maxLimit: 100 });

    const { rows } = await pool.query(
      `SELECT id, imdb_id, tmdb_id, title, year, rating, runtime, genres, language, synopsis,
              director, cast_list, networks, poster_url, background_url, yt_trailer_code,
              mpa_rating, slug, featured, video_sources, torrents, views, date_added,
              vidsrc_status, auto_imported,
              '[]'::jsonb AS videos, '[]'::jsonb AS reviews, '[]'::jsonb AS cast_full
       FROM movies ORDER BY year DESC, date_added DESC LIMIT $1 OFFSET $2`,
      [limit, offset],
    );

    res.setHeader("Cache-Control", "public, max-age=300, stale-while-revalidate=3600");
    res.json(rows.map(toMovie));
  }),
);

/**
 * GET /api/genres?type=movie|series — genres present in the catalogue.
 * Used by the public filter, so the list is always in sync with the content.
 */
router.get(
  "/genres",
  movieLimit,
  asyncHandler(async (req: Request, res: Response) => {
    const type = req.query["type"] === "series" ? "series" : "movie";
    const table = type === "series" ? "cv_series" : "movies";

    const { rows } = await pool.query(
      `SELECT DISTINCT unnest(genres) AS genre
         FROM ${table}
        WHERE genres IS NOT NULL AND array_length(genres, 1) > 0
        ORDER BY genre ASC
        LIMIT 60`,
    );

    res.setHeader("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");
    res.json(rows.map((row) => (row as { genre: string }).genre));
  }),
);

/**
 * GET /api/movies/catalogue — paginated catalogue with filters and sorting.
 * The public list pages use it so the browser never downloads the whole
 * catalogue and the filters are applied by the database.
 */
router.get(
  "/movies/catalogue",
  movieLimit,
  asyncHandler(async (req: Request, res: Response) => {
    const { page, limit, offset } = parsePagination(req.query, { defaultLimit: 24, maxLimit: 60 });
    const q = parseStringParam(req.query["q"], { maxLength: 120, name: "q" });
    const genre = parseStringParam(req.query["genre"], { maxLength: 60, name: "genre" });
    const sortKey = parseStringParam(req.query["sort"], { maxLength: 20, name: "sort" }) ?? "year";
    const order = (
      parseStringParam(req.query["order"], { maxLength: 4, name: "order" }) ?? "desc"
    ).toLowerCase();

    const sortColumn = MOVIE_SORT_COLUMNS[sortKey] ?? "year";
    const sortOrder = order === "asc" ? "ASC" : "DESC";

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (q) {
      params.push(`%${q}%`);
      conditions.push(`(title ILIKE $${params.length} OR synopsis ILIKE $${params.length})`);
    }
    if (genre) {
      params.push(genre);
      conditions.push(`$${params.length} = ANY(genres)`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const countResult = await pool.query(`SELECT COUNT(*)::int AS total FROM movies ${where}`, params);
    const total = (countResult.rows[0] as { total: number }).total;

    const { rows } = await pool.query(
      `SELECT id, imdb_id, tmdb_id, title, year, rating, runtime, genres, language, synopsis,
              director, cast_list, networks, poster_url, background_url, yt_trailer_code,
              mpa_rating, slug, featured, video_sources, torrents, views, date_added,
              vidsrc_status, auto_imported,
              '[]'::jsonb AS videos, '[]'::jsonb AS reviews, '[]'::jsonb AS cast_full
       FROM movies ${where}
       ORDER BY ${sortColumn} ${sortOrder} NULLS LAST, id ASC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset],
    );

    res.setHeader("Cache-Control", "public, max-age=120, stale-while-revalidate=600");
    res.json({
      items: rows.map(toMovie),
      total,
      page,
      limit,
      pages: Math.max(1, Math.ceil(total / limit)),
    });
  }),
);

// GET /api/movies/featured
router.get(
  "/movies/featured",
  movieLimit,
  asyncHandler(async (_req: Request, res: Response) => {
    const { rows } = await pool.query(
      `SELECT id, imdb_id, tmdb_id, title, year, rating, runtime, genres, language, synopsis,
              director, cast_list, networks, poster_url, background_url, yt_trailer_code,
              mpa_rating, slug, featured, video_sources, torrents, views, date_added,
              vidsrc_status, auto_imported,
              '[]'::jsonb AS videos, '[]'::jsonb AS reviews, '[]'::jsonb AS cast_full
       FROM movies WHERE featured = TRUE ORDER BY date_added DESC LIMIT 10`,
    );
    res.setHeader("Cache-Control", "public, max-age=600, stale-while-revalidate=7200");
    res.json(rows.map(toMovie));
  }),
);

// GET /api/movies/trending
router.get(
  "/movies/trending",
  movieLimit,
  asyncHandler(async (_req: Request, res: Response) => {
    const { rows } = await pool.query(
      `SELECT id, imdb_id, tmdb_id, title, year, rating, runtime, genres, language, synopsis,
              director, cast_list, networks, poster_url, background_url, yt_trailer_code,
              mpa_rating, slug, featured, video_sources, torrents, views, date_added,
              vidsrc_status, auto_imported,
              '[]'::jsonb AS videos, '[]'::jsonb AS reviews, '[]'::jsonb AS cast_full
       FROM movies ORDER BY views DESC, date_added DESC LIMIT 10`,
    );
    res.setHeader("Cache-Control", "public, max-age=1800, stale-while-revalidate=86400");
    res.json(rows.map(toMovie));
  }),
);

// GET /api/movies/search?q=...
router.get(
  "/movies/search",
  movieLimit,
  asyncHandler(async (req: Request, res: Response) => {
    const q = parseStringParam(req.query["q"], { maxLength: 120, name: "q" });
    if (!q) {
      res.json([]);
      return;
    }
    const { limit } = parsePagination(req.query, { defaultLimit: 20, maxLimit: 50 });

    const { rows } = await pool.query(
      `SELECT id, imdb_id, tmdb_id, title, year, rating, runtime, genres, language, synopsis,
              director, cast_list, networks, poster_url, background_url, yt_trailer_code,
              mpa_rating, slug, featured, video_sources, torrents, views, date_added,
              vidsrc_status, auto_imported,
              '[]'::jsonb AS videos, '[]'::jsonb AS reviews, '[]'::jsonb AS cast_full
       FROM movies WHERE title ILIKE $1 OR synopsis ILIKE $1
       ORDER BY views DESC, date_added DESC LIMIT $2`,
      [`%${q}%`, limit],
    );
    res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
    res.json(rows.map(toMovie));
  }),
);

// GET /api/movies/by-slug/:slug
router.get(
  "/movies/by-slug/:slug",
  movieLimit,
  asyncHandler(async (req: Request, res: Response) => {
    const slug = parseStringParam(req.params["slug"], { maxLength: 300, name: "slug" });
    if (!slug) throw notFound("Película no encontrada");

    const { rows } = await pool.query("SELECT * FROM movies WHERE slug = $1 OR id = $1 OR imdb_id = $1", [
      slug,
    ]);
    if (!rows[0]) throw notFound("Película no encontrada");
    res.json(toMovie(rows[0]));
  }),
);

// GET /api/movies/:id
router.get(
  "/movies/:id",
  movieLimit,
  asyncHandler(async (req: Request, res: Response) => {
    const id = parseStringParam(req.params["id"], { maxLength: 120, name: "id" });
    if (!id) throw notFound("Película no encontrada");

    let { rows } = await pool.query("SELECT * FROM movies WHERE id = $1", [id]);
    if (!rows[0]) {
      const result = await pool.query("SELECT * FROM movies WHERE slug = $1 OR imdb_id = $1", [id]);
      rows = result.rows;
    }
    if (!rows[0]) throw notFound("Película no encontrada");
    res.json(toMovie(rows[0]));
  }),
);

// PATCH /api/movies/:id/view — public counter
router.patch(
  "/movies/:id/view",
  movieLimit,
  asyncHandler(async (req: Request, res: Response) => {
    const id = parseStringParam(req.params["id"], { maxLength: 120, name: "id" });
    if (id) {
      await pool.query("UPDATE movies SET views = views + 1 WHERE id = $1", [id]);
    }
    res.json({ ok: true });
  }),
);

// ── Admin: catalogue management ──────────────────────────────────────────────

/** Sort options accepted by the admin catalogue listing. */
const MOVIE_SORT_COLUMNS: Record<string, string> = {
  title: "title",
  year: "year",
  views: "views",
  date_added: "date_added",
  rating: "rating",
  updated: "date_added",
};

router.get(
  "/admin/movies",
  requireAdmin,
  asyncHandler(async (req: Request, res: Response) => {
    const { page, limit, offset } = parsePagination(req.query, { defaultLimit: 20, maxLimit: 100 });
    const q = parseStringParam(req.query["q"], { maxLength: 120, name: "q" });
    const genre = parseStringParam(req.query["genre"], { maxLength: 60, name: "genre" });
    const vidsrc = parseStringParam(req.query["vidsrc"], { maxLength: 20, name: "vidsrc" });
    const autoImported = parseStringParam(req.query["auto_imported"], {
      maxLength: 5,
      name: "auto_imported",
    });
    const year = req.query["year"];
    const sortKey = parseStringParam(req.query["sort"], { maxLength: 20, name: "sort" }) ?? "date_added";
    const order = (
      parseStringParam(req.query["order"], { maxLength: 4, name: "order" }) ?? "desc"
    ).toLowerCase();

    const sortColumn = MOVIE_SORT_COLUMNS[sortKey] ?? "date_added";
    const sortOrder = order === "asc" ? "ASC" : "DESC";

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (q) {
      params.push(`%${q}%`);
      conditions.push(`(title ILIKE $${params.length} OR imdb_id ILIKE $${params.length})`);
    }
    if (genre) {
      params.push(genre);
      conditions.push(`$${params.length} = ANY(genres)`);
    }
    if (vidsrc) {
      params.push(vidsrc);
      conditions.push(`vidsrc_status = $${params.length}`);
    }
    if (autoImported === "true" || autoImported === "false") {
      params.push(autoImported === "true");
      conditions.push(`auto_imported = $${params.length}`);
    }
    if (year !== undefined && year !== "") {
      const parsedYear = Number(year);
      if (!Number.isInteger(parsedYear) || parsedYear < 0 || parsedYear > 2100) {
        throw badRequest("El parámetro 'year' no es válido");
      }
      params.push(parsedYear);
      conditions.push(`year = $${params.length}`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const countResult = await pool.query(`SELECT COUNT(*)::int AS total FROM movies ${where}`, params);
    const total = (countResult.rows[0] as { total: number }).total;

    const listParams = [...params, limit, offset];
    const { rows } = await pool.query(
      `SELECT id, imdb_id, tmdb_id, title, year, rating, runtime, genres, language, synopsis,
              director, cast_list, networks, poster_url, background_url, yt_trailer_code,
              mpa_rating, slug, featured, video_sources, torrents, views, date_added,
              vidsrc_status, auto_imported,
              '[]'::jsonb AS videos, '[]'::jsonb AS reviews, '[]'::jsonb AS cast_full
       FROM movies ${where}
       ORDER BY ${sortColumn} ${sortOrder} NULLS LAST, id ASC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      listParams,
    );

    res.setHeader("Cache-Control", "no-store");
    res.json({
      items: rows.map(toMovie),
      total,
      page,
      limit,
      pages: Math.max(1, Math.ceil(total / limit)),
    });
  }),
);

/** POST /api/admin/movies/:id — partial upsert. */
router.post(
  "/admin/movies",
  requireAdmin,
  asyncHandler(async (req: Request, res: Response) => {
    const payload = parseBody(moviePayloadSchema, req.body) as Record<string, unknown>;
    const id = (req.params["id"] as string | undefined) ?? (payload["id"] as string | undefined);

    if (!id && !payload["title"]) {
      throw badRequest("Se requiere un identificador o un título");
    }
    const movieId = id ?? `manual_${Date.now()}`;

    const entries = Object.entries(payload).filter(
      ([key, value]) => key !== "id" && key in MOVIE_COLUMNS && value !== undefined,
    );

    if (entries.length === 0) {
      throw badRequest("No hay campos para guardar");
    }

    const columns = ["id", "imdb_id"];
    const values: unknown[] = [
      movieId,
      // The column is NOT NULL: manual entries get a synthetic identifier that
      // can never collide with a real IMDb id (the unique index only covers
      // identifiers with the "tt" format).
      (payload["imdb_id"] as string | undefined) ??
        (movieId.startsWith("tt") ? movieId : `manual_${movieId}`),
    ];
    const placeholders = ["$1", "$2"];
    const updateAssignments: string[] = [];

    for (const [key, value] of entries) {
      if (key === "imdb_id") continue;
      const column = MOVIE_COLUMNS[key];
      values.push(JSON_COLUMNS.has(column) ? JSON.stringify(value) : value);
      const index = values.length;
      columns.push(column);
      placeholders.push(`$${index}`);
      updateAssignments.push(`${column} = $${index}`);
    }

    await pool.query(
      `INSERT INTO movies (${columns.join(", ")})
       VALUES (${placeholders.join(", ")})
       ON CONFLICT (id) DO UPDATE SET ${updateAssignments.join(", ")}`,
      values,
    );

    const { rows } = await pool.query("SELECT * FROM movies WHERE id = $1", [movieId]);
    res.json(toMovie(rows[0]));
  }),
);

// DELETE /api/admin/movies/:id
router.delete(
  "/admin/movies/:id",
  requireAdmin,
  asyncHandler(async (req: Request, res: Response) => {
    const id = parseStringParam(req.params["id"], { maxLength: 120, name: "id" });
    if (!id) throw badRequest("Identificador inválido");

    const result = await pool.query("DELETE FROM movies WHERE id = $1", [id]);
    if (result.rowCount === 0) throw notFound("Película no encontrada");
    res.json({ ok: true, deleted: result.rowCount });
  }),
);

/** POST /api/admin/movies/bulk-delete — deletes several entries at once. */
router.post(
  "/admin/movies/bulk-delete",
  requireAdmin,
  asyncHandler(async (req: Request, res: Response) => {
    const schema = z.object({ ids: z.array(z.string().min(1).max(120)).min(1).max(200) });
    const { ids } = parseBody(schema, req.body);

    const { rows } = await pool.query("DELETE FROM movies WHERE id = ANY($1::text[]) RETURNING id", [ids]);
    res.json({ ok: true, deleted: rows.length });
  }),
);

// ── Settings ─────────────────────────────────────────────────────────────────

/** Settings whose value must never be exposed publicly. */
const SENSITIVE_SETTING_PATTERN = /(key|secret|token|password|credential)/i;

router.get(
  "/settings",
  asyncHandler(async (_req: Request, res: Response) => {
    const { rows } = await pool.query("SELECT key, value FROM cv_settings");
    const settings: Record<string, string> = {};
    for (const row of rows as Array<{ key: string; value: string }>) {
      if (SENSITIVE_SETTING_PATTERN.test(row.key)) continue;
      settings[row.key] = row.value;
    }
    res.setHeader("Cache-Control", "no-store");
    res.json(settings);
  }),
);

// GET /api/admin/settings — full list, including sensitive values (admin only)
router.get(
  "/admin/settings",
  requireAdmin,
  asyncHandler(async (_req: Request, res: Response) => {
    const { rows } = await pool.query("SELECT key, value FROM cv_settings");
    const settings: Record<string, string> = {};
    for (const row of rows as Array<{ key: string; value: string }>) {
      settings[row.key] = row.value;
    }
    res.setHeader("Cache-Control", "no-store");
    res.json(settings);
  }),
);

// POST /api/settings
router.post(
  "/settings",
  requireAdmin,
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = parseBody(settingsSchema, req.body);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const [key, value] of Object.entries(parsed)) {
        await client.query(
          `INSERT INTO cv_settings (key, value) VALUES ($1, $2)
           ON CONFLICT (key) DO UPDATE SET value = $2`,
          [key, String(value)],
        );
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }

    res.json({ ok: true, updated: Object.keys(parsed).length });
  }),
);

// ── Servers ──────────────────────────────────────────────────────────────────

router.get(
  "/servers",
  asyncHandler(async (_req: Request, res: Response) => {
    const { rows } = await pool.query("SELECT * FROM cv_servers ORDER BY sort_order");
    res.setHeader("Cache-Control", "public, max-age=300");
    res.json(rows);
  }),
);

// POST /api/servers — replaces the whole list inside a transaction.
router.post(
  "/servers",
  requireAdmin,
  asyncHandler(async (req: Request, res: Response) => {
    const servers = parseBody(serversSchema, req.body);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM cv_servers");
      for (const server of servers) {
        await client.query(
          `INSERT INTO cv_servers (id, name, base_url, active, sort_order) VALUES ($1,$2,$3,$4,$5)`,
          [server.id, server.name, server.base_url, server.active, server.sort_order],
        );
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }

    res.json({ ok: true, count: servers.length });
  }),
);

// ── Auth ──────────────────────────────────────────────────────────────────────

/**
 * POST /api/auth/login
 * On success the session is stored in an HttpOnly cookie so the token is not
 * reachable from JavaScript (mitigating token theft through XSS).
 */
router.post(
  "/auth/login",
  loginLimit,
  asyncHandler(async (req: Request, res: Response) => {
    const { username, password } = parseBody(loginSchema, req.body);

    const { rows } = await pool.query("SELECT password, username FROM cv_auth WHERE id = 'admin'");
    if (!rows[0]) {
      res.status(401).json({
        error: "No hay usuario administrador configurado. Ejecuta scripts/set-superadmin.sql",
      });
      return;
    }

    const storedHash = rows[0].password as string;
    const storedUsername = rows[0].username as string;

    let passwordValid = false;
    if (isBcryptHash(storedHash)) {
      passwordValid = await verifyPassword(password, storedHash);
    } else if (password === storedHash) {
      // Legacy plaintext password: migrate it to bcrypt on the first success.
      passwordValid = true;
      void hashPassword(password)
        .then((hashed) => pool.query("UPDATE cv_auth SET password = $1 WHERE id = 'admin'", [hashed]))
        .catch(() => undefined);
    }

    // The same message is returned for an unknown user and a wrong password so
    // the endpoint cannot be used to enumerate accounts.
    if (!passwordValid || username !== storedUsername) {
      res.status(401).json({ error: "Usuario o contraseña incorrectos." });
      return;
    }

    // The CSRF token travels inside the session and is handed to the client
    // so it can echo it in the X-CSRF-Token header on mutating requests.
    const csrfToken = generateCsrfToken();
    const token = generateToken(storedUsername, csrfToken);
    res.cookie(SESSION_COOKIE, token, sessionCookieOptions());
    res.setHeader("Cache-Control", "no-store");
    res.json({ ok: true, csrfToken, expiresIn: getConfig().sessionTtlSeconds });
  }),
);

/** POST /api/auth/logout — clears the session cookie. */
router.post(
  "/auth/logout",
  asyncHandler(async (req: Request, res: Response) => {
    // The session is revoked on the server: a copy of the token stops working
    // immediately, not when it expires.
    const claims = await currentClaims(req);
    await revokeSession(claims);

    const config = getConfig();
    res.clearCookie(SESSION_COOKIE, {
      path: "/",
      sameSite: config.cookieSameSite,
      secure: config.cookieSecure,
      httpOnly: true,
    });
    res.setHeader("Cache-Control", "no-store");
    res.json({ ok: true });
  }),
);

/** GET /api/auth/session — used by the frontend to know whether it is signed in. */
router.get(
  "/auth/session",
  asyncHandler(async (req: Request, res: Response) => {
    res.setHeader("Cache-Control", "no-store");
    const claims = await currentClaims(req);
    res.json({
      authenticated: Boolean(claims),
      // The client needs it to sign mutating requests.
      ...(claims ? { csrfToken: claims.csrf } : {}),
    });
  }),
);

/** POST /api/auth/change-password */
router.post(
  "/auth/change-password",
  requireAdmin,
  passwordChangeLimit,
  asyncHandler(async (req: Request, res: Response) => {
    const { password, username } = parseBody(changePasswordSchema, req.body);
    const hashed = await hashPassword(password);

    if (username) {
      await pool.query("UPDATE cv_auth SET password = $1, username = $2 WHERE id = 'admin'", [
        hashed,
        username,
      ]);
    } else {
      await pool.query("UPDATE cv_auth SET password = $1 WHERE id = 'admin'", [hashed]);
    }

    res.json({ ok: true });
  }),
);

// ── Backfill cast ─────────────────────────────────────────────────────────────

router.get(
  "/admin/backfill-cast-stream",
  requireAdmin,
  asyncHandler(async (req: Request, res: Response) => {
    const type = req.query["type"] === "series" ? "series" : "movie";
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
         ORDER BY date_added DESC`,
      );

      send("start", { total: rows.length });

      let updated = 0,
        skipped = 0,
        errorCount = 0;

      for (let i = 0; i < rows.length; i++) {
        if (req.destroyed) break;
        const row = rows[i] as { id: string; imdb_id: string; title: string };

        try {
          const findRes = await fetch(
            `https://api.themoviedb.org/3/find/${encodeURIComponent(row.imdb_id)}?external_source=imdb_id&api_key=${process.env["TMDB_API_KEY"] ?? ""}`,
            { signal: AbortSignal.timeout(12_000) },
          );
          if (!findRes.ok) {
            skipped++;
            continue;
          }

          const findData = (await findRes.json()) as {
            movie_results?: { id: number }[];
            tv_results?: { id: number }[];
          };

          const tmdbId = type === "series" ? findData.tv_results?.[0]?.id : findData.movie_results?.[0]?.id;
          if (!tmdbId) {
            skipped++;
            continue;
          }

          const creditsRes = await fetch(
            `https://api.themoviedb.org/3/${type === "series" ? "tv" : "movie"}/${tmdbId}/credits?language=es-MX&api_key=${process.env["TMDB_API_KEY"] ?? ""}`,
            { signal: AbortSignal.timeout(12_000) },
          );
          if (!creditsRes.ok) {
            skipped++;
            continue;
          }

          const credits = (await creditsRes.json()) as {
            cast?: Array<{
              id: number;
              name: string;
              character: string;
              profile_path: string | null;
              order: number;
            }>;
          };

          const TMDB_IMG = "https://image.tmdb.org/t/p";
          const castFull = (credits.cast ?? [])
            .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
            .slice(0, 15)
            .map((c) => ({
              id: c.id,
              name: c.name,
              character: c.character || "",
              profile_url: c.profile_path ? `${TMDB_IMG}/w185${c.profile_path}` : null,
            }));

          await pool.query(`UPDATE ${table} SET cast_full = $1 WHERE id = $2`, [
            JSON.stringify(castFull),
            row.id,
          ]);

          updated++;
          send("progress", {
            i: i + 1,
            total: rows.length,
            title: row.title,
            status: "updated",
            cast_count: castFull.length,
            updated,
            skipped,
            error: errorCount,
          });

          await new Promise((r) => setTimeout(r, 120));
        } catch {
          errorCount++;
        }
      }

      send("done", { total: rows.length, updated, skipped, error: errorCount });
      res.end();
    } catch (err) {
      send("error", { message: "Error durante el relleno del reparto" });
      res.end();
    }
  }),
);

// Final safety net: any error thrown inside a route reaches the handler.
router.use((err: unknown, req: Request, res: Response, _next: unknown) => {
  sendError(res, err, (req as Request & { requestId?: string }).requestId);
});

export default router;
