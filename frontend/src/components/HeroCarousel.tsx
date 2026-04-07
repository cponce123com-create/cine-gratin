import { useState, useEffect, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { Movie, Series } from "@/lib/types";

interface HeroCarouselProps {
  items: { item: Movie | Series; type: "movie" | "series" }[];
}

const FALLBACK_BG =
  "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=1400&auto=format&fit=crop";

function PlayIcon() {
  return (
    <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
      <path d="M11 7h2v2h-2zm0 4h2v6h-2zm1-9C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z" />
    </svg>
  );
}

export default function HeroCarousel({ items }: HeroCarouselProps) {
  const navigate = useNavigate();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  const nextSlide = useCallback(() => {
    setCurrentIndex((prev) => (prev + 1) % items.length);
  }, [items.length]);

  const prevSlide = () => {
    setCurrentIndex((prev) => (prev - 1 + items.length) % items.length);
  };

  useEffect(() => {
    if (isPaused) return;
    const timer = setInterval(nextSlide, 8000);
    return () => clearInterval(timer);
  }, [nextSlide, isPaused]);

  if (items.length === 0) return null;

  const active = items[currentIndex];
  const { item, type } = active;

  const handlePlay = () => {
    if (type === "movie") {
      const movie = item as Movie;
      if (movie.imdb_id) {
        navigate(`/player/movie/${movie.imdb_id}?title=${encodeURIComponent(movie.title)}`);
      } else if (movie.video_sources && movie.video_sources.length > 0) {
        navigate(`/player?url=${encodeURIComponent(movie.video_sources[0].url)}&title=${encodeURIComponent(movie.title)}&label=${encodeURIComponent(movie.video_sources[0].label)}`);
      }
    } else {
      navigate(`/serie/${item.id}`);
    }
  };

  return (
    <div 
      className="relative w-full h-[80vh] min-h-[520px] overflow-hidden group"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {/* Background Images with Crossfade */}
      {items.map((entry, idx) => (
        <div
          key={`${entry.type}-${entry.item.id}`}
          className={`absolute inset-0 transition-opacity duration-1000 ease-in-out ${
            idx === currentIndex ? "opacity-100 z-0" : "opacity-0 z-[-1]"
          }`}
        >
          <img
            src={entry.item.background_url || entry.item.poster_url || FALLBACK_BG}
            alt={entry.item.title}
            className="w-full h-full object-cover object-center"
            onError={(e) => { (e.currentTarget as HTMLImageElement).src = FALLBACK_BG; }}
          />
        </div>
      ))}

      <div className="absolute inset-0 hero-gradient" />
      <div className="absolute inset-x-0 bottom-0 h-48 hero-gradient-bottom" />

      {/* Content */}
      <div className="relative z-10 flex flex-col justify-end h-full pb-16 px-6 sm:px-10 lg:px-16 max-w-3xl">
        <div className="mb-4">
           <span className="inline-block px-2 py-1 rounded bg-brand-red text-white text-[10px] font-bold uppercase tracking-wider mb-2">
             {type === "movie" ? "Película" : "Serie"} Destacada
           </span>
           <h1 className="text-3xl sm:text-5xl font-black text-white leading-tight mb-3 drop-shadow-lg">
            {item.title}
          </h1>
        </div>
        
        <div className="flex flex-wrap items-center gap-3 mb-4">
          {item.rating !== undefined && (
            <span className="flex items-center gap-1 text-brand-gold font-semibold text-sm">
              &#9733; {Number(item.rating).toFixed(1)}
            </span>
          )}
          {item.year && <span className="text-gray-300 text-sm">{item.year}</span>}
          {type === "movie" && (item as Movie).runtime && (
            <span className="text-gray-300 text-sm">{(item as Movie).runtime} min</span>
          )}
          {type === "series" && (item as Series).total_seasons && (
            <span className="text-gray-300 text-sm">{(item as Series).total_seasons} Temporadas</span>
          )}
          {item.genres && item.genres.length > 0 && (
            <div className="flex gap-1.5">
              {item.genres.slice(0, 3).map((g) => (
                <span key={g} className="text-xs bg-white/10 border border-white/20 rounded px-2 py-0.5 text-gray-300">
                  {g}
                </span>
              ))}
            </div>
          )}
        </div>

        {item.synopsis && (
          <p className="text-gray-300 text-sm sm:text-base leading-relaxed line-clamp-3 mb-6 max-w-xl">
            {item.synopsis}
          </p>
        )}

        <div className="flex flex-wrap gap-3">
          <button
            onClick={handlePlay}
            className="flex items-center gap-2 bg-brand-red hover:bg-red-700 text-white font-bold py-3 px-6 rounded transition-colors"
          >
            <PlayIcon /> {type === "movie" ? "Reproducir" : "Ver ahora"}
          </button>
          <Link
            to={type === "movie" ? `/pelicula/${item.id}` : `/serie/${item.id}`}
            className="flex items-center gap-2 bg-white/10 hover:bg-white/20 border border-white/30 text-white font-bold py-3 px-6 rounded transition-colors backdrop-blur-sm"
          >
            <InfoIcon /> Más info
          </Link>
        </div>
      </div>

      {/* Navigation Arrows */}
      <button
        onClick={prevSlide}
        className="absolute left-4 top-1/2 -translate-y-1/2 z-20 p-2 rounded-full bg-black/20 hover:bg-black/40 text-white opacity-0 group-hover:opacity-100 transition-opacity"
        aria-label="Anterior"
      >
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
      </button>
      <button
        onClick={nextSlide}
        className="absolute right-4 top-1/2 -translate-y-1/2 z-20 p-2 rounded-full bg-black/20 hover:bg-black/40 text-white opacity-0 group-hover:opacity-100 transition-opacity"
        aria-label="Siguiente"
      >
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>

      {/* Indicators */}
      <div className="absolute bottom-8 right-8 z-20 flex gap-2">
        {items.map((_, idx) => (
          <button
            key={idx}
            onClick={() => setCurrentIndex(idx)}
            className={`h-1.5 rounded-full transition-all ${
              idx === currentIndex ? "w-8 bg-brand-red" : "w-4 bg-white/30 hover:bg-white/50"
            }`}
            aria-label={`Ir al slide ${idx + 1}`}
          />
        ))}
      </div>
    </div>
  );
}
