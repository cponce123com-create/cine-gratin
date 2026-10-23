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
 *  - Every numeric limit is validated: out-of-range or non-finite values are
 *    rejected instead of being silently coerced.
 */
import { randomBytes } from "node:crypto";

export type NodeEnv = "development" | "test" | "production";
export type CookieSameSite = "lax" | "strict" | "none";

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
  cookieSameSite: CookieSameSite;
  cookieSecure: boolean;
  sessionTtlSeconds: number;
  /** Max number of items a single import job may process. */
  importBatchLimit: number;
  /** Max number of items accepted by a single bulk request. */
  bulkLimit: number;
  /** Number of parallel upstream requests during an import. */
  importConcurrency: number;
  /** Max number of consecutive retries for a transient upstream failure. */
  importMaxRetries: number;
  /** Lease duration of a running import job, in seconds. */
  importJobLeaseSeconds: number;
  dbPoolMax: number;
  dbPoolMin: number;
  /** Global API rate limit (requests per window). */
  rateLimitMax: number;
  /** Login rate limit (attempts per window). */
  loginRateLimitMax: number;
  /** Error reporting rate limit (reports per window). */
  errorReportLimitMax: number;
  /** Download resolution rate limit (requests per window). */
  downloadLimitMax: number;
  /**
   * Global TMDB budget (requests per UTC day) shared by every endpoint and
   * background job. TMDB serves the whole app from one key, so per-IP limits
   * alone cannot stop a burst (or a runaway loop) from exhausting the shared
   * quota for everyone. 0 disables the budget.
   */
  tmdbDailyBudget: number;
  logLevel: string;
}

const INSECURE_JWT_SECRETS = new Set([
  "dev-jwt-secret-do-not-use-in-production",
  "dev-secret-do-not-use-in-production",
  "change-me-to-a-random-secret",
  "secret",
]);

const MIN_JWT_SECRET_LENGTH = 32;
const MIN_ADMIN_SECRET_LENGTH = 16;

/** Throws a configuration error that names the offending variable. */
export class ConfigError extends Error {
  constructor(variable: string, detail: string) {
    super(`Configuración inválida: ${variable} — ${detail}`);
    this.name = "ConfigError";
  }
}

function readNodeEnv(): NodeEnv {
  const raw = (process.env["NODE_ENV"] ?? "development").toLowerCase();
  if (raw === "production" || raw === "test") return raw;
  if (raw === "development") return "development";
  throw new ConfigError("NODE_ENV", `valor no permitido "${raw}"`);
}

function parsePort(raw: string | undefined): number {
  if (!raw) throw new ConfigError("PORT", "es obligatoria");
  const port = Number(raw);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new ConfigError("PORT", `debe ser un entero entre 1 y 65535 (recibido "${raw}")`);
  }
  return port;
}

/**
 * Parses a bounded integer. Out-of-range values are rejected: a typo in the
 * environment must not silently change the behaviour of the service.
 */
function parseBoundedInt(
  variable: string,
  raw: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    throw new ConfigError(variable, `debe ser un número entero (recibido "${raw}")`);
  }
  if (value < min || value > max) {
    throw new ConfigError(variable, `debe estar entre ${min} y ${max} (recibido ${value})`);
  }
  return value;
}

function parseBoolean(variable: string, raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined || raw === "") return fallback;
  const value = raw.toLowerCase();
  if (value === "true" || value === "1" || value === "yes") return true;
  if (value === "false" || value === "0" || value === "no") return false;
  throw new ConfigError(variable, `debe ser "true" o "false" (recibido "${raw}")`);
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
      throw new ConfigError(
        "CORS_ORIGINS",
        "el comodín (*) no está permitido en producción: indica los orígenes explícitos",
      );
    }
    return ["*"];
  }

  if (origins.length > 0) return origins;

  // Default allow-list for local development only.
  return nodeEnv === "production" ? [] : ["http://localhost:5173", "http://localhost:4173"];
}

