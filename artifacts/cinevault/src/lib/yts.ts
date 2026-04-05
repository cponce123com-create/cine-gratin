import { useState, useEffect } from "react";

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
}

export interface Cast {
  name: string;
  character_name: string;
  url_small_image?: string;
  imdb_code: string;
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

const BASE_URL = "https://yts.mx/api/v2";

export function useMovieList(params: Record<string, any> = {}) {
  const [data, setData] = useState<MovieListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const fetchMovies = async () => {
      setLoading(true);
      setError(null);
      try {
        const queryParams = new URLSearchParams();
        Object.entries(params).forEach(([key, value]) => {
          if (value !== undefined && value !== null && value !== "") {
            queryParams.append(key, String(value));
          }
        });

        const res = await fetch(`${BASE_URL}/list_movies.json?${queryParams.toString()}`);
        if (!res.ok) throw new Error("Failed to fetch movies");
        
        const json: YTSResponse<MovieListResponse> = await res.json();
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
      try {
        const res = await fetch(`${BASE_URL}/movie_details.json?movie_id=${id}&with_cast=true`);
        if (!res.ok) throw new Error("Failed to fetch movie details");
        
        const json: YTSResponse<MovieDetailResponse> = await res.json();
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
      try {
        const res = await fetch(`${BASE_URL}/movie_suggestions.json?movie_id=${id}`);
        if (!res.ok) throw new Error("Failed to fetch suggestions");
        
        const json: YTSResponse<{ movies: Movie[] }> = await res.json();
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
