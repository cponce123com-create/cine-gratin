import { useState, useEffect } from "react";

// === Types ===

export interface Torrent {
  url: string;
  hash: string;
  quality: string;
  type: string;
  seeds: number;
  peers: number;
  size: string;
  size_bytes: number;
  date_uploaded: string;
  date_uploaded_unix: number;
  video_codec?: string;
  bit_depth?: string;
  audio_channels?: string;
  fps?: number;
}

export interface Cast {
  name: string;
  character_name: string;
  url_small_image?: string;
  imdb_code: string;
}

export interface Movie {
  id: number;
  url: string;
  imdb_code: string;
  title: string;
  title_english: string;
  title_long: string;
  slug: string;
  year: number;
  rating: number;
  runtime: number;
  genres: string[];
  summary: string;
  description_full: string;
  synopsis: string;
  yt_trailer_code: string;
  language: string;
  mpa_rating: string;
  background_image: string;
  background_image_original: string;
  small_cover_image: string;
  medium_cover_image: string;
  large_cover_image: string;
  state: string;
  torrents: Torrent[];
  date_uploaded: string;
  date_uploaded_unix: number;
  cast?: Cast[];
}

export interface YTSResponse<T> {
  status: string;
  status_message: string;
  data: T;
}

export interface MovieListResponse {
  movie_count: number;
  limit: number;
  page_number: number;
  movies: Movie[];
}

export interface MovieDetailResponse {
  movie: Movie;
}

export interface FavoriteMovie {
  id: number;
  slug: string;
  title: string;
  year: number;
  rating: number;
  medium_cover_image: string;
  quality?: string;
  genres?: string[];
}

export interface RecentlyWatchedMovie {
  id: number;
  slug: string;
  title: string;
  year: number;
  rating: number;
  medium_cover_image: string;
  timestamp?: number;
  quality?: string;
  genres?: string[];
}

// === Utilities ===

export function getBestQuality(torrents?: Torrent[]): string | null {
  if (!torrents || torrents.length === 0) return null;
  if (torrents.some(t => t.quality.includes("2160"))) return "4K";
  if (torrents.some(t => t.quality.includes("1080") || t.quality.includes("720"))) return "HD";
  return null;
}

export function getMagnetUrl(torrent: Torrent, title: string): string {
  const trackers = [
    "udp%3A%2F%2Ftracker.opentrackr.org%3A1337%2Fannounce",
    "udp%3A%2F%2Fopen.stealth.si%3A80%2Fannounce",
    "udp%3A%2F%2Ftracker.openbittorrent.com%3A6969%2Fannounce",
    "udp%3A%2F%2Ftracker.leechers-paradise.org%3A6969%2Fannounce",
  ];
  const dn = encodeURIComponent(title);
  return `magnet:?xt=urn:btih:${torrent.hash}&dn=${dn}&${trackers.map(t => `tr=${t}`).join("&")}`;
}

// === sessionStorage Cache (10-minute TTL) ===

const CACHE_TTL_MS = 10 * 60 * 1000;

function getCached<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { data: T; ts: number };
    if (Date.now() - parsed.ts > CACHE_TTL_MS) {
      sessionStorage.removeItem(key);
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
}

function setCache<T>(key: string, data: T): void {
  try {
    sessionStorage.setItem(key, JSON.stringify({ data, ts: Date.now() }));
  } catch {
    // sessionStorage may be full — fail silently
  }
}

// === API Hooks ===

const BASE_URL = "https://yts.mx/api/v2";

export function useMovieList(params: Record<string, unknown> = {}) {
  const [data, setData] = useState<MovieListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const fetchMovies = async () => {
      setLoading(true);
      setError(null);

      const queryParams = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== "") {
          queryParams.append(key, String(value));
        }
      });

      const cacheKey = `yts_list_${queryParams.toString()}`;
      const cached = getCached<MovieListResponse>(cacheKey);
      if (cached) {
        setData(cached);
        setLoading(false);
        return;
      }

      try {
        const res = await fetch(`${BASE_URL}/list_movies.json?${queryParams.toString()}`);
        if (!res.ok) throw new Error("Failed to fetch movies");
        const json: YTSResponse<MovieListResponse> = await res.json();
        setCache(cacheKey, json.data);
        setData(json.data);
      } catch (err) {
        setError(err instanceof Error ? err : new Error("Unknown error"));
      } finally {
        setLoading(false);
      }
    };

    fetchMovies();
  }, [JSON.stringify(params)]);

  return { data, loading, error };
}

export function useMovieDetails(id?: string | number) {
  const [data, setData] = useState<MovieDetailResponse | null>(null);
  const [loading, setLoading] = useState(!!id);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!id) return;

    const fetchMovie = async () => {
      setLoading(true);
      setError(null);

      const cacheKey = `yts_detail_${id}`;
      const cached = getCached<MovieDetailResponse>(cacheKey);
      if (cached) {
        setData(cached);
        setLoading(false);
        return;
      }

      try {
        const res = await fetch(`${BASE_URL}/movie_details.json?movie_id=${id}&with_cast=true`);
        if (!res.ok) throw new Error("Failed to fetch movie details");
        const json: YTSResponse<MovieDetailResponse> = await res.json();
        setCache(cacheKey, json.data);
        setData(json.data);
      } catch (err) {
        setError(err instanceof Error ? err : new Error("Unknown error"));
      } finally {
        setLoading(false);
      }
    };

    fetchMovie();
  }, [id]);

  return { data, loading, error };
}

export function useMovieSuggestions(id?: string | number) {
  const [data, setData] = useState<{ movies: Movie[] } | null>(null);
  const [loading, setLoading] = useState(!!id);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!id) return;

    const fetchSuggestions = async () => {
      setLoading(true);
      setError(null);

      const cacheKey = `yts_suggestions_${id}`;
      const cached = getCached<{ movies: Movie[] }>(cacheKey);
      if (cached) {
        setData(cached);
        setLoading(false);
        return;
      }

      try {
        const res = await fetch(`${BASE_URL}/movie_suggestions.json?movie_id=${id}`);
        if (!res.ok) throw new Error("Failed to fetch suggestions");
        const json: YTSResponse<{ movies: Movie[] }> = await res.json();
        setCache(cacheKey, json.data);
        setData(json.data);
      } catch (err) {
        setError(err instanceof Error ? err : new Error("Unknown error"));
      } finally {
        setLoading(false);
      }
    };

    fetchSuggestions();
  }, [id]);

  return { data, loading, error };
}
