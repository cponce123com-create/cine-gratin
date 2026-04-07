import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getMovies, getSeries } from "@/lib/api";
import { useFetch } from "@/hooks/useFetch";
import Carousel from "@/components/Carousel";
import GenreCarousel, { type MixedItem } from "@/components/GenreCarousel";
import { SkeletonHero } from "@/components/SkeletonCard";
import { GENRE_SECTIONS } from "@/lib/homeConfig";
import type { Movie, Series } from "@/lib/types";

const FALLBACK_BG =
  "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=1400&auto=format&fit=crop";

// How many items to show per genre carousel
const MAX_PER_GENRE = 20;
// Minimum items needed to show a genre section
const MIN_ITEMS_TO_SHOW = 2;

function matchesKeywords(genres: string[] | undefined, keywords: string[]): boolean {
  if (!genres || genres.length === 0) return false;
  return genres.some((g) =>
    keywords.some((kw) => g.toLowerCase().includes(kw.toLowerCase()))
  );
}

function buildGenreItems(
  movies: Movie[],
  series: Series[],
  keywords: string[]
): MixedItem[] {
  const result: MixedItem[] = [];
  for (const m of movies) {
    if (matchesKeywords(m.genres, keywords)) result.push({ item: m, type: "movie" });
  }
  for (const s of series) {
    if (matchesKeywords(s.genres, keywords)) result.push({ item: s, type: "series" });
  }
  return result.slice(0, MAX_PER_GENRE);
}

