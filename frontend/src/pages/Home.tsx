import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Helmet } from "react-helmet-async";
import GenreCarousel, { type MixedItem } from "@/components/GenreCarousel";
import HeroCarousel from "@/components/HeroCarousel";
import { SkeletonHero } from "@/components/SkeletonCard";
import TmdbTrailersSection from "@/components/home/TmdbTrailersSection";
import SagasSection from "@/components/home/SagasSection";
import SectionSkeleton from "@/components/home/SectionSkeleton";
import { GENRE_SECTIONS } from "@/lib/homeConfig";
import { useContinueWatching } from "@/hooks/useContinueWatching";
import { apiFetch } from "@/lib/api";
import type { Movie, Series } from "@/lib/types";
import type { TmdbTrendingItem } from "@/components/home/types";

const BASE_URL =
  (import.meta.env["VITE_API_URL"] as string | undefined) || "https://cine-gratin.onrender.com";
const SHELF_LIMIT = 24;

interface CatalogueResponse<T> {
  items: T[];
}

async function fetchCatalogueShelf<T extends Movie | Series>(
  type: "movie" | "series",
  sort: "year" | "views" | "rating" | "date_added",
  genre?: string,
): Promise<T[]> {
  const endpoint = type === "movie" ? "/api/movies/catalogue" : "/api/series/catalogue";
  const params = new URLSearchParams({ page: "1", limit: String(SHELF_LIMIT), sort, order: "desc" });
  if (genre) params.set("genre", genre);
  const { items } = await apiFetch<CatalogueResponse<T>>(`${endpoint}?${params.toString()}`);
  return items;
}

async function fetchGenreList(type: "movie" | "series"): Promise<string[]> {
  return apiFetch<string[]>(`/api/genres?type=${type}`);
}

async function fetchTmdbTrending(window: "day" | "week"): Promise<TmdbTrendingItem[]> {
  const res = await fetch(`${BASE_URL}/api/tmdb/trending?window=${window}`);
  if (!res.ok) return [];
  return res.json();
}

