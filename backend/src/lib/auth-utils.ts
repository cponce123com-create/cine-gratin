/**
 * Authentication helpers.
 *
 * Security model
 * --------------
 * - Sessions are JWTs signed with `JWT_SECRET`.
 * - The token is transported either by an `HttpOnly` cookie (`cg_session`) or,
 *   for CLI/API usage, by an `Authorization: Bearer` header.
 * - Tokens are NEVER accepted from the query string: URLs end up in browser
 *   history, proxy logs and `Referer` headers.
 * - Admin routes are closed by default. A request is authorised only with a
 *   valid JWT or with the configured `ADMIN_SECRET`.
 * - `ALLOW_INSECURE_DEV_AUTH=true` re-enables the "any non-empty token" mode
 *   for local development, but it is refused in production.
 */
import { timingSafeEqual } from "node:crypto";
import type { Request } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { getConfig } from "./config";

const SALT_ROUNDS = 10;
export const SESSION_COOKIE = "cg_session";

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

/** Generates a signed session token for the given admin username. */
export function generateToken(username: string): string {
  const config = getConfig();
  return jwt.sign({ username, role: "admin" }, config.jwtSecret, {
    expiresIn: config.sessionTtlSeconds,
  });
}

/** Verifies a session token, returning its payload or null. */
export function verifyToken(token: string): { username: string; role: string } | null {
  try {
    return jwt.verify(token, getConfig().jwtSecret) as { username: string; role: string };
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
