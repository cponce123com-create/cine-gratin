/**
 * Authentication helpers.
 *
 * Security model
 * --------------
 * - Sessions are JWTs signed with `JWT_SECRET` using HS256. The expected
 *   algorithm is pinned, so a token signed with another algorithm (or with
 *   `alg: none`) is rejected.
 * - The token is transported either by an `HttpOnly` cookie (`cg_session`) or,
 *   for CLI/API usage, by an `Authorization: Bearer` header.
 * - Tokens are NEVER accepted from the query string: URLs end up in browser
 *   history, proxy logs and `Referer` headers.
 * - Admin routes are closed by default. A request is authorised only with a
 *   valid JWT or with the configured `ADMIN_SECRET`.
 * - `ALLOW_INSECURE_DEV_AUTH=true` re-enables the "any non-empty token" mode
 *   for local development, but it is refused in production.
 * - Each session carries a random `csrf` claim. Mutating requests made with
 *   the session cookie must echo it in the `X-CSRF-Token` header (see
 *   `lib/csrf.ts`), which prevents cross-site request forgery.
 */
import { randomBytes, timingSafeEqual } from "node:crypto";
import type { Request } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { getConfig } from "./config";

const SALT_ROUNDS = 10;
export const SESSION_COOKIE = "cg_session";
export const CSRF_HEADER = "x-csrf-token";
/** The only signing algorithm accepted. */
const ALLOWED_ALGORITHMS = ["HS256"] as const;

export interface SessionClaims {
  username: string;
  role: "admin";
  /** Random value bound to this session, required on mutating requests. */
  csrf: string;
  /** Identifier of the session, used to revoke it on logout. */
  jti: string;
  /** Expiry (seconds since the epoch). */
  exp: number;
  /** Issued at (seconds since the epoch). */
  iat?: number;
}

/** Hashes a plaintext password with bcrypt. */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

/** Compares a plaintext password with a bcrypt hash. */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/** Checks whether a stored password already looks like a bcrypt hash. */
export function isBcryptHash(str: string): boolean {
  return str.startsWith("$2b$") || str.startsWith("$2a$") || str.startsWith("$2y$");
}

/** Generates a random token for the CSRF protection (32 bytes, hex). */
export function generateCsrfToken(): string {
  return randomBytes(32).toString("hex");
}

/** Generates a signed session token for the given admin username. */
export function generateToken(username: string, csrfToken = generateCsrfToken()): string {
  const config = getConfig();
  return jwt.sign(
    {
      username,
      role: "admin",
      csrf: csrfToken,
      jti: randomBytes(16).toString("hex"),
    } satisfies Omit<SessionClaims, "iat" | "exp">,
    config.jwtSecret,
    { expiresIn: config.sessionTtlSeconds, algorithm: "HS256" },
  );
}

/**
 * Verifies a session token.
 * The algorithm is pinned, the expiry is mandatory and the administrative
 * role is required: a token without those claims is not a session.
 */
export function verifyToken(token: string): SessionClaims | null {
  try {
    const payload = jwt.verify(token, getConfig().jwtSecret, {
      algorithms: [...ALLOWED_ALGORITHMS],
    });
    if (typeof payload !== "object" || payload === null) return null;
    const claims = payload as Partial<SessionClaims>;
    if (typeof claims.username !== "string" || claims.username.length === 0) return null;
    if (claims.role !== "admin") return null;
    if (typeof claims.exp !== "number") return null;
    if (typeof claims.csrf !== "string" || claims.csrf.length < 16) return null;
    if (typeof claims.jti !== "string" || claims.jti.length < 16) return null;
    return claims as SessionClaims;
  } catch {
    return null;
  }
}

/** Constant-time string comparison that does not leak length through timing. */
export function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    // Still perform a comparison to keep the timing profile flat.
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

/**
 * Extracts the session token from the request.
 * Only two transports are supported: the session cookie and the Authorization
 * header. Query parameters are explicitly ignored.
 */
export function extractToken(req: Request): string | undefined {
  const header = req.headers.authorization;
  if (header && header.startsWith("Bearer ")) {
    const value = header.slice("Bearer ".length).trim();
    if (value) return value;
  }

  const cookies = (req as Request & { cookies?: Record<string, string> }).cookies;
  const cookieValue = cookies?.[SESSION_COOKIE];
  if (typeof cookieValue === "string" && cookieValue.trim()) {
    return cookieValue.trim();
  }

  return undefined;
}

/** True when the request authenticates with a bearer token instead of a cookie. */
export function usesBearerToken(req: Request): boolean {
  const header = req.headers.authorization;
  return Boolean(header && header.startsWith("Bearer ") && header.slice(7).trim());
}

/**
 * Validates a token.
 * Accepts a valid JWT or the raw `ADMIN_SECRET` (kept for API automation).
 * In development only, and only when explicitly enabled, any non-empty token
 * is accepted.
 */
export function isValidToken(token: string): boolean {
  if (!token) return false;

  if (verifyToken(token)) return true;

  const config = getConfig();
  if (config.adminSecret && safeCompare(token, config.adminSecret)) return true;

  if (config.allowInsecureDevAuth && !config.isProduction) return true;

  return false;
}

/** Cookie options used for the session cookie. */
export function sessionCookieOptions() {
  const config = getConfig();
  return {
    httpOnly: true,
    sameSite: config.cookieSameSite,
    secure: config.cookieSecure,
    path: "/",
    maxAge: config.sessionTtlSeconds * 1000,
  } as const;
}
