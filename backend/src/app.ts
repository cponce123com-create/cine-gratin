import path from "path";
import express, { type Express } from "express";
import cors from "cors";
import compression from "compression";
import helmet from "helmet";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.set("trust proxy", 1);

// ── Security headers via Helmet ───────────────────────────────────────────────
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "https://www.youtube.com", "https://s.ytimg.com"],
        frameSrc: [
          "'self'",
          "https://www.youtube.com",
          "https://vidsrc.me",
          "https://vidsrc.xyz",
          "https://vidsrc.to",
          "https://vidsrc.mov",
          "https://2embed.org",
          "https://www.2embed.cc",
          "https://vidembed.io",
          "https://multiembed.mov",
        ],
        imgSrc: ["'self'", "data:", "https://image.tmdb.org", "https://i.ytimg.com", "https://*.ytimg.com"],
        connectSrc: ["'self'", "https://www.googleapis.com", "https://vidsrc.me", "https://image.tmdb.org"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        fontSrc: ["'self'"],
        mediaSrc: ["'self'", "https:", "data:", "blob:"],
      },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
  }),
);

// ── CORS: validate origins in production ──────────────────────────────────────
const corsOrigins = process.env["CORS_ORIGINS"];
if (corsOrigins) {
  const origins = corsOrigins.split(",").map((o) => o.trim());
  // Refuse wildcard in production
  if (origins.includes("*") && process.env["NODE_ENV"] === "production") {
    throw new Error("CORS_ORIGINS wildcard (*) is not allowed in production. Specify explicit origins.");
  }
}

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
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

// CORS: allow known origins in production, all origins in dev
const allowedOrigins = process.env["CORS_ORIGINS"]
  ? process.env["CORS_ORIGINS"].split(",")
  : ["http://localhost:5173", "http://localhost:4173"];
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (non-browser, curl, etc.)
      if (!origin || allowedOrigins.includes("*")) return callback(null, true);
      if (allowedOrigins.some((o) => origin.startsWith(o))) return callback(null, true);
      callback(null, false);
    },
    credentials: true,
  }),
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API routes
app.use("/api", router);

// Serve React frontend static files
const publicDir = path.resolve(__dirname, "../public");
app.use(express.static(publicDir));

// SPA catch-all
app.get("/*path", (_req, res) => {
  const indexFile = path.join(publicDir, "index.html");
  res.sendFile(indexFile, (err) => {
    if (err) {
      res.status(404).json({ error: "Not found" });
    }
  });
});

export default app;
