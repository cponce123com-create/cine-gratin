import type { Request, Response, NextFunction } from "express";

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
 * Expects: Authorization: Bearer <ADMIN_SECRET>
 * If ADMIN_SECRET is not set, auth is skipped (development mode).
 */
export function adminAuth(req: Request, res: Response, next: NextFunction): void {
  const secret = process.env["ADMIN_SECRET"];

  // Dev mode: no secret configured → skip auth
  if (!secret) {
    next();
    return;
  }

  // Only protect /admin/* paths
  if (!req.path.startsWith("/admin")) {
    next();
    return;
  }

  const token = extractToken(req);

  if (!token) {
    res.status(401).json({ error: "No autorizado" });
    return;
  }

  if (token !== secret) {
    res.status(401).json({ error: "No autorizado" });
    return;
  }

  next();
}
