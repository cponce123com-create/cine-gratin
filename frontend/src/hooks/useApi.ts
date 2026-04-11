import { useQuery } from "@tanstack/react-query";
import { getMovies, getSeries } from "@/lib/api";

export function useMovies(params?: { page?: number; limit?: number }) {
  return useQuery({
    queryKey: ["movies", params],
    queryFn: () => getMovies(params),
    staleTime: 5 * 60 * 1000, // cache 5 min
  });
}

export function useSeries(params?: { page?: number; limit?: number }) {
  return useQuery({
    queryKey: ["series", params],
    queryFn: () => getSeries(params),
    staleTime: 5 * 60 * 1000, // cache 5 min
  });
}
