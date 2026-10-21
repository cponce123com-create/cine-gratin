/**
 * CSRF protection for cookie-authenticated requests.
 *
 * The session travels in a cookie, so any page in the browser could make the
 * browser send an authenticated request. CORS does not protect against that
 * (simple requests are sent before the browser asks for permission), so the
 * server verifies two things on every state-changing request:
 *
 *  1. **Origin / Referer**: the origin that made the request must be one of
 *     the explicitly allowed origins (or the very same host that serves the
 *     API). Requests without an origin are only accepted when they carry a
 *     valid CSRF token.
 *  2. **Session-bound CSRF token**: the `X-CSRF-Token` header must match the
 *     `csrf` claim of the session, compared in constant time. The token is
 *     delivered to the client in the login response and by
 *     `GET /api/auth/session`, and is bound to that concrete session.
 *
 * Requests authenticated with an `Authorization: Bearer` header are exempt:
 * they do not rely on ambient credentials, so a browser cannot forge them
 * (the token is not sent automatically by the browser).
 */
import type { NextFunction, Request, Response } from "express";
import { CSRF_HEADER, extractToken, safeCompare, usesBearerToken, verifyToken } from "./auth-utils";
import { getConfig } from "./config";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** Extracts the origin of a request, falling back to the Referer header. */
export function requestOrigin(req: Request): string | null {
  const origin = req.headers.origin;
  if (typeof origin === "string" && origin.length > 0) return origin;

  const referer = req.headers.referer;
  if (typeof referer === "string" && referer.length > 0) {
    try {
      return new URL(referer).origin;
    } catch {
      return null;
    }
  }

  return null;
}

/** True when the origin belongs to the allow-list (or to the API's own host). */
export function isAllowedOrigin(req: Request, origin: string): boolean {
  const config = getConfig();

  if (config.corsOrigins.includes("*")) return true;
  if (config.corsOrigins.includes(origin)) return true;

  // Same-origin requests (the API also serves the frontend) are always valid.
  const host = req.headers.host;
  if (host) {
    try {
      const own = new URL(`${req.protocol}://${host}`).origin;
      if (own === origin) return true;
    } catch {
      // Invalid host: fall through to the explicit allow-list.
    }
  }

  return false;
}

/**
 * Middleware that rejects state-changing requests without a valid CSRF
 * token (cookie sessions) or without an allowed origin.
 */
export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }

  // Bearer-token requests do not use ambient credentials: CSRF does not apply.
  if (usesBearerToken(req)) {
    next();
    return;
  }

  const origin = requestOrigin(req);

  if (origin && !isAllowedOrigin(req, origin)) {
    res.status(403).json({
      error: "Origen de la petición no permitido",
      code: "csrf_origin_rejected",
    });
    return;
  }

  const token = extractToken(req);
  const claims = token ? verifyToken(token) : null;

  // No session at all: the route itself decides whether it needs one
  // (login, public reports...). The origin check above is enough here.
  if (!claims) {
    next();
    return;
  }

  const provided = req.headers[CSRF_HEADER];
  const headerValue = Array.isArray(provided) ? provided[0] : provided;

  if (typeof headerValue !== "string" || headerValue.length === 0) {
    res.status(403).json({
      error: "Falta el token CSRF (cabecera X-CSRF-Token)",
      code: "csrf_token_missing",
    });
    return;
  }

  if (!safeCompare(headerValue, claims.csrf)) {
    res.status(403).json({
      error: "Token CSRF inválido",
      code: "csrf_token_invalid",
    });
    return;
  }

  next();
}
