import { useMemo, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Helmet } from "react-helmet-async";
import Carousel from "@/components/Carousel";
import GenreCarousel, { type MixedItem } from "@/components/GenreCarousel";
import HeroCarousel from "@/components/HeroCarousel";
import { SkeletonHero } from "@/components/SkeletonCard";
import { GENRE_SECTIONS, PLATFORM_SECTIONS, SAGA_SECTIONS, CUSTOM_SECTIONS } from "@/lib/homeConfig";
import type { Movie, Series } from "@/lib/types";
import { useContinueWatching } from "@/hooks/useContinueWatching";
import { useIntersectionObserver } from "@/hooks/useIntersectionObserver";
import { useMovies, useSeries } from "@/hooks/useApi";

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
                <img
                  src={item.backdrop_url || item.thumbnail_url}
                  alt={item.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  loading="lazy"
                />
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
const SAGA_PAGE_SIZE = 30;
const LOAD_ALL_FOR_SAGAS = true;

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
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[&]/g, 'and')
    .replace(/[^a-z0-9\s]/g, '')
    .trim();
}

function matchesTitle(title: string, keywords: string[]): boolean {
  const normalizedTitle = normalizeTitle(title);
  return keywords.some((kw) => {
    const normalizedKw = normalizeTitle(kw);
    if (normalizedKw.includes(' ')) {
      // Multi-word phrase: substring match is fine
      return normalizedTitle.includes(normalizedKw);
    }
    // Single word: require word boundary to avoid "wick" matching "wicked",
    // "rings" matching "springs", "bond" matching "bonding", etc.
    return new RegExp(`(?:^|\\s)${normalizedKw}(?:\\s|$)`).test(normalizedTitle);
  });
}

// Words that appear in TMDB collection names but add no matching value
const COLLECTION_STOP = new Set([
  'la', 'el', 'los', 'las', 'de', 'del', 'the', 'of', 'a', 'an', 'and', 'en',
  'y', 'e', 'con', 'por', 'para', 'collection', 'coleccion', 'coleccion',
  'saga', 'series', 'trilogy', 'trilogia', 'part', 'parte', 'universe',
  'universo', 'film', 'movie', 'pelicula',
]);

/** Derive keyword tokens from a TMDB collection name for fuzzy fallback matching */
function collectionKeywords(name: string): string[] {
  return normalizeTitle(name)
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !COLLECTION_STOP.has(w));
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
  
  result.sort((a, b) => {
    const yearA = Number(a.item.year) || 0;
    const yearB = Number(b.item.year) || 0;
    return yearB - yearA;
  });

  return result;
}

type FilterMode = "genre" | "platform" | null;

export default function Home() {
  // Reducir límites iniciales para mejorar el tiempo de carga considerablemente
  const { data: movieData, isLoading: loadingMovies, error: errorMovies } = useMovies({ limit: 100 });
  const { data: seriesData, isLoading: loadingSeries, error: errorSeries } = useSeries({ limit: 50 });

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

  const SectionSkeleton = ({ title }: { title: string }) => (
    <div className="px-4 sm:px-6 lg:px-8 mb-10">
      <div className="flex items-center gap-3 mb-4">
        <span className="w-2 h-7 bg-brand-surface rounded-full animate-pulse" />
        <div className="h-6 w-48 bg-brand-surface rounded animate-pulse" />
      </div>
      <div className="flex gap-4 overflow-hidden">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex-shrink-0 w-36 md:w-44 animate-pulse">
            <div className="aspect-[2/3] w-full rounded-lg bg-brand-surface" />
            <div className="mt-2 h-3 w-3/4 rounded bg-brand-surface" />
          </div>
        ))}
      </div>
    </div>
  );

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

        {/* Secciones Mixtas (Películas + Series) */}
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

            {/* ── Custom sections ────────────────────────────────────────── */}
            {customCarousels.map((sec) => (
              <GenreCarousel
                key={sec.id}
                title={sec.label}
                items={sec.items}
                pageSize={30}
              />
            ))}
          </>
        )}

        {/* Lazy loading trigger para sagas */}
        <div ref={sagaRef} />
        {isLoading && sagaVisible ? (
          <SectionSkeleton title="Grandes Sagas" />
        ) : sagaCarousels.length > 0 ? (
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
        ) : null}

        {/* Secciones de Películas Populares */}
        {loadingMovies ? (
          <SectionSkeleton title="Películas populares" />
        ) : errorMovies ? (
          <p className="text-red-400 text-center py-8">No se pudieron cargar las películas.</p>
        ) : (
          <Carousel title="Películas populares" items={popularMovies} type="movie" />
        )}

        {/* Secciones de Series Populares */}
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
