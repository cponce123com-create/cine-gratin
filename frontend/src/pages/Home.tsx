import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Helmet } from "react-helmet-async";
import Carousel from "@/components/Carousel";
import GenreCarousel, { type MixedItem } from "@/components/GenreCarousel";
import HeroCarousel from "@/components/HeroCarousel";
import { SkeletonHero } from "@/components/SkeletonCard";
import SagaCard from "@/components/SagaCard";
import TmdbTrailersSection from "@/components/home/TmdbTrailersSection";
import SectionSkeleton from "@/components/home/SectionSkeleton";
import { GENRE_SECTIONS, PLATFORM_SECTIONS, CUSTOM_SECTIONS } from "@/lib/homeConfig";
import { useContinueWatching } from "@/hooks/useContinueWatching";
import { useIntersectionObserver } from "@/hooks/useIntersectionObserver";
import { useMovies, useSeriesList } from "@/hooks/useApi";
import { matchesKeywords, matchesNetworks, matchesTitle, buildMixed, MIN_ITEMS_TO_SHOW } from "@/components/home/helpers";
import type { TmdbTrendingItem, DynamicSaga, SagaConfigRow } from "@/components/home/types";

const BASE_URL =
  (import.meta.env["VITE_API_URL"] as string | undefined) ||
  "https://cine-gratin.onrender.com";

async function fetchSagaConfig(): Promise<SagaConfigRow[]> {
  const res = await fetch(`${BASE_URL}/api/saga-config`);
  if (!res.ok) return [];
  return res.json();
}

async function fetchDynamicSagas(): Promise<DynamicSaga[]> {
  const res = await fetch(`${BASE_URL}/api/admin/dynamic-sagas`);
  if (!res.ok) return [];
  return res.json();
}

async function fetchTmdbTrending(window: "day" | "week"): Promise<TmdbTrendingItem[]> {
  const res = await fetch(`${BASE_URL}/api/tmdb/trending?window=${window}`);
  if (!res.ok) return [];
  return res.json();
}

type FilterMode = "genre" | "platform" | null;

