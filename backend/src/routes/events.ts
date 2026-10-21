import { Router, type Request, type Response } from "express";
import { pool } from "../lib/db";
import { requireAdmin } from "../middlewares/adminAuth";
import { asyncHandler, parseBody, parseIntParam, parseStringParam } from "../lib/http";
import { badRequest, notFound, sendError } from "../lib/errors";
import { z } from "zod";
import { logger } from "../lib/logger";

const router = Router();

// ─── Schemas ──────────────────────────────────────────────────────────────────

const channelSchema = z.object({
  name: z.string().min(1, "El nombre es obligatorio").max(120),
  url: z
    .string()
    .min(1, "La URL es obligatoria")
    .max(300)
    .refine(
      (value) => /^https:\/\/(www\.)?(youtube\.com|youtu\.be)\//i.test(value),
      "La URL debe ser un canal de YouTube (https://www.youtube.com/...)",
    ),
  keyword: z.string().max(120).optional().default(""),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getYoutubeApiKey(): Promise<string> {
  if (process.env["YOUTUBE_API_KEY"]) return process.env["YOUTUBE_API_KEY"];
  const { rows } = await pool.query("SELECT value FROM event_settings WHERE key = 'youtube_api_key'");
  if (!rows[0] || !rows[0].value) throw badRequest("YouTube API Key no configurada");
  return rows[0].value as string;
}

async function resolveChannelId(url: string, apiKey: string): Promise<string> {
  const directMatch = url.match(/\/channel\/(UC[\w-]+)/);
  if (directMatch) return directMatch[1];

  const handleMatch = url.match(/\/@([\w.-]+)/);
  if (handleMatch) {
    const handle = handleMatch[1];
    const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=${encodeURIComponent(
      "@" + handle,
    )}&key=${apiKey}&maxResults=1`;
    const res = await fetch(searchUrl, { signal: AbortSignal.timeout(12_000) });
    const data = (await res.json()) as { items?: { id?: { channelId?: string } }[] };
    const channelId = data.items?.[0]?.id?.channelId;
    if (!channelId) throw new Error(`No se encontró el ID del canal para el handle: @${handle}`);
    return channelId;
  }

  const userMatch = url.match(/\/user\/([\w.-]+)/);
  if (userMatch) {
    const username = userMatch[1];
    const userUrl = `https://www.googleapis.com/youtube/v3/channels?part=id&forUsername=${encodeURIComponent(
      username,
    )}&key=${apiKey}`;
    const res = await fetch(userUrl, { signal: AbortSignal.timeout(12_000) });
    const data = (await res.json()) as { items?: { id: string }[] };
    const channelId = data.items?.[0]?.id;
    if (!channelId) throw new Error(`No se encontró el canal para el usuario: ${username}`);
    return channelId;
  }

  throw new Error("URL de canal no reconocida. Use el formato /@handle o /channel/UC...");
}

function parseDurationToMinutes(duration: string): number {
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const hours = parseInt(match[1] || "0", 10);
  const minutes = parseInt(match[2] || "0", 10);
  return hours * 60 + minutes;
}

async function syncChannel(
  channelId: number,
  channelUrl: string,
  keyword: string,
  apiKey: string,
): Promise<{ imported: number; existed: number }> {
  const ytChannelId = await resolveChannelId(channelUrl, apiKey);

  const searchUrl =
    keyword && keyword.trim() !== ""
      ? `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${ytChannelId}&q=${encodeURIComponent(
          keyword,
        )}&type=video&order=date&maxResults=50&key=${apiKey}`
      : `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${ytChannelId}&type=video&order=date&maxResults=50&key=${apiKey}`;

  const res = await fetch(searchUrl, { signal: AbortSignal.timeout(15_000) });
  const data = (await res.json()) as {
    error?: { message?: string };
    items?: {
      id?: { videoId?: string };
      snippet?: { title?: string; thumbnails?: { medium?: { url?: string } }; publishedAt?: string };
    }[];
  };
  if (data.error) throw new Error(`Error de la API de YouTube: ${data.error.message ?? "desconocido"}`);

  const items = data.items ?? [];
  if (items.length === 0) return { imported: 0, existed: 0 };

  const videoIds = items.map((item) => item.id?.videoId).filter(Boolean) as string[];
  if (videoIds.length === 0) return { imported: 0, existed: 0 };

  const videosUrl = `https://www.googleapis.com/youtube/v3/videos?part=contentDetails,snippet&id=${videoIds.join(
    ",",
  )}&key=${apiKey}`;
  const vRes = await fetch(videosUrl, { signal: AbortSignal.timeout(15_000) });
  const vData = (await vRes.json()) as {
    error?: { message?: string };
    items?: {
      id: string;
      snippet: { title: string; thumbnails?: { medium?: { url?: string } }; publishedAt?: string };
      contentDetails: { duration: string };
    }[];
  };
  if (vData.error) throw new Error(`Error de la API de YouTube: ${vData.error.message ?? "desconocido"}`);

  let imported = 0;
  let existed = 0;

  for (const item of vData.items ?? []) {
    const durationMinutes = parseDurationToMinutes(item.contentDetails?.duration ?? "");
    if (durationMinutes < 30) continue;

    try {
      const { rowCount } = await pool.query(
        `INSERT INTO events (channel_id, yt_id, title, thumbnail, published_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (yt_id) DO NOTHING`,
        [
          channelId,
          item.id,
          item.snippet.title,
          item.snippet.thumbnails?.medium?.url ?? null,
          item.snippet.publishedAt ?? null,
        ],
      );
      if ((rowCount ?? 0) > 0) imported += 1;
      else existed += 1;
    } catch {
      existed += 1;
    }
  }

  return { imported, existed };
}

// ─── Settings ─────────────────────────────────────────────────────────────────

router.get(
  "/events/settings",
  requireAdmin,
  asyncHandler(async (_req: Request, res: Response) => {
    const { rows } = await pool.query("SELECT key, value FROM event_settings");
    const settings: Record<string, string> = {};
    for (const row of rows as Array<{ key: string; value: string }>) settings[row.key] = row.value;
    res.setHeader("Cache-Control", "no-store");
    res.json(settings);
  }),
);

router.post(
  "/events/settings",
  requireAdmin,
  asyncHandler(async (req: Request, res: Response) => {
    const { youtube_api_key } = parseBody(
      z.object({ youtube_api_key: z.string().min(10).max(200) }),
      req.body,
    );

    await pool.query(
      `INSERT INTO event_settings (key, value) VALUES ('youtube_api_key', $1)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [youtube_api_key],
    );
    res.json({ ok: true });
  }),
);

