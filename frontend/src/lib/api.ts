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

async function adminFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: { ...authHeaders(), ...options.headers },
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${path}`);
  return res.json() as Promise<T>;
}

async function adminPost<T>(path: string, body: unknown): Promise<T> {
  return adminFetch<T>(path, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

async function adminDelete(path: string): Promise<void> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${path}`);
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

export const saveVidsrcResults = (
  results: { imdb_id: string; type: "movie" | "series"; available: boolean }[]
): Promise<VidsrcResult[]> =>
  adminPost("/api/admin/verify-vidsrc", { results });

// verifyVidsrc: descarga la lista pública de vidsrc.me y cruza con los ids dados
export const verifyVidsrc = async (
  imdb_ids: string[],
  type: "movie" | "series"
): Promise<VidsrcResult[]> => {
  // Descargar lista completa de vidsrc.me para este tipo
  const available = new Set<string>();
  const base = type === "series"
    ? "https://vidsrc.me/tvshows/latest/page-"
    : "https://vidsrc.me/movies/latest/page-";
  for (let page = 1; page <= 999; page++) {
    try {
      const res = await fetch(`${base}${page}.json`, { credentials: "omit" });
      if (!res.ok) break;
      const data = await res.json() as { imdb_id?: string }[];
      if (!Array.isArray(data) || data.length === 0) break;
      for (const item of data) { if (item.imdb_id) available.add(item.imdb_id); }
    } catch { break; }
  }

  const payload = imdb_ids.map((id) => ({ imdb_id: id, type, available: available.has(id) }));
  await saveVidsrcResults(payload).catch(() => {});
  return payload.map(({ imdb_id, available: av }) => ({ imdb_id, available: av }));
};

export const getAdminStats = (): Promise<AdminStats> =>
  adminFetch("/api/admin/stats");

export const deleteMovie = (id: string | number): Promise<void> =>
  adminDelete(`/api/admin/movies/${id}`);

export const deleteSeries = (id: string | number): Promise<void> =>
  adminDelete(`/api/admin/series/${id}`);

export const saveMovie = (movie: Partial<Movie>): Promise<Movie> =>
  adminPost(`/api/admin/movies${movie.id ? `/${movie.id}` : ""}`, movie);

export const saveSeries = (series: Partial<Series>): Promise<Series> =>
  adminPost(`/api/admin/series${series.id ? `/${series.id}` : ""}`, series);

export interface ScanNetworksResult {
  id: string | number;
  title: string;
  old_networks: string[];
  new_networks: string[];
  status: "updated" | "no_change" | "error";
  error?: string;
}

export interface ScanNetworksResponse {
  ok: boolean;
  results: ScanNetworksResult[];
  summary: { updated: number; no_change: number; error: number };
}

export const scanNetworks = (
  type: "movie" | "series",
  limit?: number
): Promise<ScanNetworksResponse> =>
  adminPost("/api/admin/scan-networks", { type, limit });


export interface CleanupResponse {
  ok: boolean;
  summary: { movies: number; series: number; total: number };
}

export const cleanupMissingImages = (type: "movie" | "series" | "all" = "all"): Promise<CleanupResponse> =>
  adminPost("/api/admin/cleanup-missing-images", { type });

export const cleanupNoVidsrc = (): Promise<CleanupResponse> =>
  adminPost("/api/admin/cleanup-no-vidsrc", {});

// ── TMDB Explorer ─────────────────────────────────────────────────────────────

export interface TmdbGenre {
  id: number;
  name: string;
}

export interface TmdbDiscoverItem {
  tmdb_id: number;
  title: string;
  year: string;
  poster_url: string;
  rating: number;
  vote_count: number;
  overview: string;
}

export interface TmdbDiscoverResult {
  ok: boolean;
  results: TmdbDiscoverItem[];
  total_results: number;
  total_pages: number;
  page: number;
}

export const getTmdbGenres = (type: "movie" | "series"): Promise<TmdbGenre[]> =>
  adminFetch(`/api/admin/tmdb-genres/${type}`);

export const tmdbDiscover = (params: {
  type: "movie" | "series";
  genre_ids?: string;
  year_from?: number;
  year_to?: number;
  sort_by?: string;
  language?: string;
  min_votes?: number;
  page?: number;
  count?: number;
}): Promise<TmdbDiscoverResult> =>
  adminPost("/api/admin/tmdb-discover", params);

export const importCollection = (
  collection_id: number
): Promise<{ ok: boolean; collection: string; imported: number; existed: number; total: number; titles: string[] }> =>
  adminPost("/api/admin/import-collection", { collection_id });

export const resetCollection = (
  collection_id: number
): Promise<{ ok: boolean; deleted_movies: number; deleted_series: number; total_deleted: number }> =>
  adminPost("/api/admin/reset-collection", { collection_id });

export const importByTmdbIds = (
  tmdb_ids: number[],
  type: "movie" | "series"
): Promise<{ ok: boolean; summary: { imported: number; existed_or_error: number; total: number } }> =>
  adminPost("/api/admin/import-by-tmdb-ids", { tmdb_ids, type });
