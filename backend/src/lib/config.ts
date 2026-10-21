/**
 * Centralised runtime configuration.
 *
 * Every environment variable used by the API is read exactly once, here, so
 * that misconfiguration is detected at boot instead of at the first request
 * that happens to need the missing value.
 *
 * Rules enforced by this module:
 *  - `DATABASE_URL` and `PORT` are always required.
 *  - In production a strong `JWT_SECRET` is mandatory and known insecure
 *    defaults are rejected.
 *  - In development a missing `JWT_SECRET` produces a random ephemeral secret
 *    (never a shared/predictable one) so tokens are not forgeable.
 *  - Admin routes are closed by default: a request is only authorised with a
 *    valid JWT or with the configured `ADMIN_SECRET`. Accepting an arbitrary
 *    token requires the explicit opt-in `ALLOW_INSECURE_DEV_AUTH=true` and is
 *    only honoured outside production.
 */

import { randomBytes } from "node:crypto";

export type NodeEnv = "development" | "test" | "production";

export interface AppConfig {
  nodeEnv: NodeEnv;
  isProduction: boolean;
  port: number;
  databaseUrl: string;
  jwtSecret: string;
  adminSecret: string | null;
  /** Allows any non-empty bearer token to pass admin auth. Never in production. */
  allowInsecureDevAuth: boolean;
  corsOrigins: string[];
  tmdbApiKey: string | null;
  youtubeApiKey: string | null;
  /** SameSite policy for the session cookie. */
  cookieSameSite: "lax" | "strict" | "none";
  cookieSecure: boolean;
  sessionTtlSeconds: number;
  /** Max number of items a single import job may process. */
  importBatchLimit: number;
  /** Max number of items accepted by a single bulk request. */
  bulkLimit: number;
}

const INSECURE_JWT_SECRETS = new Set([
  "dev-jwt-secret-do-not-use-in-production",
  "dev-secret-do-not-use-in-production",
  "change-me-to-a-random-secret",
  "secret",
]);

const MIN_JWT_SECRET_LENGTH = 32;

function readNodeEnv(): NodeEnv {
  const raw = (process.env["NODE_ENV"] ?? "development").toLowerCase();
  if (raw === "production" || raw === "test") return raw;
  return "development";
}

function parsePort(raw: string | undefined): number {
  if (!raw) throw new Error("Missing required environment variable: PORT");
  const port = Number(raw);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid PORT value: "${raw}"`);
  }
  return port;
}

/** Normalises the CORS allow-list. `CORS_ORIGIN` and `CORS_ORIGINS` are both accepted. */
export function resolveCorsOrigins(nodeEnv: NodeEnv): string[] {
  const raw = [process.env["CORS_ORIGINS"], process.env["CORS_ORIGIN"]]
    .filter((value): value is string => Boolean(value))
    .join(",");

  const origins = raw
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (origins.includes("*")) {
    if (nodeEnv === "production") {
      throw new Error(
        "CORS wildcard (*) is not allowed in production. Set CORS_ORIGINS to an explicit origin list.",
      );
    }
    return ["*"];
  }

  if (origins.length > 0) return origins;

  // Default allow-list for local development only.
  return nodeEnv === "production" ? [] : ["http://localhost:5173", "http://localhost:4173"];
}

function resolveCookieSameSite(isProduction: boolean): AppConfig["cookieSameSite"] {
  const raw = (process.env["COOKIE_SAME_SITE"] ?? "").toLowerCase();
  if (raw === "none" || raw === "lax" || raw === "strict") return raw;
  return isProduction ? "none" : "lax";
}

function resolveCookieSecure(isProduction: boolean): boolean {
  const raw = process.env["COOKIE_SECURE"];
  if (raw !== undefined) return raw === "true" || raw === "1";
  return isProduction;
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.floor(value);
}

/**
 * Builds the configuration, validating the environment.
 * Throws (and therefore refuses to boot) when a mandatory value is missing
 * or insecure in production.
 */
export function loadConfig(): AppConfig {
  const nodeEnv = readNodeEnv();
  const isProduction = nodeEnv === "production";

  const databaseUrl = process.env["DATABASE_URL"];
  if (!databaseUrl) {
    throw new Error("Missing required environment variable: DATABASE_URL");
  }

  const port = parsePort(process.env["PORT"]);

  let jwtSecret = process.env["JWT_SECRET"];
  if (!jwtSecret) {
    if (isProduction) {
      throw new Error(
        "Missing required environment variable: JWT_SECRET (required in production, min 32 chars)",
      );
    }
    // Development: random per-process secret. Tokens do not survive a restart,
    // which is the correct trade-off versus shipping a predictable key.
    jwtSecret = randomBytes(32).toString("hex");
  }
  if (isProduction) {
    if (jwtSecret.length < MIN_JWT_SECRET_LENGTH) {
      throw new Error(`JWT_SECRET must be at least ${MIN_JWT_SECRET_LENGTH} characters long in production`);
    }
    if (INSECURE_JWT_SECRETS.has(jwtSecret)) {
      throw new Error("JWT_SECRET uses a known insecure default. Generate a random secret.");
    }
  }

  const adminSecret = process.env["ADMIN_SECRET"] || null;
  if (isProduction && adminSecret && adminSecret.length < 16) {
    throw new Error("ADMIN_SECRET must be at least 16 characters long in production");
  }

  const allowInsecureDevAuth =
    !isProduction && (process.env["ALLOW_INSECURE_DEV_AUTH"] ?? "").toLowerCase() === "true";

  return {
    nodeEnv,
    isProduction,
    port,
    databaseUrl,
    jwtSecret,
    adminSecret,
    allowInsecureDevAuth,
    corsOrigins: resolveCorsOrigins(nodeEnv),
    tmdbApiKey: process.env["TMDB_API_KEY"] || null,
    youtubeApiKey: process.env["YOUTUBE_API_KEY"] || null,
    cookieSameSite: resolveCookieSameSite(isProduction),
    cookieSecure: resolveCookieSecure(isProduction),
    sessionTtlSeconds: parsePositiveInt(process.env["SESSION_TTL_SECONDS"], 8 * 60 * 60),
    importBatchLimit: parsePositiveInt(process.env["IMPORT_BATCH_LIMIT"], 500),
    bulkLimit: parsePositiveInt(process.env["BULK_LIMIT"], 200),
  };
}

let cached: AppConfig | null = null;

/** Returns the process-wide configuration, loading it on first use. */
export function getConfig(): AppConfig {
  if (!cached) cached = loadConfig();
  return cached;
}

/** Test helper: replaces the cached configuration. */
export function setConfig(config: AppConfig | null): void {
  cached = config;
}