export default function Home() {
  const movies = useFetch(getMovies, []);
  const series = useFetch(getSeries, []);
  const navigate = useNavigate();

  const [activeFilter, setActiveFilter] = useState<string | null>(null);

  const heroItem = useMemo(() => {
    const list = movies.data ?? [];
    return list.find((m) => m.featured) ?? list[0] ?? null;
  }, [movies.data]);

  const popularMovies = useMemo(() => (movies.data ?? []).slice(0, 20), [movies.data]);
  const popularSeries = useMemo(() => (series.data ?? []).slice(0, 20), [series.data]);

  // Build genre carousels
  const genreCarousels = useMemo(() => {
    const allMovies = movies.data ?? [];
    const allSeries = series.data ?? [];
    return GENRE_SECTIONS.map((section) => ({
      ...section,
      items: buildGenreItems(allMovies, allSeries, section.keywords),
    })).filter((s) => s.items.length >= MIN_ITEMS_TO_SHOW);
  }, [movies.data, series.data]);

  const visibleGenres = activeFilter
    ? genreCarousels.filter((s) => s.id === activeFilter)
    : genreCarousels;

  const isLoading = movies.loading || series.loading;

  return (
    <div className="min-h-screen bg-brand-dark">
      {/* ── Hero ─────────────────────────────────────────────────── */}
      {movies.loading ? (
        <SkeletonHero />
      ) : heroItem ? (
        <div className="relative w-full h-[80vh] min-h-[520px] overflow-hidden">
          <div className="absolute inset-0">
            <img
              src={heroItem.background_url || heroItem.poster_url || FALLBACK_BG}
              alt={heroItem.title}
              className="w-full h-full object-cover object-center"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).src = FALLBACK_BG;
              }}
            />
          </div>
          <div className="absolute inset-0 hero-gradient" />
          <div className="absolute inset-x-0 bottom-0 h-48 hero-gradient-bottom" />

          <div className="relative z-10 flex flex-col justify-end h-full pb-16 px-6 sm:px-10 lg:px-16 max-w-3xl">
            <h1 className="text-3xl sm:text-5xl font-black text-white leading-tight mb-3 drop-shadow-lg">
              {heroItem.title}
            </h1>

            <div className="flex flex-wrap items-center gap-3 mb-4">
              {heroItem.rating !== undefined && (
                <span className="flex items-center gap-1 text-brand-gold font-semibold text-sm">
                  <span>&#9733;</span>
                  <span>{Number(heroItem.rating).toFixed(1)}</span>
                </span>
              )}
              {heroItem.year && (
                <span className="text-gray-300 text-sm">{heroItem.year}</span>
              )}
              {heroItem.duration_min && (
                <span className="text-gray-300 text-sm">{heroItem.duration_min} min</span>
              )}
              {heroItem.genres && heroItem.genres.length > 0 && (
                <div className="flex gap-1.5">
                  {heroItem.genres.slice(0, 3).map((g) => (
                    <span
                      key={g}
                      className="text-xs bg-white/10 border border-white/20 rounded px-2 py-0.5 text-gray-300"
                    >
                      {g}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {heroItem.synopsis && (
              <p className="text-gray-300 text-sm sm:text-base leading-relaxed line-clamp-3 mb-6 max-w-xl">
                {heroItem.synopsis}
              </p>
            )}

            <div className="flex flex-wrap gap-3">
              {heroItem.imdb_id ? (
                <button
                  onClick={() =>
                    navigate(
                      `/player/movie/${heroItem.imdb_id}?title=${encodeURIComponent(heroItem.title)}`
                    )
                  }
                  className="flex items-center gap-2 bg-brand-red hover:bg-red-700 text-white font-bold py-3 px-6 rounded transition-colors"
                >
                  <PlayIcon />
                  Reproducir
                </button>
              ) : heroItem.video_sources && heroItem.video_sources.length > 0 ? (
                <button
                  onClick={() =>
                    navigate(
                      `/player?url=${encodeURIComponent(heroItem.video_sources![0].url)}&title=${encodeURIComponent(heroItem.title)}&label=${encodeURIComponent(heroItem.video_sources![0].label)}`
                    )
                  }
                  className="flex items-center gap-2 bg-brand-red hover:bg-red-700 text-white font-bold py-3 px-6 rounded transition-colors"
                >
                  <PlayIcon />
                  Reproducir
                </button>
              ) : null}
              <Link
                to={`/pelicula/${heroItem.id}`}
                className="flex items-center gap-2 bg-white/10 hover:bg-white/20 border border-white/30 text-white font-bold py-3 px-6 rounded transition-colors backdrop-blur-sm"
              >
                <InfoIcon />
                Mas info
              </Link>
            </div>
          </div>
        </div>
      ) : null}

      {/* ── Main content ─────────────────────────────────────────── */}
      <div className="pt-8 pb-16">
        {/* Popular carousels */}
        {movies.error ? (
          <p className="text-red-400 text-center py-8">No se pudo cargar las peliculas.</p>
        ) : (
          <Carousel title="Peliculas populares" items={popularMovies} type="movie" />
        )}

        {series.error ? (
          <p className="text-red-400 text-center py-8">No se pudo cargar las series.</p>
        ) : (
          <Carousel title="Series populares" items={popularSeries} type="series" />
        )}

        {movies.data && movies.data.length > 20 && (
          <Carousel title="Mas peliculas" items={movies.data.slice(20, 40)} type="movie" />
        )}

        {/* ── Genre divider ────────────────────────────────────────── */}
        {!isLoading && genreCarousels.length > 0 && (
          <>
            <div className="px-4 sm:px-6 lg:px-8 mb-6 mt-4">
              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-brand-border" />
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-widest">
                  Por género
                </span>
                <div className="h-px flex-1 bg-brand-border" />
              </div>
            </div>

            {/* ── Genre chip filter bar ──────────────────────────────── */}
            <div className="px-4 sm:px-6 lg:px-8 mb-6">
              <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                <button
                  onClick={() => setActiveFilter(null)}
                  className={`flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full border transition-all ${
                    activeFilter === null
                      ? "bg-brand-red border-red-700 text-white"
                      : "bg-brand-surface border-brand-border text-gray-400 hover:text-white hover:border-gray-500"
                  }`}
                >
                  Todos
                </button>
                {genreCarousels.map((section) => (
                  <button
                    key={section.id}
                    onClick={() =>
                      setActiveFilter(activeFilter === section.id ? null : section.id)
                    }
                    className={`flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full border transition-all ${
                      activeFilter === section.id
                        ? "bg-brand-red border-red-700 text-white"
                        : "bg-brand-surface border-brand-border text-gray-400 hover:text-white hover:border-gray-500"
                    }`}
                  >
                    {section.label}
                  </button>
                ))}
              </div>
            </div>

            {/* ── Genre carousels ────────────────────────────────────── */}
            {visibleGenres.map((section) => (
              <GenreCarousel
                key={section.id}
                id={section.id}
                title={section.label}
                items={section.items}
              />
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function PlayIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z" />
    </svg>
  );
}
