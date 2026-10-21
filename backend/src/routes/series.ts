import { Router, type Request, type Response } from "express";
import { pool } from "../lib/db";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { requireAdmin } from "../middlewares/adminAuth";
import { asyncHandler, escapeLikePattern, parseBody, parsePagination, parseStringParam } from "../lib/http";
import { buildCatalogueSearch } from "../lib/catalogue-search";
import { badRequest, notFound, sendError } from "../lib/errors";

const router = Router();

const seriesLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiadas peticiones, por favor intenta más tarde." },
});

// ── Zod schemas ───────────────────────────────────────────────────────────────

const stringArray = z.array(z.string().max(200)).max(100).optional();

const seriesPayloadSchema = z
  .object({
    id: z.string().min(1).max(120).optional(),
    imdb_id: z.string().min(1).max(40).optional(),
    tmdb_id: z.number().int().positive().optional().nullable(),
    title: z.string().min(1, "El título es obligatorio").max(300),
    year: z.number().int().min(0).max(2100).optional(),
    end_year: z.number().int().min(0).max(2100).optional().nullable(),
    rating: z.number().min(0).max(10).optional(),
    genres: stringArray,
    language: z.string().max(20).optional(),
    synopsis: z.string().max(10_000).optional(),
    creators: stringArray,
    cast_list: stringArray,
    cast_full: z.array(z.record(z.string(), z.unknown())).max(50).optional(),
    networks: stringArray,
    poster_url: z.string().max(1000).optional(),
    background_url: z.string().max(1000).optional(),
    yt_trailer_code: z.string().max(50).optional(),
    videos: z.array(z.record(z.string(), z.unknown())).max(50).optional(),
    reviews: z.array(z.record(z.string(), z.unknown())).max(50).optional(),
    status: z.string().max(40).optional(),
    total_seasons: z.number().int().min(0).max(100).optional(),
    seasons_data: z.array(z.record(z.string(), z.unknown())).max(100).optional(),
    video_sources: z.array(z.record(z.string(), z.unknown())).max(50).optional(),
    featured: z.boolean().optional(),
    views: z.number().int().min(0).optional(),
  })
  .partial()
  .refine((data) => data.title !== undefined || data.id !== undefined, {
    message: "Se requiere al menos el título",
  });

// ── Serialiser ────────────────────────────────────────────────────────────────

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
  cast_full: row.cast_full ?? [],
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
  vidsrc_status: row.vidsrc_status ?? "unknown",
  auto_imported: row.auto_imported ?? false,
});

/** Columns an administrator may write. */
const SERIES_COLUMNS: Record<string, string> = {
  imdb_id: "imdb_id",
  tmdb_id: "tmdb_id",
  title: "title",
  year: "year",
  end_year: "end_year",
  rating: "rating",
  genres: "genres",
  language: "language",
  synopsis: "synopsis",
  creators: "creators",
  cast_list: "cast_list",
  cast_full: "cast_full",
  networks: "networks",
  poster_url: "poster_url",
  background_url: "background_url",
  yt_trailer_code: "yt_trailer_code",
  videos: "videos",
  reviews: "reviews",
  status: "status",
  total_seasons: "total_seasons",
  seasons_data: "seasons_data",
  video_sources: "video_sources",
  featured: "featured",
  views: "views",
};

const JSON_COLUMNS = new Set(["cast_full", "videos", "reviews", "video_sources", "seasons_data"]);

const SERIES_SORT_COLUMNS: Record<string, string> = {
  title: "title",
  year: "year",
  views: "views",
  date_added: "date_added",
  rating: "rating",
};

// ── Public endpoints ──────────────────────────────────────────────────────────