function useCatalogueShelf<T extends Movie | Series>(
  type: "movie" | "series",
  sort: "year" | "views" | "rating" | "date_added",
) {
  return useQuery<T[]>({
    queryKey: ["home-catalogue", type, sort],
    queryFn: () => fetchCatalogueShelf<T>(type, sort),
    staleTime: 5 * 60 * 1000,
  });
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function resolveGenre(available: string[], keywords: string[]): string | undefined {
  return available.find((genre) =>
    keywords.some((keyword) => {
      const normalizedGenre = normalize(genre);
      const normalizedKeyword = normalize(keyword);
      return normalizedGenre === normalizedKeyword || normalizedGenre.includes(normalizedKeyword);
    }),
  );
}

function mixShelves(movies: Movie[], series: Series[], sort: "year" | "views" | "rating" | "date_added") {
  const items: MixedItem[] = [
    ...movies.map((item) => ({ item, type: "movie" as const })),
    ...series.map((item) => ({ item, type: "series" as const })),
  ];
  const score = (entry: MixedItem): number => {
    if (sort === "date_added") {
      const value = entry.item.date_added ? new Date(entry.item.date_added).getTime() : 0;
      return Number.isFinite(value) ? value : 0;
    }
    return Number(entry.item[sort]) || 0;
  };
  return items.sort((a, b) => score(b) - score(a));
}

export default function Home() {
  // Fetch only the first shelf-sized page for each ranking. The previous home
  // page downloaded hundreds of full catalogue rows and sorted them in the browser.
  const movieReleases = useCatalogueShelf<Movie>("movie", "year");
  const seriesReleases = useCatalogueShelf<Series>("series", "year");
  const movieViews = useCatalogueShelf<Movie>("movie", "views");
  const seriesViews = useCatalogueShelf<Series>("series", "views");
  const movieRatings = useCatalogueShelf<Movie>("movie", "rating");
  const seriesRatings = useCatalogueShelf<Series>("series", "rating");
  const movieAdded = useCatalogueShelf<Movie>("movie", "date_added");
  const seriesAdded = useCatalogueShelf<Series>("series", "date_added");

  const { data: movieGenres = [] } = useQuery({
    queryKey: ["catalogue-genres", "movie"],
    queryFn: () => fetchGenreList("movie"),
    staleTime: 60 * 60 * 1000,
  });
  const { data: seriesGenres = [] } = useQuery({
    queryKey: ["catalogue-genres", "series"],
    queryFn: () => fetchGenreList("series"),
    staleTime: 60 * 60 * 1000,
  });
  const { data: tmdbTrending = [] } = useQuery({
    queryKey: ["tmdb-trending-week"],
    queryFn: () => fetchTmdbTrending("week"),
    staleTime: 30 * 60 * 1000,
  });

  const [activeGenre, setActiveGenre] = useState<string | null>(null);
  const { items: continueWatching } = useContinueWatching();

  const selectedGenre = GENRE_SECTIONS.find((section) => section.id === activeGenre);
  const movieGenre = selectedGenre ? resolveGenre(movieGenres, selectedGenre.keywords) : undefined;
  const seriesGenre = selectedGenre ? resolveGenre(seriesGenres, selectedGenre.keywords) : undefined;
  const genreMovies = useQuery({
    queryKey: ["home-catalogue", "movie", "genre", movieGenre],
    queryFn: () => fetchCatalogueShelf<Movie>("movie", "year", movieGenre),
    enabled: Boolean(movieGenre),
    staleTime: 5 * 60 * 1000,
  });
  const genreSeries = useQuery({
    queryKey: ["home-catalogue", "series", "genre", seriesGenre],
    queryFn: () => fetchCatalogueShelf<Series>("series", "year", seriesGenre),
    enabled: Boolean(seriesGenre),
    staleTime: 5 * 60 * 1000,
  });

  const heroItems = useMemo(
    () => [
      ...(movieReleases.data ?? []).slice(0, 3).map((item) => ({ item, type: "movie" as const })),
      ...(seriesReleases.data ?? []).slice(0, 3).map((item) => ({ item, type: "series" as const })),
    ],
    [movieReleases.data, seriesReleases.data],
  );

  const continueWatchingItems = useMemo(
    () =>
      continueWatching.map((item) => {
        const base = {
          id: item.id,
          imdb_id: item.imdbId,
          title: item.title,
          poster_url: item.poster_url,
          ...(item.type === "series" && item.season && item.episode
            ? { year: `T${item.season} E${item.episode}` }
            : {}),
        };
        return { item: base, type: item.type } as MixedItem;
      }),
    [continueWatching],
  );

  const latest = useMemo(
    () => mixShelves(movieReleases.data ?? [], seriesReleases.data ?? [], "year"),
    [movieReleases.data, seriesReleases.data],
  );
  const mostViewed = useMemo(
    () => mixShelves(movieViews.data ?? [], seriesViews.data ?? [], "views"),
    [movieViews.data, seriesViews.data],
  );
  const bestRated = useMemo(
    () => mixShelves(movieRatings.data ?? [], seriesRatings.data ?? [], "rating"),
    [movieRatings.data, seriesRatings.data],
  );
  const recentlyAdded = useMemo(
    () => mixShelves(movieAdded.data ?? [], seriesAdded.data ?? [], "date_added"),
    [movieAdded.data, seriesAdded.data],
  );

  const allMovies = useMemo(
    () => [...(movieReleases.data ?? []), ...(movieViews.data ?? []), ...(movieRatings.data ?? [])],
    [movieReleases.data, movieViews.data, movieRatings.data],
  );
  const allSeries = useMemo(
    () => [...(seriesReleases.data ?? []), ...(seriesViews.data ?? []), ...(seriesRatings.data ?? [])],
    [seriesReleases.data, seriesViews.data, seriesRatings.data],
  );
  const trending = useMemo(() => {
    const items: MixedItem[] = [];
    for (const entry of tmdbTrending) {
      if (entry.media_type === "movie") {
        const found = allMovies.find((item) => item.tmdb_id === entry.tmdb_id);
        if (found) items.push({ item: found, type: "movie" });
      } else if (entry.media_type === "tv") {
        const found = allSeries.find((item) => item.tmdb_id === entry.tmdb_id);
        if (found) items.push({ item: found, type: "series" });
      }
    }
    return items;
  }, [allMovies, allSeries, tmdbTrending]);

  const genreItems = useMemo(
    () => mixShelves(genreMovies.data ?? [], genreSeries.data ?? [], "year"),
    [genreMovies.data, genreSeries.data],
  );

  const isLoading =
    movieReleases.isLoading ||
    seriesReleases.isLoading ||
    movieViews.isLoading ||
    seriesViews.isLoading ||
    movieRatings.isLoading ||
    seriesRatings.isLoading;
  const hasShelfError =
    movieReleases.isError ||
    seriesReleases.isError ||
    movieViews.isError ||
    seriesViews.isError ||
    movieRatings.isError ||
    seriesRatings.isError;

  return (
    <div className="min-h-screen bg-brand-dark">
      <Helmet>
        <title>Cine Gratín — Estrenos, películas y series</title>
        <meta
          name="description"
          content="Descubre estrenos, películas y series mejor puntuadas, las más vistas y tus géneros favoritos en Cine Gratín."
        />
      </Helmet>

      {movieReleases.isLoading || seriesReleases.isLoading ? (
        <SkeletonHero />
      ) : heroItems.length > 0 ? (
        <HeroCarousel items={heroItems} />
      ) : null}

      <div className="mx-auto max-w-7xl pt-8 pb-16">
        {continueWatchingItems.length > 0 && (
          <GenreCarousel title="Seguir viendo" items={continueWatchingItems} />
        )}

        {isLoading ? (
          <>
            <SectionSkeleton title="Estrenos" />
            <SectionSkeleton title="Mejor puntuadas" />
            <SectionSkeleton title="Las más vistas" />
          </>
        ) : (
          <>
            {latest.length > 0 && <GenreCarousel title="Estrenos" items={latest} />}
            {bestRated.length > 0 && <GenreCarousel title="Mejor puntuadas" items={bestRated} />}
            {mostViewed.length > 0 && <GenreCarousel title="Las más vistas" items={mostViewed} />}
            {recentlyAdded.length > 0 && (
              <GenreCarousel title="Añadidas recientemente" items={recentlyAdded} />
            )}
            {trending.length > 0 && <GenreCarousel title="Tendencias" items={trending} />}
          </>
        )}
        {hasShelfError && (
          <p className="mb-8 px-4 text-sm text-red-400 sm:px-6 lg:px-8" role="status">
            Algunas categorías no pudieron cargar. Puedes seguir explorando las secciones disponibles.
          </p>
        )}

        <section className="mt-12" aria-labelledby="home-genres-title">
          <div className="mb-5 px-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-3">
              <span className="h-8 w-2 rounded-full bg-brand-red" />
              <h2 id="home-genres-title" className="text-2xl font-black text-white">
                Explorar por género
              </h2>
            </div>
          </div>
          <div className="mb-7 flex flex-wrap gap-2 px-4 sm:px-6 lg:px-8">
            {GENRE_SECTIONS.map((section) => (
              <button
                key={section.id}
                type="button"
                onClick={() => setActiveGenre((current) => (current === section.id ? null : section.id))}
                aria-pressed={activeGenre === section.id}
                className={`rounded-xl border px-4 py-2 text-sm font-semibold transition-colors ${
                  activeGenre === section.id
                    ? "border-brand-red bg-brand-red text-white"
                    : "border-brand-border bg-brand-surface text-gray-400 hover:border-gray-500 hover:text-white"
                }`}
              >
                {section.label}
              </button>
            ))}
          </div>
          {selectedGenre &&
            (genreMovies.isLoading || genreSeries.isLoading ? (
              <SectionSkeleton title={selectedGenre.label} />
            ) : genreItems.length > 0 ? (
              <GenreCarousel title={selectedGenre.label} items={genreItems} />
            ) : (
              <p className="px-4 text-sm text-gray-500 sm:px-6 lg:px-8">
                No hay títulos disponibles en esta categoría por ahora.
              </p>
            ))}
        </section>

        <TmdbTrailersSection />
        <SagasSection />
      </div>
    </div>
  );
}
