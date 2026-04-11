import { useQuery } from "@tanstack/react-query";
import type { Movie, Series } from "@/lib/types";

const API_BASE_URL = "https://cine-gratin.onrender.com";

async function apiFetch<T>(url: string): Promise<T> {
  try {
    const res = await fetch(`${API_BASE_URL}${url}`);
    if (!res.ok) throw new Error(`API error ${res.status}: ${url}`);
    return await res.json();
  } catch (error) {
    console.error("Fetch error:", error);
    // Devolver un array vacío si el tipo esperado es un array, o relanzar el error
    // Para cumplir con la instrucción de "no lanzar error en fallo, sino devolver array vacío"
    // pero manteniendo la compatibilidad con tipos genéricos.
    return [] as unknown as T;
  }
}

export function useFeaturedMovies() {
  return useQuery<Movie[]>({
    queryKey: ["movies", "featured"],
    queryFn: () => apiFetch<Movie[]>("/api/movies/featured"),
    staleTime: 5 * 60 * 1000,
    retry: 3,
    retryDelay: 2000,
  });
}

export function useMovies(page = 1, limit = 20) {
  return useQuery<Movie[]>({
    queryKey: ["movies", page, limit],
    queryFn: () => apiFetch<Movie[]>(`/api/movies?page=${page}&limit=${limit}`),
    staleTime: 5 * 60 * 1000,
    retry: 3,
    retryDelay: 2000,
  });
}

export function useMovie(id: string) {
  return useQuery<Movie>({
    queryKey: ["movie", id],
    queryFn: () => apiFetch<Movie>(`/api/movies/${id}`),
    staleTime: 10 * 60 * 1000,
    enabled: Boolean(id),
  });
}

export function useSeriesList(page = 1, limit = 20) {
  return useQuery<Series[]>({
    queryKey: ["series", page, limit],
    queryFn: () => apiFetch<Series[]>(`/api/series?page=${page}&limit=${limit}`),
    staleTime: 5 * 60 * 1000,
    retry: 3,
    retryDelay: 2000,
  });
}

export function useSeries(id: string) {
  return useQuery<Series>({
    queryKey: ["series", id],
    queryFn: () => apiFetch<Series>(`/api/series/${id}`),
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
    queryFn: () => apiFetch<Saga[]>("/api/sagas"),
    staleTime: 10 * 60 * 1000,
  });
}