function resolveCookieSameSite(isProduction: boolean): CookieSameSite {
  const raw = (process.env["COOKIE_SAME_SITE"] ?? "").toLowerCase();
  if (raw === "") return isProduction ? "none" : "lax";
  if (raw === "none" || raw === "lax" || raw === "strict") return raw;
  throw new ConfigError("COOKIE_SAME_SITE", `debe ser "lax", "strict" o "none" (recibido "${raw}")`);
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
    throw new ConfigError("DATABASE_URL", "es obligatoria");
  }
  if (!/^postgres(ql)?:\/\//i.test(databaseUrl)) {
    throw new ConfigError("DATABASE_URL", "debe ser una URL de PostgreSQL");
  }

  const port = parsePort(process.env["PORT"]);

  let jwtSecret = process.env["JWT_SECRET"];
  if (!jwtSecret) {
    if (isProduction) {
      throw new ConfigError("JWT_SECRET", "es obligatoria en producción (mínimo 32 caracteres)");
    }
    // Development: random per-process secret. Tokens do not survive a restart,
    // which is the correct trade-off versus shipping a predictable key.
    jwtSecret = randomBytes(32).toString("hex");
  }
  if (isProduction) {
    if (jwtSecret.length < MIN_JWT_SECRET_LENGTH) {
      throw new ConfigError(
        "JWT_SECRET",
        `debe tener al menos ${MIN_JWT_SECRET_LENGTH} caracteres en producción`,
      );
    }
    if (INSECURE_JWT_SECRETS.has(jwtSecret)) {
      throw new ConfigError("JWT_SECRET", "usa un valor por defecto conocido: genera uno aleatorio");
    }
  } else if (jwtSecret.length < 16) {
    throw new ConfigError("JWT_SECRET", "debe tener al menos 16 caracteres");
  }

  const adminSecret = process.env["ADMIN_SECRET"] || null;
  if (adminSecret && adminSecret.length < MIN_ADMIN_SECRET_LENGTH) {
    throw new ConfigError("ADMIN_SECRET", `debe tener al menos ${MIN_ADMIN_SECRET_LENGTH} caracteres`);
  }

  const allowInsecureDevAuth =
    !isProduction && (process.env["ALLOW_INSECURE_DEV_AUTH"] ?? "").toLowerCase() === "true";

  const cookieSameSite = resolveCookieSameSite(isProduction);
  const cookieSecure = parseBoolean("COOKIE_SECURE", process.env["COOKIE_SECURE"], isProduction);

  if (cookieSameSite === "none" && !cookieSecure) {
    throw new ConfigError(
      "COOKIE_SECURE",
      'debe ser "true" cuando COOKIE_SAME_SITE=none (los navegadores exigen HTTPS)',
    );
  }

  const config: AppConfig = {
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
    cookieSameSite,
    cookieSecure,
    sessionTtlSeconds: parseBoundedInt(
      "SESSION_TTL_SECONDS",
      process.env["SESSION_TTL_SECONDS"],
      8 * 60 * 60,
      60,
      30 * 24 * 60 * 60,
    ),
    importBatchLimit: parseBoundedInt("IMPORT_BATCH_LIMIT", process.env["IMPORT_BATCH_LIMIT"], 500, 1, 5000),
    bulkLimit: parseBoundedInt("BULK_LIMIT", process.env["BULK_LIMIT"], 200, 1, 2000),
    importConcurrency: parseBoundedInt("IMPORT_CONCURRENCY", process.env["IMPORT_CONCURRENCY"], 3, 1, 16),
    importMaxRetries: parseBoundedInt("IMPORT_MAX_RETRIES", process.env["IMPORT_MAX_RETRIES"], 3, 0, 10),
    importJobLeaseSeconds: parseBoundedInt(
      "IMPORT_JOB_LEASE_SECONDS",
      process.env["IMPORT_JOB_LEASE_SECONDS"],
      300,
      30,
      3600,
    ),
    dbPoolMax: parseBoundedInt("DB_POOL_MAX", process.env["DB_POOL_MAX"], 10, 1, 50),
    dbPoolMin: parseBoundedInt("DB_POOL_MIN", process.env["DB_POOL_MIN"], 0, 0, 20),
    rateLimitMax: parseBoundedInt("RATE_LIMIT_MAX", process.env["RATE_LIMIT_MAX"], 600, 10, 100_000),
    loginRateLimitMax: parseBoundedInt(
      "LOGIN_RATE_LIMIT_MAX",
      process.env["LOGIN_RATE_LIMIT_MAX"],
      10,
      1,
      1000,
    ),
    errorReportLimitMax: parseBoundedInt(
      "ERROR_REPORT_LIMIT_MAX",
      process.env["ERROR_REPORT_LIMIT_MAX"],
      20,
      1,
      1000,
    ),
    downloadLimitMax: parseBoundedInt("DOWNLOAD_LIMIT_MAX", process.env["DOWNLOAD_LIMIT_MAX"], 20, 1, 1000),
    tmdbDailyBudget: parseBoundedInt(
      "TMDB_DAILY_BUDGET",
      process.env["TMDB_DAILY_BUDGET"],
      10_000,
      0,
      1_000_000,
    ),
    logLevel: process.env["LOG_LEVEL"] ?? "info",
  };

  if (config.dbPoolMin > config.dbPoolMax) {
    throw new ConfigError("DB_POOL_MIN", `no puede ser mayor que DB_POOL_MAX (${config.dbPoolMax})`);
  }

  return config;
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
