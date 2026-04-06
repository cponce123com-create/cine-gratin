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

export interface Movie {
  id: string | number;
  title: string;
  synopsis?: string;
  year?: number;
  genres?: string[];
  rating?: number;
  duration_min?: number;
  poster_url?: string;
  background_url?: string;
  trailer_url?: string;
  video_sources?: VideoSource[];
  featured?: boolean;
}

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

export interface Series {
  id: string | number;
  title: string;
  synopsis?: string;
  year?: number;
  genres?: string[];
  rating?: number;
  poster_url?: string;
  background_url?: string;
  seasons?: Season[];
  featured?: boolean;
}
