import { useState, useEffect } from "react";

const TVMAZE_BASE = "https://api.tvmaze.com";

export interface TvShow {
  id: number;
  name: string;
  summary: string | null;
  image: { medium: string; original: string } | null;
  rating: { average: number | null };
  genres: string[];
  status: string;
  network: { name: string } | null;
  externals: { imdb: string | null; thetvdb: number | null };
  premiered: string | null;
  ended: string | null;
  type: string;
  language: string | null;
}

export interface TvSearchResult {
  score: number;
  show: TvShow;
}

export interface TvSeason {
  id: number;
  number: number;
  episodeOrder: number | null;
  premiereDate: string | null;
  endDate: string | null;
}

export function useTvSearch(query: string) {
  const [results, setResults] = useState<TvSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    let cancelled = false;

    const fetchResults = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${TVMAZE_BASE}/search/shows?q=${encodeURIComponent(query)}`);
        if (!res.ok) throw new Error("Failed to search TV shows");
        const data: TvSearchResult[] = await res.json();
        if (!cancelled) setResults(data.slice(0, 10));
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err : new Error("Unknown error"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchResults();

    return () => {
      cancelled = true;
    };
  }, [query]);

  return { results, loading, error };
}

export function useTvSeasons(showId: number | null) {
  const [seasons, setSeasons] = useState<TvSeason[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!showId) {
      setSeasons([]);
      return;
    }

    const fetch_ = async () => {
      setLoading(true);
      try {
        const res = await fetch(`${TVMAZE_BASE}/shows/${showId}/seasons`);
        const data: TvSeason[] = await res.json();
        setSeasons(data.filter(s => s.number > 0));
      } catch {
        setSeasons([]);
      } finally {
        setLoading(false);
      }
    };

    fetch_();
  }, [showId]);

  return { seasons, loading };
}
