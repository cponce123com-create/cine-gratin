/**
 * Error handling helpers.
 *
 * Internal errors (stack traces, SQL errors, upstream payloads) must never
 * reach the client. Every failure is logged server-side together with a
 * request id, and the client receives a generic message plus that id so a
 * support request can be traced back to the precise log line.
 */
import type { Response } from "express";
import { logger } from "./logger";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;
  /** Errors with `expose = true` may show their message to the client. */
  readonly expose: boolean;

  constructor(status: number, message: string, code = "error", details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
    this.expose = status < 500;
  }
}

export const badRequest = (message: string, details?: unknown): ApiError =>
  new ApiError(400, message, "bad_request", details);

export const unauthorized = (message = "No autorizado"): ApiError =>
  new ApiError(401, message, "unauthorized");

export const forbidden = (message = "Acceso denegado"): ApiError => new ApiError(403, message, "forbidden");

export const notFound = (message = "No encontrado"): ApiError => new ApiError(404, message, "not_found");

export const conflict = (message: string): ApiError => new ApiError(409, message, "conflict");

export const tooManyRequests = (message = "Demasiadas peticiones"): ApiError =>
  new ApiError(429, message, "rate_limited");

/**
 * Converts any thrown value into a client-safe payload.
 * The full error (with stack) is written to the log, never to the response.
 */
export function sendError(res: Response, err: unknown, requestId?: string): void {
  if (err instanceof ApiError) {
    if (err.status >= 500) {
      logger.error({ err, requestId }, "Request failed");
    } else {
      logger.warn({ code: err.code, requestId, details: err.details }, "Request rejected");
    }
    res.status(err.status).json({
      error: err.expose ? err.message : "Error interno del servidor",
      code: err.code,
      ...(err.expose && err.details !== undefined ? { details: err.details } : {}),
      ...(requestId ? { requestId } : {}),
    });
    return;
  }

  logger.error({ err, requestId }, "Unhandled error");
  res.status(500).json({
    error: "Error interno del servidor",
    code: "internal_error",
    ...(requestId ? { requestId } : {}),
  });
}
