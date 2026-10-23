/**
 * Authorisation middleware.
 *
 * `adminAuth` protects every `/api/admin/*` route. Routes outside that
 * namespace that mutate data (settings, servers, sports, events, downloads)
 * call `requireAdmin` explicitly, so authorisation is always visible at the
 * point of use instead of being implied by a path prefix.
 */
import type { Request, Response, NextFunction } from "express";
import { extractToken, isValidToken, verifyToken, type SessionClaims } from "../lib/auth-utils";
import { logger } from "../lib/logger";
import { isSessionRevoked } from "../lib/session-store";

/**
 * Returns the verified claims of the request session, or null when the
 * request is not authenticated.
 */
export async function currentClaims(req: Request): Promise<SessionClaims | null> {
  const token = extractToken(req);
  if (!token) return null;
  const claims = verifyToken(token);
  if (!claims) return null;
  // A revoked session (after a logout) no longer authorises anything.
  if (await isSessionRevoked(claims.jti)) return null;
  return claims;
}

/** Returns true when the request carries a valid admin session. */
export async function isAuthorized(req: Request): Promise<boolean> {
  const token = extractToken(req);
  if (!token) return false;
  if (!isValidToken(token)) return false;
  const claims = verifyToken(token);
  if (claims && (await isSessionRevoked(claims.jti))) return false;
  return true;
}

/**
 * Express middleware guarding administrative routes.
 * Rejects with 401 when no valid session is present.
 */
export async function adminAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  // Express matches routes ignoring the case, so `/API/ADMIN/stats` reaches the
  // same handler as `/api/admin/stats` while `req.path` keeps the original
  // casing. Comparing without normalising would let anyone skip this guard.
  if (!req.path.toLowerCase().startsWith("/admin")) {
    next();
    return;
  }

  if (!(await isAuthorized(req))) {
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
export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!(await isAuthorized(req))) {
    logger.warn({ method: req.method, url: req.path }, "Rejected unauthorized request");
    res.status(401).json({ error: "No autorizado", code: "unauthorized" });
    return;
  }
  next();
}