router.get(
  "/series",
  seriesLimit,
  asyncHandler(async (req: Request, res: Response) => {
    const { limit, offset } = parsePagination(req.query, { defaultLimit: 20, maxLimit: 100 });

    const { rows } = await pool.query(
      `SELECT id, imdb_id, tmdb_id, title, year, end_year, rating, genres, language, synopsis,
              creators, cast_list, networks, poster_url, background_url, yt_trailer_code,
              status, total_seasons, video_sources, featured, views, date_added,
              vidsrc_status, auto_imported,
              '[]'::jsonb AS videos, '[]'::jsonb AS reviews, '[]'::jsonb AS seasons_data,
              '[]'::jsonb AS cast_full
       FROM cv_series ORDER BY year DESC, date_added DESC LIMIT $1 OFFSET $2`,
      [limit, offset],
    );

    res.setHeader("Cache-Control", "public, max-age=300, stale-while-revalidate=3600");
    res.json(rows.map(toSeries));
  }),
);

/**
 * GET /api/series/catalogue — paginated catalogue with filters and sorting.
 */
router.get(
  "/series/catalogue",
  seriesLimit,
  asyncHandler(async (req: Request, res: Response) => {
    const { page, limit, offset } = parsePagination(req.query, { defaultLimit: 24, maxLimit: 60 });
    const q = parseStringParam(req.query["q"], { maxLength: 120, name: "q" });
    const genre = parseStringParam(req.query["genre"], { maxLength: 60, name: "genre" });
    const sortKey = parseStringParam(req.query["sort"], { maxLength: 20, name: "sort" }) ?? "year";
    const order = (
      parseStringParam(req.query["order"], { maxLength: 4, name: "order" }) ?? "desc"
    ).toLowerCase();

    const sortColumn = SERIES_SORT_COLUMNS[sortKey] ?? "year";
    const sortOrder = order === "asc" ? "ASC" : "DESC";

    const conditions: string[] = [];
    const params: unknown[] = [];
    let relevanceOrder: string | null = null;

    if (q) {
      const search = buildCatalogueSearch(
        q,
        {
          title: "title",
          synopsis: "synopsis",
          metadata: [
            "COALESCE(array_to_string(genres, ' '), '')",
            "COALESCE(array_to_string(creators, ' '), '')",
            "COALESCE(array_to_string(cast_list, ' '), '')",
            "COALESCE(array_to_string(networks, ' '), '')",
          ],
        },
        params.length + 1,
      );
      params.push(...search.params);
      conditions.push(search.condition);
      relevanceOrder = search.relevanceOrder;
    }
    if (genre) {
      params.push(genre);
      conditions.push(`${params.length} = ANY(genres)`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const countResult = await pool.query(`SELECT COUNT(*)::int AS total FROM cv_series ${where}`, params);
    const total = (countResult.rows[0] as { total: number }).total;

    const { rows } = await pool.query(
      `SELECT id, imdb_id, tmdb_id, title, year, end_year, rating, genres, language, synopsis,
              creators, cast_list, networks, poster_url, background_url, yt_trailer_code,
              status, total_seasons, video_sources, featured, views, date_added,
              vidsrc_status, auto_imported,
              '[]'::jsonb AS videos, '[]'::jsonb AS reviews, '[]'::jsonb AS seasons_data,
              '[]'::jsonb AS cast_full
       FROM cv_series ${where}
       ORDER BY ${relevanceOrder ? `${relevanceOrder}, ` : ""}${sortColumn} ${sortOrder} NULLS LAST, id ASC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset],
    );

    res.setHeader("Cache-Control", "public, max-age=120, stale-while-revalidate=600");
    res.json({
      items: rows.map(toSeries),
      total,
      page,
      limit,
      pages: Math.max(1, Math.ceil(total / limit)),
    });
  }),
);

router.get(
  "/series/trending",
  seriesLimit,
  asyncHandler(async (_req: Request, res: Response) => {
    const { rows } = await pool.query(
      `SELECT id, imdb_id, tmdb_id, title, year, end_year, rating, genres, language, synopsis,
              creators, cast_list, networks, poster_url, background_url, yt_trailer_code,
              status, total_seasons, video_sources, featured, views, date_added,
              vidsrc_status, auto_imported,
              '[]'::jsonb AS videos, '[]'::jsonb AS reviews, '[]'::jsonb AS seasons_data,
              '[]'::jsonb AS cast_full
       FROM cv_series ORDER BY views DESC, date_added DESC LIMIT 10`,
    );
    res.setHeader("Cache-Control", "public, max-age=1800, stale-while-revalidate=86400");
    res.json(rows.map(toSeries));
  }),
);

router.get(
  "/series/search",
  seriesLimit,
  asyncHandler(async (req: Request, res: Response) => {
    const q = parseStringParam(req.query["q"], { maxLength: 120, name: "q" });
    if (!q || q.trim().length < 2) {
      res.json([]);
      return;
    }
    const { limit, offset } = parsePagination(req.query, { defaultLimit: 20, maxLimit: 50 });
    const search = buildCatalogueSearch(q, {
      title: "title",
      synopsis: "synopsis",
      metadata: [
        "COALESCE(array_to_string(genres, ' '), '')",
        "COALESCE(array_to_string(keywords, ' '), '')",
        "COALESCE(array_to_string(creators, ' '), '')",
        "COALESCE(array_to_string(cast_list, ' '), '')",
        "COALESCE(array_to_string(networks, ' '), '')",
      ],
    });

    const { rows } = await pool.query(
      `SELECT id, imdb_id, tmdb_id, title, year, end_year, rating, genres, language, synopsis,
              creators, cast_list, networks, poster_url, background_url, yt_trailer_code,
              status, total_seasons, video_sources, featured, views, date_added,
              vidsrc_status, auto_imported,
              '[]'::jsonb AS videos, '[]'::jsonb AS reviews, '[]'::jsonb AS seasons_data,
              '[]'::jsonb AS cast_full
       FROM cv_series WHERE ${search.condition}
       ORDER BY ${search.relevanceOrder}, views DESC, date_added DESC LIMIT $${search.params.length + 1} OFFSET $${search.params.length + 2}`,
      [...search.params, limit, offset],
    );
    res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
    res.json(rows.map(toSeries));
  }),
);

router.get(
  "/series/:id",
  seriesLimit,
  asyncHandler(async (req: Request, res: Response) => {
    const id = parseStringParam(req.params["id"], { maxLength: 120, name: "id" });
    if (!id) throw notFound("Serie no encontrada");

    const { rows } = await pool.query(
      `SELECT id, imdb_id, tmdb_id, title, year, end_year, rating, genres, language, synopsis,
              creators, cast_list, cast_full, networks, poster_url, background_url, yt_trailer_code,
              videos, reviews, status, total_seasons, seasons_data, video_sources, featured, views,
              date_added, vidsrc_status, auto_imported
         FROM cv_series WHERE id = $1 OR imdb_id = $1 OR slug = $1`,
      [id],
    );
    if (!rows[0]) throw notFound("Serie no encontrada");
    res.json(toSeries(rows[0]));
  }),
);

router.patch(
  "/series/:id/view",
  seriesLimit,
  asyncHandler(async (req: Request, res: Response) => {
    const id = parseStringParam(req.params["id"], { maxLength: 120, name: "id" });
    if (id) {
      await pool.query("UPDATE cv_series SET views = views + 1 WHERE id = $1", [id]);
    }
    res.json({ ok: true });
  }),
);

// ── Admin endpoints ───────────────────────────────────────────────────────────

router.get(
  "/admin/series",
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

    const sortColumn = SERIES_SORT_COLUMNS[sortKey] ?? "date_added";
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

    const countResult = await pool.query(`SELECT COUNT(*)::int AS total FROM cv_series ${where}`, params);
    const total = (countResult.rows[0] as { total: number }).total;

    const { rows } = await pool.query(
      `SELECT id, imdb_id, tmdb_id, title, year, end_year, rating, genres, language, synopsis,
              creators, cast_list, networks, poster_url, background_url, yt_trailer_code,
              status, total_seasons, video_sources, featured, views, date_added,
              vidsrc_status, auto_imported,
              '[]'::jsonb AS videos, '[]'::jsonb AS reviews, '[]'::jsonb AS seasons_data,
              '[]'::jsonb AS cast_full
       FROM cv_series ${where}
       ORDER BY ${sortColumn} ${sortOrder} NULLS LAST, id ASC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset],
    );

    res.setHeader("Cache-Control", "no-store");
    res.json({
      items: rows.map(toSeries),
      total,
      page,
      limit,
      pages: Math.max(1, Math.ceil(total / limit)),
    });
  }),
);

router.post(
  "/admin/series",
  requireAdmin,
  asyncHandler(async (req: Request, res: Response) => {
    const payload = parseBody(seriesPayloadSchema, req.body) as Record<string, unknown>;
    const id = (req.params["id"] as string | undefined) ?? (payload["id"] as string | undefined);

    if (!id && !payload["title"]) {
      throw badRequest("Se requiere un identificador o un título");
    }
    const seriesId = id ?? `manual_${Date.now()}`;

    const entries = Object.entries(payload).filter(
      ([key, value]) => key !== "id" && key in SERIES_COLUMNS && value !== undefined,
    );

    if (entries.length === 0) {
      throw badRequest("No hay campos para guardar");
    }

    const columns = ["id", "imdb_id"];
    const values: unknown[] = [
      seriesId,
      // La columna es NOT NULL: las entradas manuales reciben un identificador
      // sintetico que nunca puede coincidir con un IMDb real.
      (payload["imdb_id"] as string | undefined) ??
        (seriesId.startsWith("tt") ? seriesId : `manual_${seriesId}`),
    ];
    const placeholders = ["$1", "$2"];
    const updateAssignments: string[] = [];

    for (const [key, value] of entries) {
      if (key === "imdb_id") continue;
      const column = SERIES_COLUMNS[key];
      values.push(JSON_COLUMNS.has(column) ? JSON.stringify(value) : value);
      const index = values.length;
      columns.push(column);
      placeholders.push(`$${index}`);
      updateAssignments.push(`${column} = $${index}`);
    }

    await pool.query(
      `INSERT INTO cv_series (${columns.join(", ")})
       VALUES (${placeholders.join(", ")})
       ON CONFLICT (id) DO UPDATE SET ${updateAssignments.join(", ")}`,
      values,
    );

    const { rows } = await pool.query("SELECT * FROM cv_series WHERE id = $1", [seriesId]);
    res.json(toSeries(rows[0]));
  }),
);

router.delete(
  "/admin/series/:id",
  requireAdmin,
  asyncHandler(async (req: Request, res: Response) => {
    const id = parseStringParam(req.params["id"], { maxLength: 120, name: "id" });
    if (!id) throw badRequest("Identificador inválido");

    const result = await pool.query("DELETE FROM cv_series WHERE id = $1", [id]);
    if (result.rowCount === 0) throw notFound("Serie no encontrada");
    res.json({ ok: true, deleted: result.rowCount });
  }),
);

router.post(
  "/admin/series/bulk-delete",
  requireAdmin,
  asyncHandler(async (req: Request, res: Response) => {
    const schema = z.object({ ids: z.array(z.string().min(1).max(120)).min(1).max(200) });
    const { ids } = parseBody(schema, req.body);

    const { rows } = await pool.query("DELETE FROM cv_series WHERE id = ANY($1::text[]) RETURNING id", [ids]);
    res.json({ ok: true, deleted: rows.length });
  }),
);

router.use((err: unknown, req: Request, res: Response, _next: unknown) => {
  sendError(res, err, (req as Request & { requestId?: string }).requestId);
});

export default router;
