import { useState, useEffect } from 'react';
import type { Movie, Series } from '@/lib/types';

const API_BASE_URL = 'https://cine-gratin.onrender.com';

export function useFetch<T>(url: string) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const response = await fetch(`${API_BASE_URL}${url}`);
        if (!response.ok) {
          throw new Error('Network response was not ok');
        }
        const result = await response.json();
        setData(result);
      } catch (error) {
        setError(error as Error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [url]);

  return { data, loading, error };
}

export function useMovies() {
  return useFetch<Movie[]>('/api/movies');
}

export function useMovie(id: string) {
  return useFetch<Movie>(`/api/movies/${id}`);
}

export function useSeriesList() {
  return useFetch<Series[]>('/api/series');
}

export function useSeries(id: string) {
  return useFetch<Series>(`/api/series/${id}`);
}
