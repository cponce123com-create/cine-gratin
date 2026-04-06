import { useState } from "react";
import { useRoute, Link } from "wouter";
import { useSeries } from "@/hooks/useApi";
import { Play, Star, Calendar, ArrowLeft, Tv2 } from "lucide-react";

export default function SeriesDetail() {
  const [, params] = useRoute("/serie/:id");
  const id = params?.id || "";
  const { data: series, loading, error } = useSeries(id);
  const [selectedSeason, setSelectedSeason] = useState<number>(1);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Play className="w-8 h-8 text-primary animate-bounce" />
      </div>
    );
  }

  if (error || !series) {
    return (
      <div className="min-h-screen pt-24 text-center">
        <h2 className="text-2xl font-bold">Serie no encontrada</h2>
        <Link href="/series" className="text-primary mt-4 inline-block hover:underline">Volver a series</Link>
      </div>
    );
  }

  const currentSeason = series.seasons?.find(s => s.number === selectedSeason) || series.seasons?.[0];

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Backdrop */}
      <div className="relative h-[50vh] md:h-[60vh] w-full">
        <div className="absolute inset-0">
          <img
            src={series.background_url || series.poster_url}
            alt={series.title}
            className="w-full h-full object-cover opacity-30"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-transparent" />
        </div>
        
        <div className="absolute top-24 left-4 md:left-8 z-10">
          <Link href="/series" className="inline-flex items-center gap-2 text-white/70 hover:text-white transition-colors">
            <ArrowLeft className="w-5 h-5" />
            <span>Volver</span>
          </Link>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-4 md:px-8 -mt-32 md:-mt-48 relative z-10">
        <div className="flex flex-col md:flex-row gap-8 lg:gap-12">
          {/* Poster */}
          <div className="shrink-0 w-40 md:w-56 lg:w-72 mx-auto md:mx-0 shadow-2xl rounded-xl overflow-hidden ring-1 ring-white/10">
            <img 
              src={series.poster_url} 
              alt={series.title}
              className="w-full h-auto object-cover"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.src = "https://via.placeholder.com/400x600/1a1a1a/e5e5e5?text=No+Poster";
              }}
            />
          </div>

          {/* Details */}
          <div className="flex-1 space-y-6 text-center md:text-left mt-4 md:mt-16 lg:mt-24">
            <h1 className="text-4xl md:text-5xl font-bold text-white tracking-tight">{series.title}</h1>
            
            <div className="flex flex-wrap items-center justify-center md:justify-start gap-4 text-sm md:text-base text-gray-300">
              <div className="flex items-center gap-1.5 text-yellow-500 font-semibold">
                <Star className="w-5 h-5 fill-current" />
                <span>{series.rating}</span>
              </div>
              <span className="hidden md:inline text-white/20">•</span>
              <div className="flex items-center gap-1.5">
                <Calendar className="w-4 h-4" />
                <span>{series.year}</span>
              </div>
              <span className="hidden md:inline text-white/20">•</span>
              <div className="flex items-center gap-1.5">
                <Tv2 className="w-4 h-4" />
                <span>{series.seasons?.length || 0} Temporadas</span>
              </div>
            </div>

            <div className="flex flex-wrap justify-center md:justify-start gap-2">
              {series.genres.map(genre => (
                <span key={genre} className="px-3 py-1 rounded-full bg-white/10 text-white/80 text-xs font-medium border border-white/10">
                  {genre}
                </span>
              ))}
            </div>

            <p className="text-gray-300 text-lg leading-relaxed max-w-3xl">
              {series.synopsis}
            </p>
          </div>
        </div>
        
        {/* Episodes Section */}
        <div className="mt-16">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 border-b border-white/10 pb-4">
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <span className="w-1.5 h-6 bg-primary rounded-full inline-block"></span>
              Episodios
            </h2>
            
            <select 
              value={selectedSeason}
              onChange={(e) => setSelectedSeason(Number(e.target.value))}
              className="flex h-10 w-full sm:w-48 rounded-md border border-input bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {series.seasons?.map(season => (
                <option key={season.number} value={season.number}>
                  Temporada {season.number}
                </option>
              ))}
            </select>
          </div>

          {!currentSeason || currentSeason.episodes.length === 0 ? (
            <p className="text-muted-foreground text-center py-10">No hay episodios disponibles.</p>
          ) : (
            <div className="grid gap-4">
              {currentSeason.episodes.map(episode => (
                <div key={episode.number} className="group bg-card/50 hover:bg-card border border-white/5 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center gap-4 transition-colors">
                  <div className="text-2xl font-bold text-white/20 w-12 text-center shrink-0">
                    {episode.number}
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold group-hover:text-primary transition-colors">{episode.title}</h3>
                    <p className="text-sm text-muted-foreground">{episode.duration_min} min</p>
                  </div>
                  <div className="w-full sm:w-auto mt-4 sm:mt-0">
                    <Link 
                      href={`/player?url=${encodeURIComponent(episode.video_sources[0]?.url || '')}&title=${encodeURIComponent(`${series.title} - T${currentSeason.number}E${episode.number}`)}`}
                      className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-white/10 hover:bg-primary text-white px-6 py-2 rounded-full font-medium transition-all"
                    >
                      <Play fill="currentColor" className="w-4 h-4" />
                      Reproducir
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
