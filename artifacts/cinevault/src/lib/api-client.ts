// ============================================================
// CineVault — API client (talks to api-server)
// ============================================================

import type { LocalMovie, VideoServer, AdminSettings } from "./admin-db";

const BASE = "/api";

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data as T;
}

// ─── Movies ───────────────────────────────────────────────────

export const apiGetMovies = () => api<LocalMovie[]>("/movies");

export const apiGetMovie = (id: string) => api<LocalMovie>(`/movies/${id}`);

export const apiSearchMovies = (q: string) =>
  api<LocalMovie[]>(`/movies/search?q=${encodeURIComponent(q)}`);

export const apiSaveMovie = (movie: LocalMovie) =>
  api<LocalMovie>("/movies", { method: "POST", body: JSON.stringify(movie) });

export const apiDeleteMovie = (id: string) =>
  api<{ ok: boolean }>(`/movies/${id}`, { method: "DELETE" });

export const apiIncrementView = (id: string) =>
  api<{ ok: boolean }>(`/movies/${id}/view`, { method: "PATCH" });

// ─── Settings ─────────────────────────────────────────────────

export const apiGetSettings = () =>
  api<Record<string, string>>("/settings").then(obj => ({
    site_name: obj.site_name ?? "CineVault",
    site_logo: obj.site_logo ?? "",
    admin_password: obj.admin_password ?? "admin123",
    show_yts_movies: obj.show_yts_movies !== "false",
    show_local_movies: obj.show_local_movies !== "false",
    merge_sources: obj.merge_sources !== "false",
    default_sort: obj.default_sort ?? "date_added",
    featured_movie_id: obj.featured_movie_id ?? "",
  } as AdminSettings));

export const apiSaveSettings = (settings: AdminSettings) =>
  api<{ ok: boolean }>("/settings", {
    method: "POST",
    body: JSON.stringify({
      site_name: settings.site_name,
      site_logo: settings.site_logo,
      admin_password: settings.admin_password,
      show_yts_movies: String(settings.show_yts_movies),
      show_local_movies: String(settings.show_local_movies),
      merge_sources: String(settings.merge_sources),
      default_sort: settings.default_sort,
      featured_movie_id: settings.featured_movie_id,
    }),
  });

// ─── Servers ──────────────────────────────────────────────────

export const apiGetServers = () =>
  api<Array<{ id: string; name: string; base_url: string; active: boolean; sort_order: number }>>("/servers").then(rows =>
    rows.length > 0
      ? rows.map(r => ({
          id: r.id,
          name: r.name,
          url_pattern: r.base_url,
          active: r.active,
          order: r.sort_order,
        } as VideoServer))
      : DEFAULT_SERVERS
  );

export const apiSaveServers = (servers: VideoServer[]) =>
  api<{ ok: boolean }>("/servers", {
    method: "POST",
    body: JSON.stringify(
      servers.map((s, i) => ({
        id: s.id,
        name: s.name,
        base_url: s.url_pattern,
        active: s.active,
        sort_order: i,
      }))
    ),
  });

// ─── Auth ─────────────────────────────────────────────────────

export const apiLogin = (password: string) =>
  api<{ ok: boolean }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ password }),
  });

export const apiChangePassword = (password: string) =>
  api<{ ok: boolean }>("/auth/change-password", {
    method: "POST",
    body: JSON.stringify({ password }),
  });

// ─── Default servers (fallback) ───────────────────────────────

export const DEFAULT_SERVERS: VideoServer[] = [
  { id: "vidsrc", name: "VidSrc", url_pattern: "https://vidsrc.net/embed/movie/{IMDB_ID}/", active: true, order: 0 },
  { id: "multiembed", name: "MultiEmbed", url_pattern: "https://multiembed.mov/embed/imdb/{IMDB_ID}", active: true, order: 1 },
  { id: "2embed", name: "2Embed", url_pattern: "https://www.2embed.cc/embed/{IMDB_ID}", active: true, order: 2 },
  { id: "embedsu", name: "EmbedSu", url_pattern: "https://embed.su/embed/movie/{IMDB_ID}", active: true, order: 3 },
];