// ─── Channels ─────────────────────────────────────────────────────────────────

router.get(
  "/events/channels",
  asyncHandler(async (_req: Request, res: Response) => {
    const { rows } = await pool.query("SELECT * FROM event_channels ORDER BY date_added DESC");
    res.json(rows);
  }),
);

router.post(
  "/events/channels",
  requireAdmin,
  asyncHandler(async (req: Request, res: Response) => {
    const { name, url, keyword } = parseBody(channelSchema, req.body);

    const { rows } = await pool.query(
      `INSERT INTO event_channels (name, url, keyword) VALUES ($1, $2, NULLIF($3, ''))
       ON CONFLICT (url) DO UPDATE SET name = EXCLUDED.name, keyword = EXCLUDED.keyword
       RETURNING *`,
      [name, url, keyword],
    );
    res.json(rows[0]);
  }),
);

router.delete(
  "/events/channels/:id",
  requireAdmin,
  asyncHandler(async (req: Request, res: Response) => {
    const id = parseIntParam(req.params["id"], Number.NaN, { min: 1, name: "id" });
    if (!Number.isInteger(id)) throw badRequest("Identificador inválido");

    const result = await pool.query("DELETE FROM event_channels WHERE id = $1", [id]);
    if (result.rowCount === 0) throw notFound("Canal no encontrado");
    res.json({ ok: true });
  }),
);

router.post(
  "/events/channels/:id/sync",
  requireAdmin,
  asyncHandler(async (req: Request, res: Response) => {
    const id = parseIntParam(req.params["id"], Number.NaN, { min: 1, name: "id" });
    if (!Number.isInteger(id)) throw badRequest("Identificador inválido");

    const apiKey = await getYoutubeApiKey();
    const { rows } = await pool.query("SELECT * FROM event_channels WHERE id = $1", [id]);
    if (!rows[0]) throw notFound("Canal no encontrado");

    const channel = rows[0] as { id: number; url: string; keyword: string };
    const result = await syncChannel(channel.id, channel.url, channel.keyword, apiKey);
    res.json(result);
  }),
);

router.post(
  "/events/sync-all",
  requireAdmin,
  asyncHandler(async (_req: Request, res: Response) => {
    const apiKey = await getYoutubeApiKey();
    const { rows: channels } = await pool.query("SELECT * FROM event_channels");

    let totalImported = 0;
    let totalExisted = 0;
    const errors: string[] = [];

    for (const ch of channels as { id: number; name: string; url: string; keyword: string }[]) {
      try {
        const result = await syncChannel(ch.id, ch.url, ch.keyword, apiKey);
        totalImported += result.imported;
        totalExisted += result.existed;
      } catch (err) {
        logger.warn({ err, channel: ch.name }, "Event channel sync failed");
        errors.push(`${ch.name}: ${err instanceof Error ? err.message : "error"}`);
      }
    }

    res.json({ imported: totalImported, existed: totalExisted, errors });
  }),
);

// ─── Events (public) ──────────────────────────────────────────────────────────

router.get(
  "/events",
  asyncHandler(async (req: Request, res: Response) => {
    const q = parseStringParam(req.query["q"], { maxLength: 120, name: "q" });
    const limit = parseIntParam(req.query["limit"], 50, { min: 1, max: 100, name: "limit" });
    const offset = parseIntParam(req.query["offset"], 0, { min: 0, max: 10_000, name: "offset" });

    const params: (string | number)[] = [];
    let query = `
      SELECT e.id, e.yt_id, e.title, e.thumbnail, e.published_at, e.date_added, e.channel_id,
             c.name as channel_name
      FROM events e
      JOIN event_channels c ON c.id = e.channel_id
    `;

    if (q) {
      params.push(`%${q}%`);
      query += ` WHERE e.title ILIKE $${params.length}`;
    }

    query += ` ORDER BY e.published_at DESC NULLS LAST LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const { rows } = await pool.query(query, params);
    res.json(rows);
  }),
);

router.delete(
  "/events/:id",
  requireAdmin,
  asyncHandler(async (req: Request, res: Response) => {
    const id = parseIntParam(req.params["id"], Number.NaN, { min: 1, name: "id" });
    if (!Number.isInteger(id)) throw badRequest("Identificador inválido");

    await pool.query("DELETE FROM events WHERE id = $1", [id]);
    res.json({ ok: true });
  }),
);

router.use((err: unknown, req: Request, res: Response, _next: unknown) => {
  sendError(res, err, (req as Request & { requestId?: string }).requestId);
});

export default router;
