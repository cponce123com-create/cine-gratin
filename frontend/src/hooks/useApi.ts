import { useQuery } from "@tanstack/react-query";
import type { Movie, Series } from "@/lib/types";

const API_BASE_URL = "https://cine-gratin.onrender.com";

async function apiFetch<T>(url: string): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${url}`);
  if (!res.ok) throw new Error(`API error ${res.status}: ${url}`);
  return res.json();
}

export function useFeaturedMovies() {
  return useQuery<Movie[]>({
    queryKey: ["movies", "featured"],
    queryFn: () => apiFetch("/api/movies/featured"),
    staleTime: 5 * 60 * 1000,
  });
}

export function useMovies(page?: number, limit?: number) {
  const p = Number(page) || 1;
  const l = Number(limit) || 20;
  return useQuery<Movie[]>({
    queryKey: ["movies", p, l],
    queryFn: () => apiFetch(`/api/movies?page=${p}&limit=${l}`),
    staleTime: 5 * 60 * 1000,
  });
}

export function useMovie(id: string) {
  return useQuery<Movie>({
    queryKey: ["movie", id],
    queryFn: () => apiFetch(`/api/movies/${id}`),
    staleTime: 10 * 60 * 1000,
    enabled: Boolean(id),
  });
}

export function useSeriesList(page?: number, limit?: number) {
  const p = Number(page) || 1;
  const l = Number(limit) || 20;
  return useQuery<Series[]>({
    queryKey: ["series", p, l],
    queryFn: () => apiFetch(`/api/series?page=${p}&limit=${l}`),
    staleTime: 5 * 60 * 1000,
  });
}

export function useSeries(id: string) {
  return useQuery<Series>({
    queryKey: ["series", id],
    queryFn: () => apiFetch(`/api/series/${id}`),
    staleTime: 10 * 60 * 1000,
    enabled: Boolean(id),
  });
}

export interface Saga {
  collection_id: number;
  collection_name: string;
  item_count: number;
  cover_url: string;
}

export function useSagas() {
  return useQuery<Saga[]>({
    queryKey: ["sagas"],
    queryFn: () => apiFetch("/api/sagas"),
    staleTime: 10 * 60 * 1000,
  });
}
