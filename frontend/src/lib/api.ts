import { ensureCsrfToken, fetchSession, getCsrfToken, notifyUnauthorized, type SessionState } from "./auth";
import type { Movie, Series } from "./types";
import type { AutoImportStatus, VidsrcResult, RunImportResult, AdminStats } from "./types";

export const BASE_URL =
  (import.meta.env["VITE_API_URL"] as string | undefined) || "https://cine-gratin.onrender.com";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Fetches with the session cookie attached.
 *
 * State-changing requests carry the CSRF token of the session in the
 * `X-CSRF-Token` header: the server rejects them otherwise, which prevents
 * another site from making the browser perform an authenticated action.
 */
async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? "GET").toUpperCase();
  const headers = new Headers(init.headers);

  if (MUTATING_METHODS.has(method)) {
    if (!headers.has("Content-Type") && init.body) {
      headers.set("Content-Type", "application/json");
    }
    const token = getCsrfToken() ?? (await ensureCsrfToken());
    if (token) headers.set("X-CSRF-Token", token);
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers,
    credentials: "include",
  });

  if (res.status === 401) {
    // The session expired or was revoked: the application reacts by sending
    // the user to the login screen.
    notifyUnauthorized();
  }

  if (!res.ok) {
    let message = `Error ${res.status}`;
    try {
      const body = (await res.json()) as { error?: string; hint?: string; details?: unknown };
      if (body.error) message = body.hint ? `${body.error}\n\n${body.hint}` : body.error;
    } catch {
      /* keep the default message */
    }
    throw new Error(message);
  }

  return res.json() as Promise<T>;
}

// ── Generic helpers ───────────────────────────────────────────────────────────

export async function apiFetch<T>(path: string, signal?: AbortSignal): Promise<T> {
  return request<T>(path, { signal });
}

export async function apiPost<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  return request<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
}

export async function apiPatch(path: string): Promise<void> {
  await fetch(`${BASE_URL}${path}`, { method: "PATCH", credentials: "include" }).catch(() => {});
}

/** Session-aware fetch used by every administrative endpoint. */
export async function adminFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  return request<T>(path, {
    ...options,
    credentials: "include",
  });
}

