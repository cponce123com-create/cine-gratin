import { useMovies, useSeriesList } from "@/hooks/useApi";
import { MediaCard } from "@/components/ui/MediaCard";
import { Link } from "wouter";
import { Play, Info } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Home() {
  const { data: movies, loading: moviesLoading } = useMovies();
  const { data: series, loading: seriesLoading } = useSeriesList();

  const featuredMovie = movies?.find(m => m.featured) || movies?.[0];
  const popularMovies = movies?.filter(m => !m.featured).slice(0, 10) || [];
  const popularSeries = series?.slice(0, 10) || [];

  if (moviesLoading || seriesLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
            <Play className="w-6 h-6 text-primary animate-bounce" />
          </div>
          <p className="text-muted-foreground text-sm font-medium tracking-widest uppercase">Cargando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-20">
      {/* Hero Section */}
      {featuredMovie && (
        <div className="relative h-[85vh] w-full bg-black">
          <div className="absolute inset-0">
            <img
              src={featuredMovie.background_url || featuredMovie.poster_url}
              alt={featuredMovie.title}
              className="w-full h-full object-cover opacity-60"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-r from-background via-background/60 to-transparent" />
          </div>
          
          <div className="absolute bottom-0 left-0 w-full p-8 md:p-16 lg:p-24 flex flex-col justify-end">
            <div className="max-w-2xl space-y-4 animate-in fade-in slide-in-from-bottom-8 duration-1000">
              <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold text-white drop-shadow-lg leading-tight">
                {featuredMovie.title}
              </h1>
              
              <div className="flex items-center gap-3 text-sm md:text-base font-medium text-gray-300">
                <span className="text-primary font-bold">{featuredMovie.rating}/10</span>
                <span>•</span>
                <span>{featuredMovie.year}</span>
                <span>•</span>
                <span>{featuredMovie.duration_min} min</span>
              </div>
              
              <p className="text-gray-300 text-lg line-clamp-3 md:line-clamp-4 max-w-xl drop-shadow-md">
                {featuredMovie.synopsis}
              </p>
              
              <div className="flex flex-wrap items-center gap-4 pt-4">
                <Link href={`/player?url=${encodeURIComponent(featuredMovie.video_sources[0]?.url || '')}&title=${encodeURIComponent(featuredMovie.title)}`} className="inline-flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground px-8 py-3 rounded-md font-bold text-lg transition-colors">
                  <Play fill="currentColor" className="w-5 h-5" />
                  Ver ahora
                </Link>
                <Link href={`/pelicula/${featuredMovie.id}`} className="inline-flex items-center justify-center gap-2 bg-white/20 hover:bg-white/30 text-white backdrop-blur-sm px-8 py-3 rounded-md font-semibold text-lg transition-colors">
                  <Info className="w-5 h-5" />
                  Más info
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Content Rows */}
      <div className="container mx-auto px-4 md:px-8 mt-12 space-y-16">
        
        {/* Popular Movies */}
        <section>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <span className="w-1.5 h-6 bg-primary rounded-full inline-block"></span>
              Películas Populares
            </h2>
            <Link href="/peliculas" className="text-primary hover:underline text-sm font-medium">Ver todas</Link>
          </div>
          
          <div className="flex gap-4 overflow-x-auto pb-4 snap-x snap-mandatory hide-scrollbar">
            {popularMovies.map(movie => (
              <div key={movie.id} className="flex-none w-40 md:w-48 lg:w-56 snap-start">
                <MediaCard
                  id={movie.id}
                  title={movie.title}
                  posterUrl={movie.poster_url}
                  year={movie.year}
                  type="movie"
                />
              </div>
            ))}
          </div>
        </section>

        {/* Popular Series */}
        <section>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <span className="w-1.5 h-6 bg-primary rounded-full inline-block"></span>
              Series Destacadas
            </h2>
            <Link href="/series" className="text-primary hover:underline text-sm font-medium">Ver todas</Link>
          </div>
          
          <div className="flex gap-4 overflow-x-auto pb-4 snap-x snap-mandatory hide-scrollbar">
            {popularSeries.map(series => (
              <div key={series.id} className="flex-none w-40 md:w-48 lg:w-56 snap-start">
                <MediaCard
                  id={series.id}
                  title={series.title}
                  posterUrl={series.poster_url}
                  year={series.year}
                  type="series"
                />
              </div>
            ))}
          </div>
        </section>
        
      </div>
    </div>
  );
}
