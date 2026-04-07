import { getToken } from "./auth";
import type { Movie, Series } from "./types";
import type { AutoImportStatus, VidsrcResult, RunImportResult, AdminStats } from "./types";

const BASE_URL =
  (import.meta.env["VITE_API_URL"] as string | undefined) ||
  "https://cine-gratin.onrender.com";

// ── Generic helpers ───────────────────────────────────────────────────────────

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`);
  if (!res.ok) throw new Error(`API error ${res.status}: ${path}`);
  return res.json() as Promise<T>;
}

async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${path}`);
  return res.json() as Promise<T>;
}

async function apiPatch(path: string): Promise<void> {
  await fetch(`${BASE_URL}${path}`, { method: "PATCH" }).catch(() => {});
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token
    ? { "Content-Type": "application/json", Authorization: `Bearer ${token}` }
    : { "Content-Type": "application/json" };
}

async function adminFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`API error ${res.status}: ${path}`);
  return res.json() as Promise<T>;
}

async function adminPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${path}`);
  return res.json() as Promise<T>;
}

// ── Public endpoints ──────────────────────────────────────────────────────────

export const getMovies = (): Promise<Movie[]> => apiFetch("/api/movies");
export const getMovie = (id: string): Promise<Movie> => apiFetch(`/api/movies/${id}`);
export const getSeries = (): Promise<Series[]> => apiFetch("/api/series");
export const getSeriesById = (id: string): Promise<Series> => apiFetch(`/api/series/${id}`);

export const searchMovies = (q: string, limit = 6): Promise<Movie[]> =>
  apiFetch(`/api/movies/search?q=${encodeURIComponent(q)}&limit=${limit}`);
export const searchSeries = (q: string, limit = 4): Promise<Series[]> =>
  apiFetch(`/api/series/search?q=${encodeURIComponent(q)}&limit=${limit}`);

export const trackMovieView = (id: string | number): Promise<void> =>
  apiPatch(`/api/movies/${id}/view`);
export const trackSeriesView = (id: string | number): Promise<void> =>
  apiPatch(`/api/series/${id}/view`);

// ── Admin endpoints ───────────────────────────────────────────────────────────

export const getAutoImportStatus = (): Promise<AutoImportStatus> =>
  adminFetch("/api/admin/auto-import/status");
export const toggleAutoImport = (enabled: boolean): Promise<{ enabled: boolean }> =>
  adminPost("/api/admin/auto-import/toggle", { enabled });
export const runAutoImport = (): Promise<RunImportResult> =>
  adminPost("/api/admin/auto-import/run", {});

export interface IdImportResult {
  imdb_id: string;
  title: string | null;
  year?: number | null;
  status: "imported" | "existed" | "not_found" | "error";
  error?: string;
}

export interface ImportByIdsResponse {
  ok: boolean;
  results: IdImportResult[];
  summary: { imported: number; existed: number; not_found: number; error: number };
}

export const importByIds = (
  imdb_ids: string[],
  type: "movie" | "series"
): Promise<ImportByIdsResponse> =>
  adminPost("/api/admin/import-by-ids", { imdb_ids, type });

export const verifyVidsrc = (
  imdb_ids: string[],
  type: "movie" | "series"
): Promise<VidsrcResult[]> =>
  adminPost("/api/admin/verify-vidsrc", { imdb_ids, type });

export const getAdminStats = (): Promise<AdminStats> =>
  adminFetch("/api/admin/stats");
