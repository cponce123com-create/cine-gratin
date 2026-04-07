import type { Request, Response, NextFunction } from "express";

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

  const authHeader = req.headers["authorization"];
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "No autorizado" });
    return;
  }

  const token = authHeader.slice(7);
  if (token !== secret) {
    res.status(401).json({ error: "No autorizado" });
    return;
  }

  next();
}
