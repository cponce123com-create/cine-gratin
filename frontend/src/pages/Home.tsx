import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Helmet } from "react-helmet-async";
import { getMovies, getSeries } from "@/lib/api";
import Carousel from "@/components/Carousel";
import GenreCarousel, { type MixedItem } from "@/components/GenreCarousel";
import { SkeletonHero } from "@/components/SkeletonCard";
import { GENRE_SECTIONS, PLATFORM_SECTIONS } from "@/lib/homeConfig";
import type { Movie, Series } from "@/lib/types";
import { useContinueWatching } from "@/hooks/useContinueWatching";

const FALLBACK_BG =
  "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=1400&auto=format&fit=crop";

const MAX_PER_SECTION = 20;
const MIN_ITEMS_TO_SHOW = 2;

function matchesKeywords(genres: string[] | undefined, keywords: string[]): boolean {
  if (!genres || genres.length === 0) return false;
  return genres.some((g) =>
    keywords.some((kw) => g.toLowerCase().includes(kw.toLowerCase()))
  );
}

function matchesNetworks(itemNetworks: string[] | undefined, targets: string[]): boolean {
  if (!itemNetworks || itemNetworks.length === 0) return false;
  return itemNetworks.some((n) =>
    targets.some((t) => n.toLowerCase().includes(t.toLowerCase()))
  );
}

function buildMixed(
  movies: Movie[],
  series: Series[],
  filterFn: (m: Movie) => boolean,
  filterSeries: (s: Series) => boolean
): MixedItem[] {
  const result: MixedItem[] = [];
  for (const m of movies) if (filterFn(m)) result.push({ item: m, type: "movie" });
  for (const s of series) if (filterSeries(s)) result.push({ item: s, type: "series" });
  return result.slice(0, MAX_PER_SECTION);
}

type FilterMode = "genre" | "platform" | null;

