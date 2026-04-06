// ============================================================
// CineVault Admin — localStorage data layer
// ============================================================

export interface LocalMovie {
  id: string;
  imdb_id: string;
  title: string;
  year: number;
  rating: number;
  runtime: number;
  genres: string[];
  language: string;
  synopsis: string;
  director: string;
  cast_list: string[];
  poster_url: string;
  background_url: string;
  yt_trailer_code: string;
  mpa_rating: string;
  slug: string;
  featured: boolean;
  views: number;
  date_added: string;
  video_sources: VideoSource[];
  torrents: LocalTorrent[];
  vidsrc_status?: string;
  auto_imported?: boolean;
}

export interface VideoSource {
  id: string;
  name: string;
  url: string;
  active: boolean;
}

export interface LocalTorrent {
  id: string;
  quality: string;
  source: string;
  size: string;
  url: string;
}

export interface VideoServer {
  id: string;
  name: string;
  url_pattern: string;
  active: boolean;
  order: number;
}

export interface AdminSettings {
  site_name: string;
  site_logo: string;
  admin_password: string;
  show_yts_movies: boolean;
  show_local_movies: boolean;
  merge_sources: boolean;
  default_sort: string;
  featured_movie_id: string;
}

export interface ActivityEntry {
  id: string;
  action: string;
  details: string;
  timestamp: string;
}

// ─── Default values ───────────────────────────────────────────

export const DEFAULT_SETTINGS: AdminSettings = {
  site_name: "CineVault",
  site_logo: "",
  admin_password: "admin123",
  show_yts_movies: true,
  show_local_movies: true,
  merge_sources: true,
  default_sort: "date_added",
  featured_movie_id: "",
};

export const DEFAULT_SERVERS: VideoServer[] = [
  { id: "vidsrc", name: "VidSrc", url_pattern: "https://vidsrc.net/embed/movie/{IMDB_ID}/", active: true, order: 0 },
  { id: "multiembed", name: "MultiEmbed", url_pattern: "https://multiembed.mov/embed/imdb/{IMDB_ID}", active: true, order: 1 },
  { id: "2embed", name: "2Embed", url_pattern: "https://www.2embed.cc/embed/{IMDB_ID}", active: true, order: 2 },
  { id: "embedsu", name: "EmbedSu", url_pattern: "https://embed.su/embed/movie/{IMDB_ID}", active: true, order: 3 },
];

// ─── Keys ─────────────────────────────────────────────────────

const KEYS = {
  movies: "cinevault_movies",
  settings: "cinevault_settings",
  servers: "cinevault_servers",
  auth: "cinevault_auth",
  activity: "cinevault_activity",
};

// ─── Helpers ──────────────────────────────────────────────────

function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJSON<T>(key: string, data: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    console.warn("localStorage write failed", e);
  }
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

// ─── Movies ───────────────────────────────────────────────────

export function getMovies(): LocalMovie[] {
  return readJSON<LocalMovie[]>(KEYS.movies, []);
}

export function saveMovies(movies: LocalMovie[]): void {
  writeJSON(KEYS.movies, movies);
}

export function getMovie(id: string): LocalMovie | undefined {
  return getMovies().find(m => m.id === id);
}

export function getMovieByImdb(imdbId: string): LocalMovie | undefined {
  return getMovies().find(m => m.imdb_id === imdbId);
}

export function addMovie(movie: LocalMovie): void {
  const movies = getMovies();
  const existing = movies.findIndex(m => m.id === movie.id);
  if (existing >= 0) {
    movies[existing] = movie;
  } else {
    movies.unshift(movie);
  }
  saveMovies(movies);
  logActivity("Movie Added", `${movie.title} (${movie.year})`);
}

export function updateMovie(id: string, patch: Partial<LocalMovie>): void {
  const movies = getMovies().map(m => m.id === id ? { ...m, ...patch } : m);
  saveMovies(movies);
}

export function deleteMovie(id: string): void {
  const movie = getMovie(id);
  const movies = getMovies().filter(m => m.id !== id);
  saveMovies(movies);
  if (movie) logActivity("Movie Deleted", `${movie.title} (${movie.year})`);
}

export function incrementViews(imdbId: string): void {
  const movies = getMovies().map(m =>
    m.imdb_id === imdbId ? { ...m, views: (m.views || 0) + 1 } : m
  );
  saveMovies(movies);
}

// ─── Settings ─────────────────────────────────────────────────

export function getSettings(): AdminSettings {
  return { ...DEFAULT_SETTINGS, ...readJSON<Partial<AdminSettings>>(KEYS.settings, {}) };
}

export function saveSettings(settings: AdminSettings): void {
  writeJSON(KEYS.settings, settings);
  logActivity("Settings Updated", "Admin settings were changed");
}

// ─── Servers ──────────────────────────────────────────────────

export function getServers(): VideoServer[] {
  const stored = readJSON<VideoServer[]>(KEYS.servers, []);
  return stored.length > 0 ? stored : DEFAULT_SERVERS;
}

export function saveServers(servers: VideoServer[]): void {
  writeJSON(KEYS.servers, servers);
}

// ─── Auth ─────────────────────────────────────────────────────

export function isAuthenticated(): boolean {
  return readJSON<{ authenticated?: boolean }>(KEYS.auth, {}).authenticated === true;
}

export function login(password: string): boolean {
  const correct = getSettings().admin_password;
  if (password === correct) {
    writeJSON(KEYS.auth, { authenticated: true, loginTime: Date.now() });
    logActivity("Admin Login", "Successful login");
    return true;
  }
  return false;
}

export function logout(): void {
  localStorage.removeItem(KEYS.auth);
}

// ─── Activity ─────────────────────────────────────────────────

export function logActivity(action: string, details: string): void {
  const log = readJSON<ActivityEntry[]>(KEYS.activity, []);
  log.unshift({
    id: uid(),
    action,
    details,
    timestamp: new Date().toISOString(),
  });
  writeJSON(KEYS.activity, log.slice(0, 50));
}

export function getActivity(): ActivityEntry[] {
  return readJSON<ActivityEntry[]>(KEYS.activity, []);
}

// ─── URL helpers ──────────────────────────────────────────────

export function resolveServerUrl(pattern: string, imdbId: string): string {
  return pattern.replace("{IMDB_ID}", imdbId);
}

export function makeVideoSourcesForImdb(imdbId: string): VideoSource[] {
  return getServers()
    .filter(s => s.active)
    .sort((a, b) => a.order - b.order)
    .map(s => ({
      id: uid(),
      name: s.name,
      url: resolveServerUrl(s.url_pattern, imdbId),
      active: true,
    }));
}
