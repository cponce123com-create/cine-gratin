// ── Admin types ──────────────────────────────────────────────────────────────

export interface AutoImportLog {
  id: string | number;
  run_at: string;
  status: "success" | "error";
  movies_imported: number;
  series_imported: number;
  total_checked: number;
  error_message?: string;
}

export interface AutoImportStatus {
  enabled: boolean;
  logs: AutoImportLog[];
}

export interface RunImportResult {
  movies_imported: number;
  series_imported: number;
  total_checked: number;
  status?: string;
}

export interface VidsrcResult {
  imdb_id: string;
  available: boolean;
}

// ── Media types ───────────────────────────────────────────────────────────────

export interface VideoSource {
  label: string;
  url: string;
  type?: string;
}

/** One season entry from TMDB — stores episode COUNT, not episode objects */
export interface SeasonData {
  season: number;
  episodes: number;
  name: string;
  poster?: string | null;
  air_date?: string | null;
}

export interface Movie {
  id: string | number;
  imdb_id?: string;
  title: string;
  synopsis?: string;
  year?: number;
  genres?: string[];
  rating?: number;
  /** Runtime in minutes (from TMDB) */
  runtime?: number;
  /** Legacy field — may not be populated */
  duration_min?: number;
  director?: string;
  cast_list?: string[];
  language?: string;
  mpa_rating?: string;
  poster_url?: string;
  background_url?: string;
  /** YouTube video key (e.g. "dQw4w9WgXcQ") — use with youtube.com/embed/{key} */
  yt_trailer_code?: string;
  /** Legacy full URL — may not be populated */
  trailer_url?: string;
  video_sources?: VideoSource[];
  featured?: boolean;
  views?: number;
  date_added?: string;
}

export interface Series {
  id: string | number;
  imdb_id?: string;
  tmdb_id?: number | null;
  title: string;
  synopsis?: string;
  year?: number;
  end_year?: number | null;
  genres?: string[];
  rating?: number;
  creators?: string[];
  cast_list?: string[];
  language?: string;
  poster_url?: string;
  background_url?: string;
  /** YouTube video key (e.g. "dQw4w9WgXcQ") */
  yt_trailer_code?: string;
  status?: string;
  total_seasons?: number;
  /** Season metadata from TMDB: season number + episode count */
  seasons_data?: SeasonData[];
  video_sources?: VideoSource[];
  featured?: boolean;
  views?: number;
  date_added?: string;
}

// Legacy types kept for compatibility
export interface Episode {
  number: number;
  title?: string;
  duration_min?: number;
  video_sources?: VideoSource[];
}

export interface Season {
  number: number;
  episodes?: Episode[];
}