export default function Home() {
  const { data: movieData, isLoading: loadingMovies, error: errorMovies } = useMovies(1, 500);
  const { data: seriesData, isLoading: loadingSeries, error: errorSeries } = useSeriesList(1, 200);

  const { data: tmdbTrending = [] } = useQuery({
    queryKey: ["tmdb-trending-week"],
    queryFn: () => fetchTmdbTrending("week"),
    staleTime: 30 * 60 * 1000,
  });

  const { data: sagaConfig = [] } = useQuery({
    queryKey: ["saga-config"],
    queryFn: fetchSagaConfig,
    staleTime: 5 * 60 * 1000,
  });

  const { data: dynamicSagas = [] } = useQuery({
    queryKey: ["dynamic-sagas"],
    queryFn: fetchDynamicSagas,
    staleTime: 5 * 60 * 1000,
  });

  const [activeGenre, setActiveGenre] = useState<string | null>(null);
  const [activePlatform, setActivePlatform] = useState<string | null>(null);
  const [filterMode, setFilterMode] = useState<FilterMode>(null);

  const { ref: genreRef, isVisible: genreVisible } = useIntersectionObserver();
  const { ref: platformRef, isVisible: platformVisible } = useIntersectionObserver();
  const { ref: sagaRef, isVisible: sagaVisible } = useIntersectionObserver();

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
      const base = {
        id: item.id,
        imdb_id: item.imdbId,
        title: item.title,
        poster_url: item.poster_url,
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
    if (!tmdbTrending.length) return [];
    const result: import("@/components/GenreCarousel").MixedItem[] = [];
    tmdbTrending.forEach((tmdbItem) => {
      if (tmdbItem.media_type === "movie") {
        const found = allMovies.find(m => m.tmdb_id === tmdbItem.tmdb_id);
        if (found) result.push({ item: found, type: "movie" });
      } else if (tmdbItem.media_type === "tv") {
        const found = allSeries.find(s => s.tmdb_id === tmdbItem.tmdb_id);
        if (found) result.push({ item: found, type: "series" });
      }
    });
    return result;
  }, [allMovies, allSeries, tmdbTrending]);

  const popularMovies = useMemo(() =>
    [...allMovies].sort((a, b) => (Number(b.views) || 0) - (Number(a.views) || 0)),
    [allMovies],
  );
  const popularSeries = useMemo(() =>
    [...allSeries].sort((a, b) => (Number(b.views) || 0) - (Number(a.views) || 0)),
    [allSeries],
  );

  const customCarousels = useMemo(() => {
    return CUSTOM_SECTIONS.map((sec) => {
      let items: import("@/components/GenreCarousel").MixedItem[] = [];
      if (sec.type === "classics") {
        items = buildMixed(
          allMovies, allSeries,
          (m) => (Number(m.year) || 0) <= 2000,
          (s) => (Number(s.year) || 0) <= 2000,
        ).sort((a, b) => (Number(b.item.views) || 0) - (Number(a.item.views) || 0));
      } else if (sec.type === "old-animation") {
        items = buildMixed(
          allMovies, allSeries,
          (m) => (Number(m.year) || 0) <= 1990 && matchesKeywords(m.genres, ["animación", "animation"]),
          (s) => (Number(s.year) || 0) <= 1990 && matchesKeywords(s.genres, ["animación", "animation"]),
        ).sort((a, b) => (Number(b.item.views) || 0) - (Number(a.item.views) || 0));
      } else if (sec.type === "estrenos") {
        const currentYear = new Date().getFullYear();
        items = buildMixed(
          allMovies, allSeries,
          (m) => (Number(m.year) || 0) >= currentYear - 1,
          (s) => (Number(s.year) || 0) >= currentYear - 1,
        ).sort((a, b) => {
          const dateA = a.item.date_added ? new Date(a.item.date_added).getTime() : 0;
          const dateB = b.item.date_added ? new Date(b.item.date_added).getTime() : 0;
          return dateB - dateA;
        });
      }
      return { ...sec, items };
    }).filter(s => s.items.length >= MIN_ITEMS_TO_SHOW);
  }, [allMovies, allSeries]);

  const genreCarousels = useMemo(
    () => {
      if (!genreVisible) return [];
      return GENRE_SECTIONS.map((sec) => ({
        ...sec,
        items: buildMixed(
          allMovies, allSeries,
          (m) => matchesKeywords(m.genres, sec.keywords),
          (s) => matchesKeywords(s.genres, sec.keywords),
        ),
      })).filter((s) => s.items.length >= MIN_ITEMS_TO_SHOW);
    },
    [allMovies, allSeries, genreVisible],
  );

  const platformCarousels = useMemo(
    () => {
      if (!platformVisible) return [];
      return PLATFORM_SECTIONS.map((sec) => ({
        ...sec,
        items: buildMixed(
          allMovies, allSeries,
          (m) => matchesNetworks(m.networks, sec.networks),
          (s) => matchesNetworks(s.networks, sec.networks),
        ),
      })).filter((s) => s.items.length >= MIN_ITEMS_TO_SHOW);
    },
    [allMovies, allSeries, platformVisible],
  );

  // ── SAGAS: una sola fila con tarjetas ────────────────────────────────────────
  const sagaCards = useMemo(() => {
    if (!sagaVisible) return [];

    // Use DB-driven config (replaces hardcoded SAGA_SECTIONS)
    const staticCards = sagaConfig
      .map((sec) => {
        const items = [
          ...allMovies.filter((m) => {
            if (m.collection_id === -1) return false;
            if (sec.collection_id) return m.collection_id === sec.collection_id;
            if (m.collection_id != null) return false;
            return matchesTitle(m.title, sec.keywords);
          }),
          ...allSeries.filter((s) => {
            if (s.collection_id === -1) return false;
            if (sec.collection_id) return s.collection_id === sec.collection_id;
            if (s.collection_id != null) return false;
            return matchesTitle(s.title, sec.keywords);
          }),
        ];
        return {
          collection_id: sec.collection_id ?? 0,
          label: sec.label,
          covers: items.slice(0, 4).map((i) => i.poster_url).filter(Boolean),
          count: items.length,
        };
      })
      .filter((s) => s.count >= 2);

    const staticIds = new Set(sagaConfig.map((s) => s.collection_id).filter(Boolean));
    const dynamicCards = dynamicSagas
      .filter((ds) => !staticIds.has(ds.collection_id))
      .map((ds) => {
        const items = [
          ...allMovies.filter((m) => m.collection_id === ds.collection_id),
          ...allSeries.filter((s) => s.collection_id === ds.collection_id),
        ];
        return {
          collection_id: ds.collection_id,
          label: ds.collection_name,
          covers: items.slice(0, 4).map((i) => i.poster_url).filter(Boolean),
          count: items.length,
        };
      })
      .filter((s) => s.count >= 2);

    return [...staticCards, ...dynamicCards];
  }, [allMovies, allSeries, sagaVisible, dynamicSagas, sagaConfig]);

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

      {isLoading ? (
        <SkeletonHero />
      ) : heroItems.length > 0 ? (
        <HeroCarousel items={heroItems} />
      ) : null}

      <div className="pt-8 pb-16">
        {continueWatchingItems.length > 0 && (
          <GenreCarousel title="Seguir viendo" items={continueWatchingItems} />
        )}

        <TmdbTrailersSection />

        {isLoading ? (
          <>
            <SectionSkeleton title="Añadidas recientemente" />
            <SectionSkeleton title="Las más vistas" />
            <SectionSkeleton title="Tendencias" />
          </>
        ) : (
          <>
            {recentlyAdded.length > 0 && (
              <GenreCarousel title="Añadidas recientemente" items={recentlyAdded} />
            )}
            {mostViewed.length > 0 && (
              <GenreCarousel title="Las más vistas" items={mostViewed} />
            )}
            {trending.length > 0 && (
              <GenreCarousel title="Tendencias" items={trending} />
            )}
            {customCarousels.map((sec) => (
              <GenreCarousel key={sec.id} title={sec.label} items={sec.items} pageSize={30} />
            ))}
          </>
        )}

        {/* ── SAGAS: una sola fila con tarjetas ─────────────────── */}
        <div ref={sagaRef} />
        {isLoading && sagaVisible ? (
          <SectionSkeleton title="Sagas" />
        ) : sagaCards.length > 0 ? (
          <div className="mt-4 mb-8">
            <div className="px-4 sm:px-6 lg:px-8 mb-4">
              <h2 className="text-2xl sm:text-3xl font-black text-white flex items-center gap-3">
                <span className="w-2 h-8 bg-brand-red rounded-full" />
                Sagas
              </h2>
              <p className="text-gray-400 text-sm mt-1">Explora tus franquicias favoritas</p>
            </div>
            <div className="px-4 sm:px-6 lg:px-8">
              <div className="flex gap-3 overflow-x-auto pb-4 no-scrollbar">
                {sagaCards.map((saga) => (
                  <SagaCard
                    key={saga.collection_id}
                    collectionId={saga.collection_id}
                    name={saga.label}
                    covers={saga.covers}
                  />
                ))}
              </div>
            </div>
          </div>
        ) : null}

        {/* Películas populares */}
        {loadingMovies ? (
          <SectionSkeleton title="Películas populares" />
        ) : errorMovies ? (
          <p className="text-red-400 text-center py-8">No se pudieron cargar las películas.</p>
        ) : (
          <Carousel title="Películas populares" items={popularMovies} type="movie" />
        )}

        {/* Series populares */}
        {loadingSeries ? (
          <SectionSkeleton title="Series populares" />
        ) : errorSeries ? (
          <p className="text-red-400 text-center py-8">No se pudieron cargar las series.</p>
        ) : (
          <Carousel title="Series populares" items={popularSeries} type="series" />
        )}

        {/* ── Genre & Platform sections ─────────────────────────────── */}
        <div ref={genreRef} />
        <div ref={platformRef} />

        {isLoading && (genreVisible || platformVisible) ? (
          <div className="mt-12">
            <SectionSkeleton title="Explorar" />
          </div>
        ) : (genreCarousels.length > 0 || platformCarousels.length > 0) ? (
          <>
            <div className="px-4 sm:px-6 lg:px-8 mb-5 mt-2">
              <div className="flex items-center gap-3">
                <span className="w-2 h-8 bg-brand-red rounded-full" />
                <h2 className="text-2xl sm:text-3xl font-black text-white">Explorar</h2>
              </div>
            </div>

            <div className="px-4 sm:px-6 lg:px-8 mb-8">
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={clearFilter}
                  className={`px-4 py-2 rounded-xl text-sm font-bold transition-all border ${
                    !filterMode
                      ? "bg-brand-red border-brand-red text-white"
                      : "bg-brand-surface border-brand-border text-gray-400 hover:text-white hover:border-gray-500"
                  }`}
                >
                  Todo
                </button>
                <div className="h-8 w-px bg-brand-border mx-1" />
                {GENRE_SECTIONS.map((g) => (
                  <button
                    key={g.id}
                    onClick={() => selectGenre(g.id)}
                    className={`px-4 py-2 rounded-xl text-sm font-bold transition-all border ${
                      filterMode === "genre" && activeGenre === g.id
                        ? "bg-brand-red border-brand-red text-white shadow-lg shadow-brand-red/20"
                        : "bg-brand-surface border-brand-border text-gray-400 hover:text-white hover:border-gray-500"
                    }`}
                  >
                    {g.label}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap gap-2 mt-3">
                {PLATFORM_SECTIONS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => selectPlatform(p.id)}
                    className={`px-4 py-2 rounded-xl text-sm font-bold transition-all border flex items-center gap-2 ${
                      filterMode === "platform" && activePlatform === p.id
                        ? "bg-white border-white text-brand-dark shadow-lg"
                        : "bg-brand-surface border-brand-border text-gray-400 hover:text-white hover:border-gray-500"
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.accent }} />
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              {filterMode === "genre" || !filterMode
                ? visibleGenres.map((sec) => (
                    <GenreCarousel key={sec.id} id={sec.id} title={sec.label} items={sec.items} />
                  ))
                : null}

              {filterMode === "platform" || !filterMode
                ? visiblePlatforms.map((sec) => (
                    <GenreCarousel key={sec.id} id={sec.id} title={sec.label} items={sec.items} />
                  ))
                : null}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
