import { useRoute, Link } from "wouter";
import { useMovie } from "@/hooks/useApi";
import { Play, Star, Clock, Calendar, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function MovieDetail() {
  const [, params] = useRoute("/pelicula/:id");
  const id = params?.id || "";
  const { data: movie, loading, error } = useMovie(id);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Play className="w-8 h-8 text-primary animate-bounce" />
      </div>
    );
  }

  if (error || !movie) {
    return (
      <div className="min-h-screen pt-24 text-center">
        <h2 className="text-2xl font-bold">Película no encontrada</h2>
        <Link href="/peliculas" className="text-primary mt-4 inline-block hover:underline">Volver a películas</Link>
      </div>
    );
  }

  const mainVideoSource = movie.video_sources?.[0]?.url || "";

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Backdrop */}
      <div className="relative h-[60vh] md:h-[70vh] w-full">
        <div className="absolute inset-0">
          <img
            src={movie.background_url || movie.poster_url}
            alt={movie.title}
            className="w-full h-full object-cover opacity-30"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-transparent" />
        </div>
        
        <div className="absolute top-24 left-4 md:left-8 z-10">
          <Link href="/peliculas" className="inline-flex items-center gap-2 text-white/70 hover:text-white transition-colors">
            <ArrowLeft className="w-5 h-5" />
            <span>Volver</span>
          </Link>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-4 md:px-8 -mt-64 relative z-10">
        <div className="flex flex-col md:flex-row gap-8 lg:gap-12">
          {/* Poster */}
          <div className="shrink-0 w-48 md:w-64 lg:w-80 mx-auto md:mx-0 shadow-2xl rounded-xl overflow-hidden ring-1 ring-white/10">
            <img 
              src={movie.poster_url} 
              alt={movie.title}
              className="w-full h-auto object-cover"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.src = "https://via.placeholder.com/400x600/1a1a1a/e5e5e5?text=No+Poster";
              }}
            />
          </div>

          {/* Details */}
          <div className="flex-1 space-y-6 text-center md:text-left mt-4 md:mt-16 lg:mt-32">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white tracking-tight">{movie.title}</h1>
            
            <div className="flex flex-wrap items-center justify-center md:justify-start gap-4 text-sm md:text-base text-gray-300">
              <div className="flex items-center gap-1.5 text-yellow-500 font-semibold">
                <Star className="w-5 h-5 fill-current" />
                <span>{movie.rating}</span>
              </div>
              <span className="hidden md:inline text-white/20">•</span>
              <div className="flex items-center gap-1.5">
                <Calendar className="w-4 h-4" />
                <span>{movie.year}</span>
              </div>
              <span className="hidden md:inline text-white/20">•</span>
              <div className="flex items-center gap-1.5">
                <Clock className="w-4 h-4" />
                <span>{movie.duration_min} min</span>
              </div>
            </div>

            <div className="flex flex-wrap justify-center md:justify-start gap-2">
              {movie.genres.map(genre => (
                <span key={genre} className="px-3 py-1 rounded-full bg-white/10 text-white/80 text-xs font-medium border border-white/10">
                  {genre}
                </span>
              ))}
            </div>

            <p className="text-gray-300 text-lg leading-relaxed max-w-3xl">
              {movie.synopsis}
            </p>

            <div className="pt-6">
              <Link href={`/player?url=${encodeURIComponent(mainVideoSource)}&title=${encodeURIComponent(movie.title)}`}>
                <Button size="lg" className="w-full md:w-auto gap-2 font-bold text-lg px-8 py-6 rounded-full shadow-lg shadow-primary/25 hover:scale-105 transition-transform">
                  <Play fill="currentColor" className="w-6 h-6" />
                  Ver Película
                </Button>
              </Link>
            </div>
          </div>
        </div>
        
        {/* Trailer */}
        {movie.trailer_url && (
          <div className="mt-20">
            <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
              <span className="w-1.5 h-6 bg-primary rounded-full inline-block"></span>
              Tráiler Oficial
            </h2>
            <div className="aspect-video w-full max-w-4xl mx-auto rounded-xl overflow-hidden shadow-2xl ring-1 ring-white/10">
              <iframe
                src={movie.trailer_url.replace("watch?v=", "embed/")}
                title="Trailer"
                className="w-full h-full border-0"
                allowFullScreen
              ></iframe>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
