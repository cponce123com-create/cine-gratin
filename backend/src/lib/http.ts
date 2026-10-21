/**
 * Shared HTTP helpers: pagination parsing, validation and async error
 * forwarding.
 */
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { z, type ZodTypeAny } from "zod";
import { badRequest } from "./errors";

export const MAX_PAGE_SIZE = 100;
export const MAX_OFFSET = 100_000;

export interface Pagination {
  page: number;
  limit: number;
  offset: number;
}

/**
 * Parses and clamps pagination parameters.
 * Out-of-range or malformed values are rejected instead of silently coerced,
 * which avoids unbounded queries and confusing results.
 */
export function parsePagination(
  query: Record<string, unknown>,
  options: { defaultLimit?: number; maxLimit?: number } = {},
): Pagination {
  const defaultLimit = options.defaultLimit ?? 20;
  const maxLimit = Math.min(options.maxLimit ?? MAX_PAGE_SIZE, MAX_PAGE_SIZE);

  const rawPage = query["page"];
  const rawLimit = query["limit"];
  const rawOffset = query["offset"];

  const page = rawPage === undefined ? 1 : Number(rawPage);
  if (!Number.isInteger(page) || page < 1) {
    throw badRequest("El parámetro 'page' debe ser un entero mayor o igual a 1");
  }

  const limit = rawLimit === undefined ? defaultLimit : Number(rawLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > maxLimit) {
    throw badRequest(`El parámetro 'limit' debe ser un entero entre 1 y ${maxLimit}`);
  }

  let offset = (page - 1) * limit;
  if (rawOffset !== undefined) {
    const parsed = Number(rawOffset);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > MAX_OFFSET) {
      throw badRequest(`El parámetro 'offset' debe ser un entero entre 0 y ${MAX_OFFSET}`);
    }
    offset = parsed;
  }

  if (offset > MAX_OFFSET) {
    throw badRequest(`El desplazamiento no puede superar ${MAX_OFFSET}`);
  }

  return { page, limit, offset };
}

/** Parses a positive integer query parameter with a fallback. */
export function parseIntParam(
  value: unknown,
  fallback: number,
  { min = 0, max = Number.MAX_SAFE_INTEGER, name = "valor" } = {},
): number {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw badRequest(`El parámetro '${name}' debe ser un entero entre ${min} y ${max}`);
  }
  return parsed;
}

/** Parses a bounded string query parameter. */
export function parseStringParam(value: unknown, { maxLength = 200, name = "valor" } = {}): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw badRequest(`El parámetro '${name}' debe ser texto`);
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > maxLength) {
    throw badRequest(`El parámetro '${name}' no puede superar ${maxLength} caracteres`);
  }
  return trimmed;
}

/**
 * Wraps an async route handler so rejected promises reach the Express error
 * handler instead of becoming unhandled rejections.
 */
export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    handler(req, res, next).catch(next);
  };
}

/**
 * Validates `req.body` against a Zod schema.
 * Throws a 400 with the list of issues when validation fails.
 */
export function parseBody<T extends ZodTypeAny>(schema: T, body: unknown): z.infer<T> {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw badRequest(
      "Datos inválidos",
      result.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    );
  }
  return result.data;
}

/** Validates `req.query` against a Zod schema. */
export function parseQuery<T extends ZodTypeAny>(schema: T, query: unknown): z.infer<T> {
  const result = schema.safeParse(query);
  if (!result.success) {
    throw badRequest(
      "Parámetros inválidos",
      result.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    );
  }
  return result.data;
}

/** Escapes the special characters of a LIKE pattern so user input is literal. */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}
