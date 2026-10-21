import { Router, type Request, type Response } from "express";
import { execFile } from "node:child_process";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { parseQuery } from "../lib/http";
import { badRequest } from "../lib/errors";
import { logger } from "../lib/logger";

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

const downloadQuerySchema = z.object({
  imdbId: z.string().regex(/^tt\d{7,10}$/, "Identificador de IMDb inválido"),
  type: z.enum(["movie", "series"]),
  server: z.coerce.number().int().min(0).max(3).optional().default(0),
  season: z.coerce.number().int().min(1).max(100).optional().default(1),
  episode: z.coerce.number().int().min(1).max(1000).optional().default(1),
});

/** Maximum number of yt-dlp processes running at the same time. */
const MAX_CONCURRENT_RESOLVERS = 2;
let activeResolvers = 0;

const downloadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiadas descargas, inténtalo más tarde." },
});

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

/**
 * Resolves the direct media URL with yt-dlp.
 *
 * The command is executed through `execFile` with a fixed argument vector:
 * the URL is never interpreted by a shell, so a crafted identifier cannot
 * become a command.
 */
function resolveVideoUrl(embedUrl: string): Promise<string | null> {
  return new Promise((resolve) => {
    if (activeResolvers >= MAX_CONCURRENT_RESOLVERS) {
      resolve(null);
      return;
    }
    activeResolvers += 1;

    execFile(
      "yt-dlp",
      ["-g", "--no-warnings", "--no-playlist", embedUrl],
      { timeout: 45_000, maxBuffer: 1024 * 1024, windowsHide: true },
      (err, stdout) => {
        activeResolvers -= 1;
        if (err) {
          logger.warn({ err: err.message, embedUrl }, "yt-dlp could not resolve the URL");
          resolve(null);
          return;
        }
        const lines = stdout
          .trim()
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean);
        resolve(lines[0] ?? null);
      },
    );
  });
}

router.get("/download", downloadLimiter, async (req: Request, res: Response) => {
  const { imdbId, type, server, season, episode } = parseQuery(downloadQuerySchema, req.query);

  const embedUrl = getEmbedUrl(imdbId, type, server, season, episode);
  if (!embedUrl) {
    throw badRequest("Servidor de embed no válido");
  }

  const directUrl = await resolveVideoUrl(embedUrl);

  if (!directUrl) {
    res.status(502).json({
      error:
        "No se pudo resolver la URL de descarga. Asegúrate de que yt-dlp esté instalado en el servidor y que el vídeo esté disponible en el servidor seleccionado.",
      hint: "Prueba con el botón Descargar (Externo) como alternativa.",
    });
    return;
  }

  res.setHeader("Cache-Control", "no-store");
  res.redirect(302, directUrl);
});

export default router;
