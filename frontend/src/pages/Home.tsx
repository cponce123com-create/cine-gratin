import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Helmet } from "react-helmet-async";
import { getMovies, getSeries } from "@/lib/api";
import Carousel from "@/components/Carousel";
import GenreCarousel, { type MixedItem } from "@/components/GenreCarousel";
import HeroCarousel from "@/components/HeroCarousel";
import { SkeletonHero } from "@/components/SkeletonCard";
import { GENRE_SECTIONS, PLATFORM_SECTIONS, SAGA_SECTIONS, CUSTOM_SECTIONS } from "@/lib/homeConfig";
import type { Movie, Series } from "@/lib/types";
import { useContinueWatching } from "@/hooks/useContinueWatching";

const FALLBACK_BG =
  "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=1400&auto=format&fit=crop";

const MIN_ITEMS_TO_SHOW = 2;
const SAGA_PAGE_SIZE = 30; // Mostrar más items en sagas por defecto

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

function normalizeTitle(title: string): string {
  // Normalizar: convertir a minúsculas, eliminar acentos, reemplazar caracteres especiales
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Eliminar diacríticos
    .replace(/[&]/g, 'and') // Reemplazar & por and
    .replace(/[^a-z0-9\s]/g, '') // Eliminar caracteres especiales
    .trim();
}

