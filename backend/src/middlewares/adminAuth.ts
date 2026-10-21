/**
 * Authorisation middleware.
 *
 * `adminAuth` protects every `/api/admin/*` route. Routes outside that
 * namespace that mutate data (settings, servers, sports, events, downloads)
 * call `requireAdmin` explicitly, so authorisation is always visible at the
 * point of use instead of being implied by a path prefix.
 */
import type { Request, Response, NextFunction } from "express";
import { extractToken, isValidToken } from "../lib/auth-utils";
import { logger } from "../lib/logger";

/** Returns true when the request carries a valid admin session. */
export function isAuthorized(req: Request): boolean {
  const token = extractToken(req);
  return Boolean(token && isValidToken(token));
}

/**
 * Express middleware guarding administrative routes.
 * Rejects with 401 when no valid session is present.
 */
export function adminAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.path.startsWith("/admin")) {
    next();
    return;
  }

  if (!isAuthorized(req)) {
    logger.warn({ method: req.method, url: req.path }, "Rejected unauthorized admin request");
    res.status(401).json({ error: "No autorizado", code: "unauthorized" });
    return;
  }

  next();
}

/**
 * Express middleware for administrative routes outside the `/admin`
 * namespace. Use it on every write operation.
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!isAuthorized(req)) {
    logger.warn({ method: req.method, url: req.path }, "Rejected unauthorized request");
    res.status(401).json({ error: "No autorizado", code: "unauthorized" });
    return;
  }
  next();
}
