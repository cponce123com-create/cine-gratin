import { useMemo, useState, useRef } from "react";
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
import { useIntersectionObserver } from "@/hooks/useIntersectionObserver";

const BASE_URL =
  (import.meta.env["VITE_API_URL"] as string | undefined) ||
  "https://cine-gratin.onrender.com";

// ── TMDB types ────────────────────────────────────────────────────────────────
interface TmdbTrendingItem {
  tmdb_id: number;
  media_type: "movie" | "tv";
  title: string;
  poster_url: string;
  backdrop_url: string;
  year: string;
  rating: number;
  overview: string;
}

interface TmdbTrailerItem {
  tmdb_id: number;
  title: string;
  backdrop_url: string;
  poster_url: string;
  year: string;
  trailer_key: string;
  trailer_name: string;
  youtube_url: string;
  thumbnail_url: string;
}

interface DynamicSaga {
  collection_id: number;
  collection_name: string;
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

async function fetchTmdbTrailers(type: string): Promise<TmdbTrailerItem[]> {
  const res = await fetch(`${BASE_URL}/api/tmdb/trailers?type=${type}`);
  if (!res.ok) return [];
  return res.json();
}

// ── TmdbTrailersSection component ─────────────────────────────────────────────
function TmdbTrailersSection() {
  const TABS = [
    { id: "popular",   label: "Popular" },
    { id: "streaming", label: "Streaming" },
    { id: "theatres",  label: "En cines" },
  ];
  const [activeTab, setActiveTab] = useState("popular");
  const [activeTrailer, setActiveTrailer] = useState<string | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["tmdb-trailers", activeTab],
    queryFn: () => fetchTmdbTrailers(activeTab),
    staleTime: 30 * 60 * 1000,
  });

  const closeModal = () => setActiveTrailer(null);

  return (
    <div className="px-4 sm:px-6 lg:px-8 mb-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h2 className="text-xl sm:text-2xl font-black text-white flex items-center gap-3">
          <span className="w-2 h-7 bg-brand-red rounded-full" />
          Últimos Tráileres
        </h2>
        <div className="flex gap-1 bg-brand-surface border border-brand-border rounded-full p-0.5">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${
                activeTab === tab.id
                  ? "bg-brand-red text-white"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Carousel */}
      {isLoading ? (
        <div className="flex gap-3 overflow-hidden">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex-shrink-0 w-56 sm:w-64 h-36 sm:h-40 bg-brand-surface rounded-xl animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
          {items.map((item) => (
            <button
              key={item.tmdb_id}
              onClick={() => setActiveTrailer(item.trailer_key)}
              className="flex-shrink-0 w-56 sm:w-64 group text-left"
            >
              <div className="relative rounded-xl overflow-hidden bg-brand-surface aspect-video">
                {/* Thumbnail from YouTube */}
                <img
                  src={item.backdrop_url || item.thumbnail_url}
                  alt={item.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  loading="lazy"
                />
                {/* Play overlay */}
                <div className="absolute inset-0 bg-black/30 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                  <div className="w-12 h-12 rounded-full bg-white/90 group-hover:bg-white group-hover:scale-110 transition-all flex items-center justify-center shadow-lg">
                    <svg className="w-5 h-5 text-black ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </div>
                </div>
              </div>
              <p className="mt-1.5 text-xs font-semibold text-gray-200 truncate group-hover:text-white transition-colors">
                {item.title}
              </p>
              <p className="text-[10px] text-gray-500 truncate">{item.trailer_name}</p>
            </button>
          ))}
        </div>
      )}

      {/* YouTube Modal */}
      {activeTrailer && (
        <div
          ref={modalRef}
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={(e) => { if (e.target === modalRef.current) closeModal(); }}
        >
          <div className="relative w-full max-w-4xl">
            <button
              onClick={closeModal}
              className="absolute -top-10 right-0 text-white/70 hover:text-white text-2xl font-bold transition-colors"
            >
              ✕
            </button>
            <div className="relative aspect-video rounded-xl overflow-hidden bg-black shadow-2xl">
              <iframe
                src={`https://www.youtube.com/embed/${activeTrailer}?autoplay=1&rel=0`}
                className="absolute inset-0 w-full h-full"
                allow="autoplay; fullscreen"
                allowFullScreen
                title="Tráiler"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const FALLBACK_BG =
  "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=1400&auto=format&fit=crop";

const MIN_ITEMS_TO_SHOW = 2;
const SAGA_PAGE_SIZE = 30; // Mostrar más items en sagas por defecto
const LOAD_ALL_FOR_SAGAS = true; // Cargar todos los items para filtrado correcto de sagas

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
  // Reducir límites iniciales para mejorar el tiempo de carga
  const { data: movieData, isLoading: loadingMovies, error: errorMovies } = useQuery({
    queryKey: ["movies"],
    queryFn: () => getMovies({ limit: 10000 }), // Aumentado a 10000 para mostrar todas las películas en sagas
    staleTime: 5 * 60 * 1000,
  });
  const { data: seriesData, isLoading: loadingSeries, error: errorSeries } = useQuery({
    queryKey: ["series"],
    queryFn: () => getSeries({ limit: 5000 }), // Aumentado a 5000 para mostrar todas las series en sagas
    staleTime: 5 * 60 * 1000,
  });

  const { data: tmdbTrending = [] } = useQuery({
    queryKey: ["tmdb-trending-week"],
    queryFn: () => fetchTmdbTrending("week"),
    staleTime: 30 * 60 * 1000,
  });

  const { data: dynamicSagas = [] } = useQuery({
    queryKey: ["dynamic-sagas"],
    queryFn: fetchDynamicSagas,
    staleTime: 5 * 60 * 1000,
  });

  const navigate = useNavigate();
  const [activeGenre, setActiveGenre] = useState<string | null>(null);
  const [activePlatform, setActivePlatform] = useState<string | null>(null);
  const [filterMode, setFilterMode] = useState<FilterMode>(null);
  
  // Lazy loading para secciones de géneros, plataformas y sagas
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
    if (!tmdbTrending.length) return [];

    const result: MixedItem[] = [];
    
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
    [allMovies]
  );
  const popularSeries = useMemo(() =>
    [...allSeries].sort((a, b) => (Number(b.views) || 0) - (Number(a.views) || 0)),
    [allSeries]
  );

  // Memoizar solo cuando sea necesario (cuando el usuario hace scroll)
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

  // Solo procesar géneros cuando sean visibles en el viewport
  const genreCarousels = useMemo(
    () => {
      if (!genreVisible) return [];
      return GENRE_SECTIONS.map((sec) => ({
        ...sec,
        items: buildMixed(
          allMovies, allSeries,
          (m) => matchesKeywords(m.genres, sec.keywords),
          (s) => matchesKeywords(s.genres, sec.keywords)
        ),
      })).filter((s) => s.items.length >= MIN_ITEMS_TO_SHOW);
    },
    [allMovies, allSeries, genreVisible]
  );

  // Solo procesar plataformas cuando sean visibles en el viewport
  const platformCarousels = useMemo(
    () => {
      if (!platformVisible) return [];
      return PLATFORM_SECTIONS.map((sec) => ({
        ...sec,
        items: buildMixed(
          allMovies, allSeries,
          (m) => matchesNetworks(m.networks, sec.networks),
          (s) => matchesNetworks(s.networks, sec.networks)
        ),
      })).filter((s) => s.items.length >= MIN_ITEMS_TO_SHOW);
    },
    [allMovies, allSeries, platformVisible]
  );

  // Solo procesar sagas cuando sean visibles en el viewport
  const sagaCarousels = useMemo(
    () => {
      if (!sagaVisible) return [];
      
      // 1. Static sagas from config
      const staticSagas = SAGA_SECTIONS.map((sec) => ({
        ...sec,
        items: buildMixed(
          allMovies, allSeries,
          (m) => {
            if (m.collection_id === -1) return false;
            if (sec.collection_id) return m.collection_id === sec.collection_id;
            if (m.collection_id != null) return false;
            // Solo usar keywords si NO hay collection_id configurado para esta sección
            if (sec.collection_id) return false;
            return matchesTitle(m.title, sec.keywords);
          },
          (s) => {
            if (s.collection_id === -1) return false;
            if (sec.collection_id) return s.collection_id === sec.collection_id;
            if (s.collection_id != null) return false;
            // Solo usar keywords si NO hay collection_id configurado para esta sección
            if (sec.collection_id) return false;
            return matchesTitle(s.title, sec.keywords);
          }
        ),
      })).filter((s) => s.items.length >= 1);

      // 2. Dynamic sagas from DB that are not in static list
      const staticIds = new Set(SAGA_SECTIONS.map(s => s.collection_id).filter(Boolean));
      const dynamicSagaCarousels = dynamicSagas
        .filter(ds => !staticIds.has(ds.collection_id))
        .map(ds => ({
          id: `dynamic-${ds.collection_id}`,
          label: ds.collection_name,
          collection_id: ds.collection_id,
          items: buildMixed(
            allMovies, allSeries,
            (m) => m.collection_id === ds.collection_id,
            (s) => s.collection_id === ds.collection_id
          )
        }))
        .filter(s => s.items.length >= 1);

      return [...staticSagas, ...dynamicSagaCarousels];
    },
    [allMovies, allSeries, sagaVisible, dynamicSagas]
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

        {/* ── TMDB Live sections ────────────────────────────────────── */}
        <TmdbTrailersSection />

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
                  pageSize={30} // Mostrar más películas en las sagas
                />
        ))}

        {/* Lazy loading trigger para sagas */}
        <div ref={sagaRef} />
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
        {/* Lazy loading trigger para géneros y plataformas */}
        <div ref={genreRef} />
        <div ref={platformRef} />
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