export default function Home() {
  const { data: movieData, isLoading: loadingMovies, error: errorMovies } = useQuery({
    queryKey: ["movies"],
    queryFn: getMovies,
    staleTime: 5 * 60 * 1000,
  });
  const { data: seriesData, isLoading: loadingSeries, error: errorSeries } = useQuery({
    queryKey: ["series"],
    queryFn: getSeries,
    staleTime: 5 * 60 * 1000,
  });

  const navigate = useNavigate();
  const [activeGenre, setActiveGenre] = useState<string | null>(null);
  const [activePlatform, setActivePlatform] = useState<string | null>(null);
  const [filterMode, setFilterMode] = useState<FilterMode>(null);

  const allMovies = movieData ?? [];
  const allSeries = seriesData ?? [];

  const heroItem = useMemo(() => {
    return allMovies.find((m) => m.featured) ?? allMovies[0] ?? null;
  }, [allMovies]);

  const { items: continueWatching } = useContinueWatching();

  const continueWatchingItems = useMemo(() => {
    return continueWatching.map((item) => {
      // Create a partial Movie/Series object that MediaCard can handle
      const base = {
        id: item.id,
        imdb_id: item.imdbId,
        title: item.title,
        poster_url: item.poster_url,
        // Add extra info for the label if it's a series
        ...(item.type === "series" && item.season && item.episode
          ? { year: `T${item.season} E${item.episode}` as any }
          : {}),
      };
      return { item: base, type: item.type } as MixedItem;
    });
  }, [continueWatching]);

  const mostViewed = useMemo(() => {
    const mixed = buildMixed(allMovies, allSeries, () => true, () => true);
    return mixed.sort((a, b) => (b.item.views || 0) - (a.item.views || 0)).slice(0, 20);
  }, [allMovies, allSeries]);

  const recentlyAdded = useMemo(() => {
    const mixed = buildMixed(allMovies, allSeries, () => true, () => true);
    return mixed.sort((a, b) => {
      const dateA = a.item.date_added ? new Date(a.item.date_added).getTime() : 0;
      const dateB = b.item.date_added ? new Date(b.item.date_added).getTime() : 0;
      return dateB - dateA;
    }).slice(0, 20);
  }, [allMovies, allSeries]);

  const trending = useMemo(() => {
    // For trends, we can use a mix of views and recency, or just a subset of most viewed
    // Here we'll take items with high views but also relatively recent
    const mixed = buildMixed(allMovies, allSeries, () => true, () => true);
    return mixed
      .sort((a, b) => (b.item.views || 0) - (a.item.views || 0))
      .slice(0, 40)
      .sort(() => Math.random() - 0.5) // Shuffle a bit to make it feel "dynamic"
      .slice(0, 20);
  }, [allMovies, allSeries]);

  const popularMovies = useMemo(() => allMovies.slice(0, 20), [allMovies]);
  const popularSeries = useMemo(() => allSeries.slice(0, 20), [allSeries]);

  const genreCarousels = useMemo(
    () =>
      GENRE_SECTIONS.map((sec) => ({
        ...sec,
        items: buildMixed(
          allMovies, allSeries,
          (m) => matchesKeywords(m.genres, sec.keywords),
          (s) => matchesKeywords(s.genres, sec.keywords)
        ),
      })).filter((s) => s.items.length >= MIN_ITEMS_TO_SHOW),
    [allMovies, allSeries]
  );

  const platformCarousels = useMemo(
    () =>
      PLATFORM_SECTIONS.map((sec) => ({
        ...sec,
        items: buildMixed(
          allMovies, allSeries,
          (m) => matchesNetworks(m.networks, sec.networks),
          (s) => matchesNetworks(s.networks, sec.networks)
        ),
      })).filter((s) => s.items.length >= MIN_ITEMS_TO_SHOW),
    [allMovies, allSeries]
  );

  const isLoading = loadingMovies || loadingSeries;

  const visibleGenres = filterMode === "genre" && activeGenre
    ? genreCarousels.filter((s) => s.id === activeGenre)
    : genreCarousels;

  const visiblePlatforms = filterMode === "platform" && activePlatform
    ? platformCarousels.filter((s) => s.id === activePlatform)
    : platformCarousels;

  const selectGenre = (id: string) => {
    if (filterMode === "genre" && activeGenre === id) {
      setFilterMode(null); setActiveGenre(null);
    } else {
      setFilterMode("genre"); setActiveGenre(id); setActivePlatform(null);
    }
  };

  const selectPlatform = (id: string) => {
    if (filterMode === "platform" && activePlatform === id) {
      setFilterMode(null); setActivePlatform(null);
    } else {
      setFilterMode("platform"); setActivePlatform(id); setActiveGenre(null);
    }
  };

  const clearFilter = () => { setFilterMode(null); setActiveGenre(null); setActivePlatform(null); };

  return (
    <div className="min-h-screen bg-brand-dark">
      <Helmet>
        <title>Cine Gratín — Tu plataforma de streaming</title>
        <meta name="description" content="Disfruta las mejores películas y series en Cine Gratín. Streaming gratuito, sin registro." />
      </Helmet>

      {/* ── Hero ─────────────────────────────────────────────────── */}
      {loadingMovies ? (
        <SkeletonHero />
      ) : heroItem ? (
        <div className="relative w-full h-[80vh] min-h-[520px] overflow-hidden">
          <div className="absolute inset-0">
            <img
              src={heroItem.background_url || heroItem.poster_url || FALLBACK_BG}
              alt={heroItem.title}
              className="w-full h-full object-cover object-center"
              onError={(e) => { (e.currentTarget as HTMLImageElement).src = FALLBACK_BG; }}
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
                  &#9733; {Number(heroItem.rating).toFixed(1)}
                </span>
              )}
              {heroItem.year && <span className="text-gray-300 text-sm">{heroItem.year}</span>}
              {heroItem.duration_min && <span className="text-gray-300 text-sm">{heroItem.duration_min} min</span>}
              {heroItem.genres && heroItem.genres.length > 0 && (
                <div className="flex gap-1.5">
                  {heroItem.genres.slice(0, 3).map((g) => (
                    <span key={g} className="text-xs bg-white/10 border border-white/20 rounded px-2 py-0.5 text-gray-300">
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
                  onClick={() => navigate(`/player/movie/${heroItem.imdb_id}?title=${encodeURIComponent(heroItem.title)}`)}
                  className="flex items-center gap-2 bg-brand-red hover:bg-red-700 text-white font-bold py-3 px-6 rounded transition-colors"
                >
                  <PlayIcon /> Reproducir
                </button>
              ) : heroItem.video_sources && heroItem.video_sources.length > 0 ? (
                <button
                  onClick={() => navigate(`/player?url=${encodeURIComponent(heroItem.video_sources![0].url)}&title=${encodeURIComponent(heroItem.title)}&label=${encodeURIComponent(heroItem.video_sources![0].label)}`)}
                  className="flex items-center gap-2 bg-brand-red hover:bg-red-700 text-white font-bold py-3 px-6 rounded transition-colors"
                >
                  <PlayIcon /> Reproducir
                </button>
              ) : null}
              <Link
                to={`/pelicula/${heroItem.id}`}
                className="flex items-center gap-2 bg-white/10 hover:bg-white/20 border border-white/30 text-white font-bold py-3 px-6 rounded transition-colors backdrop-blur-sm"
              >
                <InfoIcon /> Más info
              </Link>
            </div>
          </div>
        </div>
      ) : null}

      {/* ── Main content ──────────────────────────────────────────── */}
      <div className="pt-8 pb-16">
        {continueWatchingItems.length > 0 && (
          <GenreCarousel title="Seguir viendo" items={continueWatchingItems} />
        )}

        {mostViewed.length > 0 && (
          <GenreCarousel title="Las más vistas" items={mostViewed} />
        )}

        {trending.length > 0 && (
          <GenreCarousel title="Tendencias" items={trending} />
        )}

        {recentlyAdded.length > 0 && (
          <GenreCarousel title="Añadidas recientemente" items={recentlyAdded} />
        )}

        {errorMovies ? (
          <p className="text-red-400 text-center py-8">No se pudieron cargar las películas.</p>
        ) : (
          <Carousel title="Películas populares" items={popularMovies} type="movie" />
        )}
        {errorSeries ? (
          <p className="text-red-400 text-center py-8">No se pudieron cargar las series.</p>
        ) : (
          <Carousel title="Series populares" items={popularSeries} type="series" />
        )}

        {/* ── Genre & Platform sections ─────────────────────────────── */}
        {!isLoading && (genreCarousels.length > 0 || platformCarousels.length > 0) && (
          <>
            <div className="px-4 sm:px-6 lg:px-8 mb-5 mt-2">
              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-brand-border" />
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-widest">
                  Explorar por categoría
                </span>
                <div className="h-px flex-1 bg-brand-border" />
              </div>
            </div>

            <div className="px-4 sm:px-6 lg:px-8 mb-6 space-y-3">
              {genreCarousels.length > 0 && (
                <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
                  <span className="flex-shrink-0 text-[11px] font-semibold text-gray-500 uppercase tracking-wider self-center pr-1">
                    Géneros
                  </span>
                  {genreCarousels.map((sec) => (
                    <button
                      key={sec.id}
                      onClick={() => selectGenre(sec.id)}
                      className={`flex-shrink-0 text-xs font-semibold px-3 py-1 rounded-full border transition-all ${
                        filterMode === "genre" && activeGenre === sec.id
                          ? "bg-brand-red border-red-700 text-white"
                          : "bg-brand-surface border-brand-border text-gray-400 hover:text-white hover:border-gray-500"
                      }`}
                    >
                      {sec.label}
                    </button>
                  ))}
                  {filterMode === "genre" && (
                    <button
                      onClick={clearFilter}
                      className="flex-shrink-0 text-xs px-2 py-1 text-gray-500 hover:text-white transition-colors"
                    >
                      &#10005; Limpiar
                    </button>
                  )}
                </div>
              )}

              {platformCarousels.length > 0 && (
                <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
                  <span className="flex-shrink-0 text-[11px] font-semibold text-gray-500 uppercase tracking-wider self-center pr-1">
                    Plataformas
                  </span>
                  {platformCarousels.map((sec) => (
                    <button
                      key={sec.id}
                      onClick={() => selectPlatform(sec.id)}
                      style={
                        filterMode === "platform" && activePlatform === sec.id
                          ? { backgroundColor: sec.accent, borderColor: sec.accent }
                          : {}
                      }
                      className={`flex-shrink-0 text-xs font-bold px-3 py-1 rounded-full border transition-all ${
                        filterMode === "platform" && activePlatform === sec.id
                          ? "text-white"
                          : "bg-brand-surface border-brand-border text-gray-400 hover:text-white hover:border-gray-500"
                      }`}
                    >
                      {sec.label}
                    </button>
                  ))}
                  {filterMode === "platform" && (
                    <button
                      onClick={clearFilter}
                      className="flex-shrink-0 text-xs px-2 py-1 text-gray-500 hover:text-white transition-colors"
                    >
                      &#10005; Limpiar
                    </button>
                  )}
                </div>
              )}
            </div>

            {filterMode !== "genre" && visiblePlatforms.map((sec) => (
              <GenreCarousel
                key={`platform-${sec.id}`}
                id={`platform-${sec.id}`}
                title={sec.label}
                items={sec.items}
              />
            ))}

            {filterMode !== "platform" && visibleGenres.map((sec) => (
              <GenreCarousel
                key={`genre-${sec.id}`}
                id={`genre-${sec.id}`}
                title={sec.label}
                items={sec.items}
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
