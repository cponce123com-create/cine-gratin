import { Router } from "express";
import { pool } from "../lib/db";

const router = Router();

// ─── Init table ───────────────────────────────────────────────────────────────

export async function initSportsTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sport_channels (
      id          SERIAL PRIMARY KEY,
      name        TEXT NOT NULL,
      url         TEXT NOT NULL UNIQUE,
      keyword     TEXT NOT NULL DEFAULT 'FULL MATCH',
      date_added  TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS sport_matches (
      id           SERIAL PRIMARY KEY,
      channel_id   INTEGER REFERENCES sport_channels(id) ON DELETE CASCADE,
      yt_id        TEXT NOT NULL UNIQUE,
      title        TEXT NOT NULL,
      thumbnail    TEXT,
      published_at TIMESTAMPTZ,
      date_added   TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS sport_settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getYoutubeApiKey(): Promise<string> {
  if (process.env["YOUTUBE_API_KEY"]) return process.env["YOUTUBE_API_KEY"];
  const { rows } = await pool.query(
    "SELECT value FROM sport_settings WHERE key = 'youtube_api_key'"
  );
  if (!rows[0]) throw new Error("YouTube API Key no configurada");
  return rows[0].value;
}

async function resolveChannelId(url: string, apiKey: string): Promise<string> {
  // 1. Direct /channel/UC... format
  const directMatch = url.match(/\/channel\/(UC[\w-]+)/);
  if (directMatch) return directMatch[1];

  // 2. Handle format /@handle
  const handleMatch = url.match(/\/@([\w.-]+)/);
  if (handleMatch) {
    const handle = handleMatch[1];
    // Search for the channel by handle (using the 'q' parameter with type=channel is the most reliable way for handles)
    const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=${encodeURIComponent("@" + handle)}&key=${apiKey}&maxResults=1`;
    const res = await fetch(searchUrl);
    const data = (await res.json()) as { items?: { id?: { channelId?: string } }[] };
    const channelId = data.items?.[0]?.id?.channelId;
    if (!channelId) throw new Error(`No se encontró el ID del canal para el handle: @${handle}`);
    return channelId;
  }

  // 3. Legacy /user/ format
  const userMatch = url.match(/\/user\/([\w.-]+)/);
  if (userMatch) {
    const username = userMatch[1];
    const userUrl = `https://www.googleapis.com/youtube/v3/channels?part=id&forUsername=${encodeURIComponent(username)}&key=${apiKey}`;
    const res = await fetch(userUrl);
    const data = (await res.json()) as { items?: { id: string }[] };
    const channelId = data.items?.[0]?.id;
    if (!channelId) throw new Error(`No se encontró el canal para el usuario: ${username}`);
    return channelId;
  }

  throw new Error("URL de canal no reconocida. Use el formato /@handle o /channel/UC...");
}

/**
 * Parses ISO 8601 duration string (e.g. PT1H2M10S) to minutes
 */
function parseDurationToMinutes(duration: string): number {
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const hours = parseInt(match[1] || "0", 10);
  const minutes = parseInt(match[2] || "0", 10);
  // We ignore seconds for the 50 min threshold
  return hours * 60 + minutes;
}

async function syncChannel(
  channelId: number,
  channelUrl: string,
  keyword: string,
  apiKey: string
): Promise<{ imported: number; existed: number }> {
  const ytChannelId = await resolveChannelId(channelUrl, apiKey);

  // Use the provided keyword for search query
  const searchQuery = keyword || "";

  const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${ytChannelId}&q=${encodeURIComponent(searchQuery)}&type=video&order=date&maxResults=50&key=${apiKey}`;
  const res = await fetch(searchUrl);
  const data = (await res.json()) as {
    items?: {
      id?: { videoId?: string };
      snippet?: { title?: string; thumbnails?: { medium?: { url?: string } }; publishedAt?: string };
    }[];
  };

  const items = data.items ?? [];
  if (items.length === 0) return { imported: 0, existed: 0 };

  // To get duration, we need to call videos.list for the IDs found
  const videoIds = items.map((i) => i.id?.videoId).filter(Boolean) as string[];
  if (videoIds.length === 0) return { imported: 0, existed: 0 };

  const videosUrl = `https://www.googleapis.com/youtube/v3/videos?part=contentDetails,snippet&id=${videoIds.join(",")}&key=${apiKey}`;
  const vRes = await fetch(videosUrl);
  const vData = (await vRes.json()) as {
    items?: {
      id: string;
      snippet: { title: string; thumbnails?: { medium?: { url?: string } }; publishedAt?: string };
      contentDetails: { duration: string };
    }[];
  };

  const videoDetails = vData.items ?? [];
  let imported = 0;
  let existed = 0;

  for (const item of videoDetails) {
    const ytId = item.id;
    const title = item.snippet.title;
    const thumbnail = item.snippet.thumbnails?.medium?.url ?? null;
    const publishedAt = item.snippet.publishedAt ?? null;
    const durationStr = item.contentDetails.duration;
    const durationMinutes = parseDurationToMinutes(durationStr);

    // Filter: Duration must be at least 50 minutes
    if (durationMinutes < 50) {
      continue;
    }

    try {
      const { rowCount } = await pool.query(
        `INSERT INTO sport_matches (channel_id, yt_id, title, thumbnail, published_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (yt_id) DO NOTHING`,
        [channelId, ytId, title, thumbnail, publishedAt]
      );
      
      if ((rowCount ?? 0) > 0) {
        imported++;
      } else {
        existed++;
      }
    } catch {
      existed++;
    }
  }

  return { imported, existed };
}

// ─── Settings ─────────────────────────────────────────────────────────────────

// GET /api/sports/settings
router.get("/sports/settings", async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT key, value FROM sport_settings");
    const settings: Record<string, string> = {};
    for (const row of rows) settings[row.key] = row.value;
    res.json(settings);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// POST /api/sports/settings
router.post("/sports/settings", async (req, res) => {
  try {
    const { youtube_api_key } = req.body as { youtube_api_key: string };
    if (!youtube_api_key) return res.status(400).json({ error: "Falta youtube_api_key" });

    await pool.query(
      `INSERT INTO sport_settings (key, value) VALUES ('youtube_api_key', $1)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [youtube_api_key]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ─── Channels ─────────────────────────────────────────────────────────────────

// GET /api/sports/channels
router.get("/sports/channels", async (_req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT * FROM sport_channels ORDER BY date_added DESC"
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// POST /api/sports/channels
router.post("/sports/channels", async (req, res) => {
  try {
    const { name, url, keyword = "FULL MATCH" } = req.body as {
      name: string;
      url: string;
      keyword?: string;
    };
    if (!name || !url) return res.status(400).json({ error: "Faltan campos name y url" });

    const { rows } = await pool.query(
      `INSERT INTO sport_channels (name, url, keyword) VALUES ($1, $2, $3)
       ON CONFLICT (url) DO UPDATE SET name = EXCLUDED.name, keyword = EXCLUDED.keyword
       RETURNING *`,
      [name, url, keyword]
    );
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// DELETE /api/sports/channels/:id
router.delete("/sports/channels/:id", async (req, res) => {
  try {
    await pool.query("DELETE FROM sport_channels WHERE id = $1", [req.params["id"]]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// POST /api/sports/channels/:id/sync
router.post("/sports/channels/:id/sync", async (req, res) => {
  try {
    const apiKey = await getYoutubeApiKey();
    const { rows } = await pool.query("SELECT * FROM sport_channels WHERE id = $1", [
      req.params["id"],
    ]);
    if (!rows[0]) return res.status(404).json({ error: "Canal no encontrado" });

    const channel = rows[0] as { id: number; url: string; keyword: string };
    const result = await syncChannel(channel.id, channel.url, channel.keyword, apiKey);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// POST /api/sports/sync-all
router.post("/sports/sync-all", async (_req, res) => {
  try {
    const apiKey = await getYoutubeApiKey();
    const { rows: channels } = await pool.query("SELECT * FROM sport_channels");

    let totalImported = 0;
    let totalExisted = 0;
    const errors: string[] = [];

    for (const ch of channels as { id: number; name: string; url: string; keyword: string }[]) {
      try {
        const result = await syncChannel(ch.id, ch.url, ch.keyword, apiKey);
        totalImported += result.imported;
        totalExisted += result.existed;
      } catch (e) {
        errors.push(`${ch.name}: ${String(e)}`);
      }
    }

    res.json({ imported: totalImported, existed: totalExisted, errors });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ─── Matches (public) ─────────────────────────────────────────────────────────

// GET /api/sports/matches
router.get("/sports/matches", async (req, res) => {
  try {
    const { q, limit = "50", offset = "0" } = req.query as {
      q?: string;
      limit?: string;
      offset?: string;
    };

    let query = `
      SELECT m.*, c.name as channel_name
      FROM sport_matches m
      JOIN sport_channels c ON c.id = m.channel_id
    `;
    const params: (string | number)[] = [];

    if (q) {
      params.push(`%${q}%`);
      query += ` WHERE m.title ILIKE $${params.length}`;
    }

    query += ` ORDER BY m.published_at DESC NULLS LAST LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(Number(limit), Number(offset));

    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// DELETE /api/sports/matches/:id
router.delete("/sports/matches/:id", async (req, res) => {
  try {
    await pool.query("DELETE FROM sport_matches WHERE id = $1", [req.params["id"]]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

export default router;
