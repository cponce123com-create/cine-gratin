import { Router, type Request, type Response } from "express";
import { exec } from "child_process";

const router = Router();

type EmbedUrlFn = (imdbId: string, season?: number, episode?: number) => string;

const MOVIE_SERVERS: EmbedUrlFn[] = [
  (id) => `https://vidsrc.xyz/embed/movie?imdb=${id}`,
  (id) => `https://vidsrc.to/embed/movie/${id}`,
  (id) => `https://www.2embed.cc/embed/${id}`,
  (id) => `https://multiembed.mov/?video_id=${id}&tmdb=1`,
];

const SERIES_SERVERS: EmbedUrlFn[] = [
  (id, s, e) => `https://vidsrc.xyz/embed/tv?imdb=${id}&season=${s}&episode=${e}`,
  (id, s, e) => `https://vidsrc.to/embed/tv/${id}/${s}/${e}`,
  (id, s, e) => `https://www.2embed.cc/embedtv/${id}&s=${s}&e=${e}`,
  (id, s, e) => `https://multiembed.mov/?video_id=${id}&tmdb=1&s=${s}&e=${e}`,
];

function getEmbedUrl(
  imdbId: string,
  type: "movie" | "series",
  serverIndex: number,
  season?: number,
  episode?: number,
): string | null {
  if (type === "movie") {
    const fn = MOVIE_SERVERS[serverIndex];
    if (!fn) return null;
    return fn(imdbId);
  }
  const fn = SERIES_SERVERS[serverIndex];
  if (!fn) return null;
  return fn(imdbId, season ?? 1, episode ?? 1);
}

function resolveVideoUrl(embedUrl: string): Promise<string | null> {
  return new Promise((resolve) => {
    const cmd = `yt-dlp -g --no-warnings ${JSON.stringify(embedUrl)} 2>/dev/null`;
    exec(cmd, { timeout: 45000, maxBuffer: 1024 * 1024 }, (err, stdout) => {
      if (err) {
        resolve(null);
        return;
      }
      const lines = stdout.trim().split("\n").filter(Boolean);
      resolve(lines[0] ?? null);
    });
  });
}

router.get("/download", async (req: Request, res: Response) => {
  const { imdbId, type, server, season, episode } = req.query;

  if (!imdbId || typeof imdbId !== "string" || imdbId.trim().length === 0) {
    res.status(400).json({ error: "Missing or invalid imdbId query param" });
    return;
  }
  if (type !== "movie" && type !== "series") {
    res.status(400).json({ error: "type must be movie or series" });
    return;
  }

  const srvIdx = Number(server) || 0;
  const ssn = season ? Number(season) || 1 : 1;
  const ep = episode ? Number(episode) || 1 : 1;

  const embedUrl = getEmbedUrl(imdbId, type, srvIdx, ssn, ep);
  if (!embedUrl) {
    res.status(400).json({
      error: `Invalid server index '${server}'. Movie: 0-3, Series: 0-3`,
    });
    return;
  }

  const directUrl = await resolveVideoUrl(embedUrl);

  if (!directUrl) {
    res.status(502).json({
      error: "No se pudo resolver la URL de descarga. " +
        "Asegurate de que yt-dlp este instalado en el servidor " +
        "y que el video este disponible en el servidor seleccionado.",
      hint: "Prueba con el boton Descargar (Externo) como alternativa.",
    });
    return;
  }

  res.redirect(302, directUrl);
});

export default router;
