import { Router, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import { adminAuth } from "../middlewares/adminAuth";
import { logger } from "../lib/logger";
import { notFound, sendError } from "../lib/errors";
import healthRouter from "./health";
import tmdbRouter from "./tmdb";
import moviesRouter from "./movies";
import seriesRouter from "./series";
import adminRouter from "./admin";
import sportsRouter from "./sports";
import eventsRouter from "./events";
import sagasRouter from "./sagas";
import downloadRouter from "./download";

const router: Router = Router();

// ── Public: client-side error reporting ─────────────────────────────────────
// The endpoint is public by design, so it is hardened: it is rate limited,
// the payload is validated and truncated, and the content is sanitised before
// it reaches the logs (a hostile client must not be able to forge log lines).
const errorReportLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiados reportes de error, inténtalo más tarde." },
});

const MAX_ERROR_FIELD_LENGTH = 2000;
/** Control characters (including newlines) are stripped so log lines stay intact. */
// Se eliminan los caracteres de control para que un cliente no pueda
// falsificar lineas del registro.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g;

function sanitizeLogValue(value: unknown, maxLength = MAX_ERROR_FIELD_LENGTH): string {
  if (typeof value !== "string") return "";
  return value.replace(CONTROL_CHARS, " ").slice(0, maxLength);
}

router.post("/log-error", errorReportLimiter, (req: Request, res: Response) => {
  const body = (req.body ?? {}) as Record<string, unknown>;

  const message = sanitizeLogValue(body["message"], 500);
  const stack = sanitizeLogValue(body["stack"]);
  const componentStack = sanitizeLogValue(body["componentStack"]);
  const url = sanitizeLogValue(body["url"], 300);
  const userAgent = sanitizeLogValue(body["userAgent"], 300);

  if (message) {
    logger.warn({ message, stack, componentStack, url, userAgent }, "[Client Error]");
  }

  res.status(202).json({ ok: true });
});

router.use(adminAuth);
router.use(healthRouter);
router.use(tmdbRouter);
router.use(moviesRouter);
router.use(seriesRouter);
router.use(adminRouter);
router.use(sportsRouter);
router.use(eventsRouter);
router.use(sagasRouter);
router.use(downloadRouter);

// Unknown API route → JSON 404 instead of the SPA fallback.
router.use((req: Request, res: Response) => {
  sendError(res, notFound(`Ruta no encontrada: ${req.method}`));
});

export default router;
