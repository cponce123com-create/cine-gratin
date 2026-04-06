const BASE_URL = "https://cine-gratin.onrender.com";

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`);
  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${path}`);
  }
  return res.json() as Promise<T>;
}

import type { Movie, Series } from "./types";

export const getMovies = (): Promise<Movie[]> => apiFetch("/api/movies");
export const getMovie = (id: string): Promise<Movie> => apiFetch(`/api/movies/${id}`);
export const getSeries = (): Promise<Series[]> => apiFetch("/api/series");
export const getSeriesById = (id: string): Promise<Series> => apiFetch(`/api/series/${id}`);
