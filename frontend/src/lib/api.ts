const BASE_URL = "https://cine-gratin.onrender.com";

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`);
  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${path}`);
  }
  return res.json() as Promise<T>;
}

async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${path}`);
  }
  return res.json() as Promise<T>;
}

import type { Movie, Series } from "./types";
import type { AutoImportStatus, VidsrcResult, RunImportResult } from "./types";

// Public endpoints
export const getMovies = (): Promise<Movie[]> => apiFetch("/api/movies");
export const getMovie = (id: string): Promise<Movie> => apiFetch(`/api/movies/${id}`);
export const getSeries = (): Promise<Series[]> => apiFetch("/api/series");
export const getSeriesById = (id: string): Promise<Series> => apiFetch(`/api/series/${id}`);

// Admin endpoints
export const getAutoImportStatus = (): Promise<AutoImportStatus> =>
  apiFetch("/api/admin/auto-import/status");
export const toggleAutoImport = (enabled: boolean): Promise<{ enabled: boolean }> =>
  apiPost("/api/admin/auto-import/toggle", { enabled });
export const runAutoImport = (): Promise<RunImportResult> =>
  apiPost("/api/admin/auto-import/run", {});
export const verifyVidsrc = (
  imdb_ids: string[],
  type: "movie" | "series"
): Promise<VidsrcResult[]> => apiPost("/api/admin/verify-vidsrc", { imdb_ids, type });
