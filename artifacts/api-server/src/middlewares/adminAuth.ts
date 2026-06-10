import type { Request, Response, NextFunction } from "express";
import { isValidToken } from "../lib/auth-utils";

/**
 * Extracts the bearer token from Authorization header or ?token= query param.
 */
function extractToken(req: Request): string | undefined {
  const authHeader = req.headers["authorization"];
  const queryToken = req.query["token"] as string | undefined;
  return authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : queryToken;
}

/**
 * Shared auth check — validates ADMIN_SECRET token.
 * Returns true if authorized, false if response was sent (401).
 * Safe to use in non-/admin routes (events, sports).
 */
export function requireAuth(req: Request, res: Response): boolean {
  const secret = process.env["ADMIN_SECRET"];
  if (!secret) return true; // Dev mode: skip auth
  const token = extractToken(req);
  if (!token || token !== secret) {
    res.status(401).json({ error: "No autorizado" });
    return false;
  }
  return true;
}

/**
 * Middleware that protects all /admin/* routes.
 * Expects: Authorization: Bearer <token>
 * Accepts valid JWTs and (for backward compat) the raw ADMIN_SECRET.
 * If ADMIN_SECRET is not set, auth is skipped (development mode).
 */
export function adminAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.path.startsWith("/admin")) {
    next();
    return;
  }

  const authHeader = req.headers["authorization"];
  const queryToken = req.query["token"] as string | undefined;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : queryToken;

  if (!token || !isValidToken(token)) {
    res.status(401).json({ error: "No autorizado" });
    return;
  }

  next();
}
