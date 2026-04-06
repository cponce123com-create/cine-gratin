import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getMovies, getSeries } from "@/lib/api";
import { useFetch } from "@/hooks/useFetch";
import Carousel from "@/components/Carousel";
import { SkeletonHero } from "@/components/SkeletonCard";

const FALLBACK_BG =
  "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=1400&auto=format&fit=crop";

export default function Home() {
  const movies = useFetch(getMovies, []);
  const series = useFetch(getSeries, []);
  const navigate = useNavigate();

  const heroItem = useMemo(() => {
    const list = movies.data ?? [];
    return list.find((m) => m.featured) ?? list[0] ?? null;
  }, [movies.data]);

  const popularMovies = useMemo(() => (movies.data ?? []).slice(0, 20), [movies.data]);
  const popularSeries = useMemo(() => (series.data ?? []).slice(0, 20), [series.data]);

  return (
    <div className="min-h-screen bg-brand-dark">
      {/* Hero */}
      {movies.loading ? (
        <SkeletonHero />
      ) : heroItem ? (
        <div className="relative w-full h-[80vh] min-h-[520px] overflow-hidden">
          {/* Background image */}
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

          {/* Left-to-right dark gradient */}
          <div className="absolute inset-0 hero-gradient" />
          {/* Bottom fade */}
          <div className="absolute inset-x-0 bottom-0 h-48 hero-gradient-bottom" />

          {/* Content */}
          <div className="relative z-10 flex flex-col justify-end h-full pb-16 px-6 sm:px-10 lg:px-16 max-w-3xl">
            <h1 className="text-3xl sm:text-5xl font-black text-white leading-tight mb-3 drop-shadow-lg">
              {heroItem.title}
            </h1>

            {/* Meta info */}
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

            {/* Actions */}
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

      {/* Carousels */}
      <div className="pt-8 pb-16">
        {movies.error ? (
          <p className="text-red-400 text-center py-8">
            No se pudo cargar las peliculas.
          </p>
        ) : (
          <Carousel title="Peliculas populares" items={popularMovies} type="movie" />
        )}

        {series.error ? (
          <p className="text-red-400 text-center py-8">
            No se pudo cargar las series.
          </p>
        ) : (
          <Carousel title="Series populares" items={popularSeries} type="series" />
        )}

        {movies.data && movies.data.length > 20 && (
          <Carousel title="Mas peliculas" items={movies.data.slice(20, 40)} type="movie" />
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