function matchesTitle(title: string, keywords: string[]): boolean {
  const normalizedTitle = normalizeTitle(title);
  return keywords.some((kw) => {
    const normalizedKw = normalizeTitle(kw);
    return normalizedTitle.includes(normalizedKw);
  });
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
  
  // Sort by year descending (most recent first)
  result.sort((a, b) => {
    const yearA = Number(a.item.year) || 0;
    const yearB = Number(b.item.year) || 0;
    return yearB - yearA;
  });

  return result;
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

  const heroItems = useMemo(() => {
    const topMovies = [...allMovies]
      .sort((a, b) => (Number(b.views) || 0) - (Number(a.views) || 0))
      .slice(0, 3)
      .map((m) => ({ item: m, type: "movie" as const }));

    const topSeries = [...allSeries]
      .sort((a, b) => (Number(b.views) || 0) - (Number(a.views) || 0))
      .slice(0, 3)
      .map((s) => ({ item: s, type: "series" as const }));

    return [...topMovies, ...topSeries];
  }, [allMovies, allSeries]);

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
    return mixed.sort((a, b) => (Number(b.item.views) || 0) - (Number(a.item.views) || 0));
  }, [allMovies, allSeries]);

  const recentlyAdded = useMemo(() => {
    const mixed = buildMixed(allMovies, allSeries, () => true, () => true);
    return mixed.sort((a, b) => {
      const dateA = a.item.date_added ? new Date(a.item.date_added).getTime() : 0;
      const dateB = b.item.date_added ? new Date(b.item.date_added).getTime() : 0;
      return dateB - dateA;
    });
  }, [allMovies, allSeries]);

  const trending = useMemo(() => {
    const mixed = buildMixed(allMovies, allSeries, () => true, () => true);
    return mixed
      .sort((a, b) => (Number(b.item.views) || 0) - (Number(a.item.views) || 0))
      .slice(0, 40)
      .sort(() => Math.random() - 0.5)
      .slice(0, 24);
  }, [allMovies, allSeries]);

  const popularMovies = useMemo(() =>
    [...allMovies].sort((a, b) => (Number(b.views) || 0) - (Number(a.views) || 0)),
    [allMovies]
  );
  const popularSeries = useMemo(() =>
    [...allSeries].sort((a, b) => (Number(b.views) || 0) - (Number(a.views) || 0)),
    [allSeries]
  );

  const customCarousels = useMemo(() => {
    return CUSTOM_SECTIONS.map((sec) => {
      let items: MixedItem[] = [];
      if (sec.type === "classics") {
        items = buildMixed(
          allMovies, allSeries,
          (m) => (Number(m.year) || 0) <= 2000,
          (s) => (Number(s.year) || 0) <= 2000
        ).sort((a, b) => (Number(b.item.views) || 0) - (Number(a.item.views) || 0));
      } else if (sec.type === "old-animation") {
        items = buildMixed(
          allMovies, allSeries,
          (m) => (Number(m.year) || 0) <= 1990 && matchesKeywords(m.genres, ["animación", "animation"]),
          (s) => (Number(s.year) || 0) <= 1990 && matchesKeywords(s.genres, ["animación", "animation"])
        ).sort((a, b) => (Number(b.item.views) || 0) - (Number(a.item.views) || 0));
      } else if (sec.type === "estrenos") {
        const currentYear = new Date().getFullYear();
        items = buildMixed(
          allMovies, allSeries,
          (m) => (Number(m.year) || 0) >= currentYear - 1,
          (s) => (Number(s.year) || 0) >= currentYear - 1
        ).sort((a, b) => {
          // Sort by date_added first (newest in catalog), then by year
          const dateA = a.item.date_added ? new Date(a.item.date_added).getTime() : 0;
          const dateB = b.item.date_added ? new Date(b.item.date_added).getTime() : 0;
          return dateB - dateA;
        });
      }
      return { ...sec, items };
    }).filter(s => s.items.length >= MIN_ITEMS_TO_SHOW);
  }, [allMovies, allSeries]);

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

  const sagaCarousels = useMemo(
    () =>
      SAGA_SECTIONS.map((sec) => ({
        ...sec,
        items: buildMixed(
          allMovies, allSeries,
          (m) => {
            // Priority 1: Match by collection_id (-1 means scanned and confirmed no collection)
            if (sec.collection_id && m.collection_id === sec.collection_id) return true;
            // If movie has been scanned and has a different collection, skip keyword fallback
            if (m.collection_id && m.collection_id !== -1) return false;
            // Fallback: Match by title keywords (for unscanned movies)
            return matchesTitle(m.title, sec.keywords);
          },
          (s) => {
            // Priority 1: Match by collection_id
            if (sec.collection_id && s.collection_id === sec.collection_id) return true;
            if (s.collection_id && s.collection_id !== -1) return false;
            // Fallback: Match by title keywords
            return matchesTitle(s.title, sec.keywords);
          }
        ),
      })).filter((s) => s.items.length >= 1), // Sagas can show even with 1 item
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
      {isLoading ? (
        <SkeletonHero />
      ) : heroItems.length > 0 ? (
        <HeroCarousel items={heroItems} />
      ) : null}

      {/* ── Main content ──────────────────────────────────────────── */}
      <div className="pt-8 pb-16">
        {continueWatchingItems.length > 0 && (
          <GenreCarousel title="Seguir viendo" items={continueWatchingItems} />
        )}

        {recentlyAdded.length > 0 && (
          <GenreCarousel title="Añadidas recientemente" items={recentlyAdded} />
        )}

        {mostViewed.length > 0 && (
          <GenreCarousel title="Las más vistas" items={mostViewed} />
        )}

        {trending.length > 0 && (
          <GenreCarousel title="Tendencias" items={trending} />
        )}

        {/* ── Custom sections ────────────────────────────────────────── */}
        {customCarousels.map((sec) => (
          <GenreCarousel
            key={sec.id}
            title={sec.label}
            items={sec.items}
          />
        ))}

        {sagaCarousels.length > 0 && (
          <div className="mt-12 mb-8">
            <div className="px-4 sm:px-6 lg:px-8 mb-6">
              <h2 className="text-2xl sm:text-3xl font-black text-white flex items-center gap-3">
                <span className="w-2 h-8 bg-brand-red rounded-full" />
                Grandes Sagas
              </h2>
              <p className="text-gray-400 text-sm mt-1">Explora tus franquicias favoritas</p>
            </div>
            {sagaCarousels.map((saga) => (
              <GenreCarousel key={saga.id} title={saga.label} items={saga.items} pageSize={SAGA_PAGE_SIZE} />
            ))}
          </div>
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
                      className={`flex-shrink-0 text-xs font-semibold px-3 py-1 rounded-full border transition-all ${
                        filterMode === "platform" && activePlatform === sec.id
                          ? "bg-brand-red border-red-700 text-white"
                          : "bg-brand-surface border-brand-border text-gray-400 hover:text-white hover:border-gray-500"
                      }`}
                    >
                      {sec.label}
                    </button>
                  ))}
                </div>
              )}

              {filterMode && (
                <button
                  onClick={clearFilter}
                  className="text-[10px] font-bold text-brand-red uppercase tracking-tighter hover:text-red-400 transition-colors"
                >
                  &times; Limpiar filtros
                </button>
              )}
            </div>

            <div className="space-y-10">
              {filterMode === "genre" &&
                visibleGenres.map((sec) => (
                  <GenreCarousel key={sec.id} title={sec.label} items={sec.items} />
                ))}
              {filterMode === "platform" &&
                visiblePlatforms.map((sec) => (
                  <GenreCarousel key={sec.id} title={sec.label} items={sec.items} />
                ))}
              {!filterMode && (
                <>
                  {visibleGenres.slice(0, 4).map((sec) => (
                    <GenreCarousel key={sec.id} title={sec.label} items={sec.items} />
                  ))}
                  {visiblePlatforms.slice(0, 3).map((sec) => (
                    <GenreCarousel key={sec.id} title={sec.label} items={sec.items} />
                  ))}
                  {visibleGenres.slice(4).map((sec) => (
                    <GenreCarousel key={sec.id} title={sec.label} items={sec.items} />
                  ))}
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