export async function adminPost<T>(path: string, body: unknown): Promise<T> {
  return adminFetch<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function adminDelete(path: string): Promise<void> {
  await adminFetch<unknown>(path, { method: "DELETE" });
}

/** Returns the state of the current browser session (and its CSRF token). */
export const getSession = (): Promise<SessionState> => fetchSession();

// ── Public endpoints ──────────────────────────────────────────────────────────

export const getMovies = (params?: {
  page?: number;
  limit?: number;
  signal?: AbortSignal;
}): Promise<Movie[]> => {
  const query = new URLSearchParams();
  if (params?.page) query.append("page", params.page.toString());
  if (params?.limit) query.append("limit", params.limit.toString());
  const queryString = query.toString();
  return apiFetch(`/api/movies${queryString ? `?${queryString}` : ""}`, params?.signal);
};
export const getMovie = (id: string, signal?: AbortSignal): Promise<Movie> =>
  apiFetch(`/api/movies/${encodeURIComponent(id)}`, signal);
export const getMovieByImdbId = (imdbId: string): Promise<Movie> => getMovie(imdbId);
export const getSeries = (params?: {
  page?: number;
  limit?: number;
  signal?: AbortSignal;
}): Promise<Series[]> => {
  const query = new URLSearchParams();
  if (params?.page) query.append("page", params.page.toString());
  if (params?.limit) query.append("limit", params.limit.toString());
  const queryString = query.toString();
  return apiFetch(`/api/series${queryString ? `?${queryString}` : ""}`, params?.signal);
};
export const getSeriesById = (id: string, signal?: AbortSignal): Promise<Series> =>
  apiFetch(`/api/series/${encodeURIComponent(id)}`, signal);

export const searchMovies = (q: string, limit = 6, signal?: AbortSignal): Promise<Movie[]> =>
  apiFetch(`/api/movies/search?q=${encodeURIComponent(q)}&limit=${limit}`, signal);
export const searchSeries = (q: string, limit = 4, signal?: AbortSignal): Promise<Series[]> =>
  apiFetch(`/api/series/search?q=${encodeURIComponent(q)}&limit=${limit}`, signal);

export const trackMovieView = (id: string | number): Promise<void> => apiPatch(`/api/movies/${id}/view`);
export const trackSeriesView = (id: string | number): Promise<void> => apiPatch(`/api/series/${id}/view`);

// ── Sagas ─────────────────────────────────────────────────────────────────────

export interface SagaItem {
  id: number;
  name: string;
  poster_path: string | null;
  backdrop_path: string | null;
  part_count: number;
  overview: string;
}

export interface SagaPart {
  id: number;
  title: string;
  poster_url: string | null;
  backdrop_url: string | null;
  release_date: string;
  year: number | null;
  vote_average: number;
  overview: string;
  tmdb_id: number;
  local_id: string | null;
  is_imported: boolean;
}

export interface SagaDetail {
  id: number;
  name: string;
  poster_path: string | null;
  backdrop_path: string | null;
  overview: string;
  parts: SagaPart[];
}

export interface CvSagaRow {
  id: number;
  collection_id: number;
  name: string;
  poster_path: string | null;
  backdrop_path: string | null;
  overview: string | null;
  part_count: number;
  is_curated: boolean;
  created_at: string;
}

export const fetchSagas = (options?: { signal?: AbortSignal }): Promise<SagaItem[]> =>
  apiFetch("/api/sagas", options?.signal);

export const fetchSagaById = (id: number): Promise<SagaDetail> => apiFetch(`/api/sagas/${id}`);

export interface RefreshSagaResponse extends SagaDetail {
  imported: number;
}

export const refreshSaga = (id: number, autoImport = false): Promise<RefreshSagaResponse> =>
  adminPost(`/api/admin/sagas/${id}/refresh`, { autoImport });

export const adminFetchSagas = (): Promise<CvSagaRow[]> => adminFetch("/api/admin/sagas");
export const adminAddSaga = (collection_id: number): Promise<CvSagaRow> =>
  adminPost("/api/admin/sagas", { collection_id });
export const adminDeleteSaga = (collection_id: number): Promise<{ ok: boolean }> =>
  adminFetch("/api/admin/sagas/" + collection_id, { method: "DELETE" });

// ── Admin endpoints ───────────────────────────────────────────────────────────

export const getAutoImportStatus = (): Promise<AutoImportStatus> =>
  adminFetch("/api/admin/auto-import/status");
export const toggleAutoImport = (enabled: boolean): Promise<{ enabled: boolean }> =>
  adminPost("/api/admin/auto-import/toggle", { enabled });
export const runAutoImport = (sources?: string[]): Promise<RunImportResult> =>
  adminPost("/api/admin/auto-import/run", { sources });

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

export const importByIds = (imdb_ids: string[], type: "movie" | "series"): Promise<ImportByIdsResponse> =>
  adminPost("/api/admin/import-by-ids", { imdb_ids, type });

export const saveVidsrcResults = (
  results: { imdb_id: string; type: "movie" | "series"; available: boolean }[],
): Promise<VidsrcResult[]> => adminPost("/api/admin/verify-vidsrc", { results });

// verifyVidsrc: verifica disponibilidad de IDs específicos descargando la
// lista completa de vidsrc.me desde el navegador (para la función "Verificar
// seleccionados" en ManageMovies/ManageSeries).
// Prefiere usar el Escáner VIDSRC (página dedicada) para escaneos grandes.
export const verifyVidsrc = async (imdb_ids: string[], type: "movie" | "series"): Promise<VidsrcResult[]> => {
  const available = new Set<string>();
  const base =
    type === "series" ? "https://vidsrc.me/tvshows/latest/page-" : "https://vidsrc.me/movies/latest/page-";
  for (let page = 1; page <= 999; page++) {
    try {
      const res = await fetch(`${base}${page}.json`, { credentials: "omit" });
      if (!res.ok) break;
      const data = (await res.json()) as { imdb_id?: string }[];
      if (!Array.isArray(data) || data.length === 0) break;
      for (const item of data) {
        if (item.imdb_id) available.add(item.imdb_id);
      }
    } catch {
      break;
    }
  }
  const payload = imdb_ids.map((id) => ({ imdb_id: id, type, available: available.has(id) }));
  await saveVidsrcResults(payload).catch(() => {});
  return payload.map(({ imdb_id, available: av }) => ({ imdb_id, available: av }));
};

export const getAdminStats = (): Promise<AdminStats> => adminFetch("/api/admin/stats");

export const deleteMovie = (id: string | number): Promise<void> =>
  adminDelete(`/api/admin/movies/${encodeURIComponent(String(id))}`);

export const deleteSeries = (id: string | number): Promise<void> =>
  adminDelete(`/api/admin/series/${encodeURIComponent(String(id))}`);

export const saveMovie = (movie: Partial<Movie>): Promise<Movie> =>
  adminPost(`/api/admin/movies${movie.id ? `/${encodeURIComponent(String(movie.id))}` : ""}`, movie);

export const saveSeries = (series: Partial<Series>): Promise<Series> =>
  adminPost(`/api/admin/series${series.id ? `/${encodeURIComponent(String(series.id))}` : ""}`, series);

// ── Catalogue management (server-side pagination, filters and sorting) ───────

export interface AdminListParams {
  page?: number;
  limit?: number;
  q?: string;
  genre?: string;
  vidsrc?: string;
  auto_imported?: string;
  year?: number;
  sort?: string;
  order?: "asc" | "desc";
}

export interface AdminListResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

function buildAdminQuery(params: AdminListParams): string {
  const query = new URLSearchParams();
  if (params.page) query.set("page", String(params.page));
  if (params.limit) query.set("limit", String(params.limit));
  if (params.q) query.set("q", params.q);
  if (params.genre) query.set("genre", params.genre);
  if (params.vidsrc) query.set("vidsrc", params.vidsrc);
  if (params.auto_imported) query.set("auto_imported", params.auto_imported);
  if (params.year) query.set("year", String(params.year));
  if (params.sort) query.set("sort", params.sort);
  if (params.order) query.set("order", params.order);
  const qs = query.toString();
  return qs ? `?${qs}` : "";
}

export const adminListMovies = (params: AdminListParams = {}): Promise<AdminListResponse<Movie>> =>
  adminFetch(`/api/admin/movies${buildAdminQuery(params)}`);

export const adminListSeries = (params: AdminListParams = {}): Promise<AdminListResponse<Series>> =>
  adminFetch(`/api/admin/series${buildAdminQuery(params)}`);

export const bulkDeleteMovies = (ids: Array<string | number>): Promise<{ deleted: number }> =>
  adminPost("/api/admin/movies/bulk-delete", { ids: ids.map(String) });

export const bulkDeleteSeries = (ids: Array<string | number>): Promise<{ deleted: number }> =>
  adminPost("/api/admin/series/bulk-delete", { ids: ids.map(String) });

// ── Import jobs ───────────────────────────────────────────────────────────────

export type ImportJobStatus = "queued" | "running" | "completed" | "partial" | "failed" | "cancelled";

export interface ImportJobItem {
  input: string;
  title: string | null;
  year: number | null;
  status: "imported" | "existed" | "not_found" | "skipped" | "error";
  error?: string;
}

export interface ImportJob {
  id: string;
  type: "movie" | "series";
  source: string;
  status: ImportJobStatus;
  total: number;
  processed: number;
  imported: number;
  skipped: number;
  failed: number;
  result: ImportJobItem[];
  error: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export interface ImportPreviewItem {
  input: string;
  type: "movie" | "series";
  title: string | null;
  year: number | null;
  posterUrl: string | null;
  imdbId: string | null;
  tmdbId: number | null;
  status: "new" | "existed" | "not_found" | "invalid";
}

export interface ImportPreviewResponse {
  items: ImportPreviewItem[];
  summary: { total: number; new: number; existed: number; not_found: number; invalid: number };
  invalid: string[];
}

export const previewImport = (items: string[], type: "movie" | "series"): Promise<ImportPreviewResponse> =>
  adminPost("/api/admin/import-jobs/preview", { items, type, source: "preview" });

export const createImportJob = (
  items: string[],
  type: "movie" | "series",
  source = "manual",
): Promise<{ job: ImportJob; invalid: string[] }> =>
  adminPost("/api/admin/import-jobs", { items, type, source });

export const getImportJob = (id: string): Promise<{ job: ImportJob }> =>
  adminFetch(`/api/admin/import-jobs/${id}`);

export const listImportJobs = (limit = 20): Promise<{ jobs: ImportJob[] }> =>
  adminFetch(`/api/admin/import-jobs?limit=${limit}`);

export const cancelImportJob = (id: string): Promise<{ job: ImportJob }> =>
  adminPost(`/api/admin/import-jobs/${id}/cancel`, {});

// ── Maintenance ───────────────────────────────────────────────────────────────

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

export const scanNetworks = (type: "movie" | "series", limit?: number): Promise<ScanNetworksResponse> =>
  adminPost("/api/admin/scan-networks", { type, limit });

export interface CleanupSummary {
  movies: number;
  series: number;
  total: number;
}

export interface CleanupResponse {
  ok: boolean;
  summary: CleanupSummary;
}

export interface CleanupPreviewResponse {
  ok: boolean;
  preview: true;
  would_delete: { movies: number; series: number };
  sample: { movies: Array<{ id: string; title: string }>; series: Array<{ id: string; title: string }> };
}

/**
 * The cleanup endpoints are two-phase: the first call reports exactly what
 * would be deleted, the second one (with `confirm: true`) performs it.
 */
export const previewCleanupMissingImages = (
  type: "movie" | "series" | "all" = "all",
): Promise<CleanupPreviewResponse> => adminPost("/api/admin/cleanup-missing-images", { type });

export const cleanupMissingImages = (type: "movie" | "series" | "all" = "all"): Promise<CleanupResponse> =>
  adminPost("/api/admin/cleanup-missing-images", { type, confirm: true });

export const previewCleanupNoVidsrc = (): Promise<CleanupPreviewResponse> =>
  adminPost("/api/admin/cleanup-no-vidsrc", {});

export const cleanupNoVidsrc = (): Promise<CleanupResponse> =>
  adminPost("/api/admin/cleanup-no-vidsrc", { confirm: true });

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
}): Promise<TmdbDiscoverResult> => adminPost("/api/admin/tmdb-discover", params);

export const importByTmdbIds = (
  tmdb_ids: number[],
  type: "movie" | "series",
): Promise<{ ok: boolean; summary: { imported: number; existed_or_error: number; total: number } }> =>
  adminPost("/api/admin/import-by-tmdb-ids", { tmdb_ids, type });
