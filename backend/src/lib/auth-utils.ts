import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

const SALT_ROUNDS = 10;

/** Secret used for JWT signing. Falls back to ADMIN_SECRET for backward compat, then a dev default. */
function getJwtSecret(): string {
  return process.env["JWT_SECRET"] || process.env["ADMIN_SECRET"] || "dev-secret-do-not-use-in-production";
}

/**
 * Hash a plaintext password with bcrypt.
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Compare a plaintext password against a bcrypt hash.
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Check whether a stored password looks like a bcrypt hash ($2a$ or $2b$ prefix).
 */
export function isBcryptHash(str: string): boolean {
  return str.startsWith("$2b$") || str.startsWith("$2a$");
}

/**
 * Generate a JWT for an authenticated admin user.
 * Token expires in 24 hours.
 */
export function generateToken(username: string): string {
  return jwt.sign({ username, role: "admin" }, getJwtSecret(), { expiresIn: "24h" });
}

/**
 * Verify a JWT and return the decoded payload, or null if invalid/expired.
 */
export function verifyToken(token: string): { username: string; role: string } | null {
  try {
    return jwt.verify(token, getJwtSecret()) as { username: string; role: string };
  } catch {
    return null;
  }
}

/**
 * Validate an auth token. Accepts:
 * 1. A valid JWT (preferred)
 * 2. The raw ADMIN_SECRET value (backward compatibility during migration)
 * 3. In dev mode (no ADMIN_SECRET set), any non-empty token is accepted.
 */
export function isValidToken(token: string): boolean {
  // JWT verification
  if (verifyToken(token)) return true;

  // Backward compat: accept the raw ADMIN_SECRET
  const adminSecret = process.env["ADMIN_SECRET"];
  if (adminSecret && token === adminSecret) return true;

  // Dev mode: no ADMIN_SECRET configured → accept any token
  if (!adminSecret) return true;

  return false;
}

/**
 * Standard auth check for inline route protection (non-/admin/* routes).
 * Sends 401 response and returns false if auth fails.
 */
import type { Request, Response } from "express";

export function requireAuth(req: Request, res: Response): boolean {
  const authHeader = req.headers["authorization"];
  const queryToken = req.query["token"] as string | undefined;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : queryToken;

  if (!token || !isValidToken(token)) {
    res.status(401).json({ error: "No autorizado" });
    return false;
  }
  return true;
}
