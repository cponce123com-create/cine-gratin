import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getMovies, getSeries } from "@/lib/api";
import { useFetch } from "@/hooks/useFetch";
import Carousel from "@/components/Carousel";
import GenreCarousel, { type MixedItem } from "@/components/GenreCarousel";
import { SkeletonHero } from "@/components/SkeletonCard";
import { GENRE_SECTIONS, PLATFORM_SECTIONS } from "@/lib/homeConfig";
import type { Movie, Series } from "@/lib/types";

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
  const movies = useFetch(getMovies, []);
  const series = useFetch(getSeries, []);
  const navigate = useNavigate();

  const [activeGenre, setActiveGenre] = useState<string | null>(null);
  const [activePlatform, setActivePlatform] = useState<string | null>(null);
  const [filterMode, setFilterMode] = useState<FilterMode>(null);

  const heroItem = useMemo(() => {
    const list = movies.data ?? [];
    return list.find((m) => m.featured) ?? list[0] ?? null;
  }, [movies.data]);

  const popularMovies = useMemo(() => (movies.data ?? []).slice(0, 20), [movies.data]);
  const popularSeries = useMemo(() => (series.data ?? []).slice(0, 20), [series.data]);

  const allMovies = movies.data ?? [];
  const allSeries = series.data ?? [];

  // Genre carousels
  const genreCarousels = useMemo(() =>
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

  // Platform carousels — only shown when items have network data
  const platformCarousels = useMemo(() =>
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

  const isLoading = movies.loading || series.loading;

  // Which genre carousels to show
  const visibleGenres = filterMode === "genre" && activeGenre
    ? genreCarousels.filter((s) => s.id === activeGenre)
    : genreCarousels;

  // Which platform carousels to show
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
                <InfoIcon /> Mas info
              </Link>
            </div>
          </div>
        </div>
      ) : null}

      {/* ── Main content ──────────────────────────────────────────── */}
      <div className="pt-8 pb-16">
        {/* Popular carousels (always visible) */}
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

        {/* ── Genre & Platform sections ─────────────────────────────── */}
        {!isLoading && (genreCarousels.length > 0 || platformCarousels.length > 0) && (
          <>
            {/* Divider */}
            <div className="px-4 sm:px-6 lg:px-8 mb-5 mt-2">
              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-brand-border" />
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-widest">
                  Explorar por categoría
                </span>
                <div className="h-px flex-1 bg-brand-border" />
              </div>
            </div>

            {/* ── Filter chip bar ───────────────────────────────────── */}
            <div className="px-4 sm:px-6 lg:px-8 mb-6 space-y-3">
              {/* Genre chips */}
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
                  {(filterMode === "genre") && (
                    <button
                      onClick={clearFilter}
                      className="flex-shrink-0 text-xs px-2 py-1 text-gray-500 hover:text-white transition-colors"
                    >
                      ✕ Limpiar
                    </button>
                  )}
                </div>
              )}

              {/* Platform chips — only shown when platform data exists */}
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
                      ✕ Limpiar
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* ── Platform carousels ────────────────────────────────── */}
            {(filterMode !== "genre") && visiblePlatforms.map((sec) => (
              <GenreCarousel
                key={`platform-${sec.id}`}
                id={`platform-${sec.id}`}
                title={sec.label}
                items={sec.items}
              />
            ))}

            {/* ── Genre carousels ───────────────────────────────────── */}
            {(filterMode !== "platform") && visibleGenres.map((sec) => (
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
