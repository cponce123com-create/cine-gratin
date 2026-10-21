import path from "node:path";
import { randomUUID } from "node:crypto";
import express, { type Express, type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import compression from "compression";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { getConfig } from "./lib/config";
import { sendError } from "./lib/errors";

const app: Express = express();

const config = getConfig();

app.set("trust proxy", 1);
app.disable("x-powered-by");

// ── Security headers via Helmet ───────────────────────────────────────────────
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "https://www.youtube.com", "https://s.ytimg.com"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
        imgSrc: [
          "'self'",
          "data:",
          "blob:",
          "https://image.tmdb.org",
          "https://i.ytimg.com",
          "https://*.ytimg.com",
          "https://*.tmdb.org",
        ],
        connectSrc: [
          "'self'",
          "https://www.googleapis.com",
          "https://image.tmdb.org",
          "https://api.themoviedb.org",
          "https://i.ytimg.com",
          "https://vidsrc.me",
          "https://vidsrc.xyz",
          "https://vidsrc.to",
          "https://raw.githubusercontent.com",
        ],
        frameSrc: [
          "'self'",
          "https://www.youtube.com",
          "https://youtube-nocookie.com",
          "https://vidsrc.me",
          "https://vidsrc.xyz",
          "https://vidsrc.to",
          "https://vidsrc.mov",
          "https://2embed.org",
          "https://www.2embed.cc",
          "https://vidembed.io",
          "https://multiembed.mov",
        ],
        mediaSrc: ["'self'", "https:", "data:", "blob:"],
        workerSrc: ["'self'", "blob:"],
        manifestSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'self'"],
        formAction: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  }),
);

// ── Request id ────────────────────────────────────────────────────────────────
// Every request gets an id that is echoed to the client and included in the
// logs, so an error reported by a user can be traced precisely.
app.use((req: Request, res: Response, next: NextFunction) => {
  const incoming = req.headers["x-request-id"];
  const requestId = typeof incoming === "string" && incoming.length <= 64 ? incoming : randomUUID();
  res.setHeader("X-Request-Id", requestId);
  (req as Request & { requestId?: string }).requestId = requestId;
  next();
});

app.use(
  pinoHttp({
    logger,
    customProps: (req) => ({ requestId: (req as Request & { requestId?: string }).requestId }),
    serializers: {
      req(req) {
        // The query string is dropped: it may contain user data and is not
        // needed for debugging.
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);

app.use(
  compression({
    filter: (req, res) => {
      // Don't compress SSE (Server-Sent Events) — flushHeaders doesn't work with compression
      if (req.url?.includes("/vidsrc-scan-stream") || req.url?.includes("/scan-networks-stream")) {
        return false;
      }
      return compression.filter(req, res);
    },
  }),
);

// ── CORS ──────────────────────────────────────────────────────────────────────
const allowedOriginSet = new Set(config.corsOrigins);
app.use(
  cors({
    origin: (origin, callback) => {
      // Requests without an Origin header (curl, health checks) are allowed.
      if (!origin) return callback(null, true);
      if (allowedOriginSet.has("*")) return callback(null, true);
      if (allowedOriginSet.has(origin)) return callback(null, true);
      callback(null, false);
    },
    credentials: true,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Request-Id"],
    exposedHeaders: ["X-Request-Id"],
    maxAge: 600,
  }),
);

// ── Parsers ───────────────────────────────────────────────────────────────────
app.use(cookieParser());
app.use(express.json({ limit: "256kb" }));
app.use(express.urlencoded({ extended: true, limit: "256kb" }));

// ── Rate limiting ─────────────────────────────────────────────────────────────
const globalApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env["RATE_LIMIT_MAX"] ?? 600),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiadas peticiones, intenta de nuevo en un rato." },
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env["LOGIN_RATE_LIMIT_MAX"] ?? 10),
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: "Demasiados intentos de acceso. Inténtalo de nuevo en 15 minutos." },
});

// ── API routes ────────────────────────────────────────────────────────────────
app.use("/api", globalApiLimiter);
app.use("/api/auth/login", loginLimiter);
app.use("/api", router);

// ── Static frontend ───────────────────────────────────────────────────────────
const publicDir = path.resolve(__dirname, "../public");
app.use(
  express.static(publicDir, {
    maxAge: "1y",
    index: false,
    setHeaders(res, filePath) {
      // Hashed assets can be cached for a year; the shell must not be.
      if (filePath.endsWith("index.html")) {
        res.setHeader("Cache-Control", "no-cache");
      }
    },
  }),
);

// SPA catch-all
app.get("/*path", (_req, res) => {
  const indexFile = path.join(publicDir, "index.html");
  res.setHeader("Cache-Control", "no-cache");
  res.sendFile(indexFile, (err) => {
    if (err) {
      res.status(404).json({ error: "No encontrado" });
    }
  });
});

// ── Error handler ─────────────────────────────────────────────────────────────
app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  const requestId = (req as Request & { requestId?: string }).requestId;
  sendError(res, err, requestId);
});

export default app;
