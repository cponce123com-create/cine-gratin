import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import type { Movie, Series } from "@/lib/types";

/** Maximum number of items the API returns in a single page. */
export const PAGE_LIMIT = 100;

export function useFeaturedMovies() {
  return useQuery<Movie[]>({
    queryKey: ["movies", "featured"],
    queryFn: () => apiFetch<Movie[]>("/api/movies/featured"),
    staleTime: 5 * 60 * 1000,
  });
}

export function useMovies(page?: number, limit?: number) {
  const p = Number(page) || 1;
  const l = Math.min(Number(limit) || 20, PAGE_LIMIT);
  return useQuery<Movie[]>({
    queryKey: ["movies", p, l],
    queryFn: () => apiFetch<Movie[]>(`/api/movies?page=${p}&limit=${l}`),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Loads a larger slice of the catalogue by concatenating pages.
 *
 * The API caps every request at 100 items, so the requests that need more
 * (the home carousels, the "similar content" section) ask for several pages
 * in parallel and join them. The browser never asks for an unbounded page.
 */
export function useMoviesBatch(total = 500) {
  const pages = Math.max(1, Math.min(Math.ceil(total / PAGE_LIMIT), 10));
  return useQuery<Movie[]>({
    queryKey: ["movies", "batch", pages],
    queryFn: async () => {
      const results = await Promise.all(
        Array.from({ length: pages }, (_, index) =>
          apiFetch<Movie[]>(`/api/movies?page=${index + 1}&limit=${PAGE_LIMIT}`),
        ),
      );
      return results.flat();
    },
    staleTime: 5 * 60 * 1000,
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

export function useSeriesList(page?: number, limit?: number) {
  const p = Number(page) || 1;
  const l = Math.min(Number(limit) || 20, PAGE_LIMIT);
  return useQuery<Series[]>({
    queryKey: ["series", p, l],
    queryFn: () => apiFetch<Series[]>(`/api/series?page=${p}&limit=${l}`),
    staleTime: 5 * 60 * 1000,
  });
}

/** Loads a larger slice of the series catalogue (see `useMoviesBatch`). */
export function useSeriesBatch(total = 200) {
  const pages = Math.max(1, Math.min(Math.ceil(total / PAGE_LIMIT), 10));
  return useQuery<Series[]>({
    queryKey: ["series", "batch", pages],
    queryFn: async () => {
      const results = await Promise.all(
        Array.from({ length: pages }, (_, index) =>
          apiFetch<Series[]>(`/api/series?page=${index + 1}&limit=${PAGE_LIMIT}`),
        ),
      );
      return results.flat();
    },
    staleTime: 5 * 60 * 1000,
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
