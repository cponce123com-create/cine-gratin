import { useState } from "react";
import { useRoute, Link } from "wouter";
import { useSeries } from "@/hooks/useApi";
import { Play, Star, Calendar, ArrowLeft, Tv2 } from "lucide-react";
import type { SeasonData } from "@/lib/types";

function parseSeasons(raw: unknown): SeasonData[] {
  if (!raw) return [];
  if (typeof raw === "string") {
    try { return JSON.parse(raw) as SeasonData[]; } catch { return []; }
  }
  return Array.isArray(raw) ? (raw as SeasonData[]) : [];
}

export default function SeriesDetail() {
  const [, params] = useRoute("/serie/:id");
  const id = params?.id || "";
  const { data: series, loading, error } = useSeries(String(id));
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

  const seasonsData = parseSeasons(series.seasons_data);
  const totalSeasons = series.total_seasons ?? seasonsData.length ?? 1;
  const seasonOptions = Array.from({ length: totalSeasons }, (_, i) => i + 1);
  const currentSeason = seasonsData.find((s) => s.season === selectedSeason);
  const episodesInSeason = currentSeason?.episodes ?? 20;
  const episodeNumbers = Array.from({ length: episodesInSeason }, (_, i) => i + 1);

  const buildPlayerUrl = (ep: number) => {
    if (!series.imdb_id) return null;
    const title = encodeURIComponent(`${series.title} T${selectedSeason}E${ep}`);
    return `/player?imdb=${series.imdb_id}&type=series&season=${selectedSeason}&episode=${ep}&total_eps=${episodesInSeason}&title=${title}`;
  };

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
            <h1 className="text-4xl md:text-5xl font-bold text-white tracking-tight">
              {series.title}
              {(series.year ?? 0) > 0 && (
                <span className="text-white/40 font-normal text-2xl md:text-3xl ml-3">
                  ({series.year}{series.end_year ? `–${series.end_year}` : ""})
                </span>
              )}
            </h1>
            
            <div className="flex flex-wrap items-center justify-center md:justify-start gap-4 text-sm md:text-base text-gray-300">
              {(series.rating ?? 0) > 0 && (
                <div className="flex items-center gap-1.5 text-yellow-500 font-semibold">
                  <Star className="w-5 h-5 fill-current" />
                  <span>{series.rating}</span>
                </div>
              )}
              {(series.year ?? 0) > 0 && (
                <>
                  <span className="hidden md:inline text-white/20">•</span>
                  <div className="flex items-center gap-1.5">
                    <Calendar className="w-4 h-4" />
                    <span>{series.year}</span>
                  </div>
                </>
              )}
              {totalSeasons > 0 && (
                <>
                  <span className="hidden md:inline text-white/20">•</span>
                  <div className="flex items-center gap-1.5">
                    <Tv2 className="w-4 h-4" />
                    <span>{totalSeasons} Temporada{totalSeasons !== 1 ? "s" : ""}</span>
                  </div>
                </>
              )}
            </div>

            {series.genres && series.genres.length > 0 && (
              <div className="flex flex-wrap justify-center md:justify-start gap-2">
                {series.genres.map(genre => (
                  <span key={genre} className="px-3 py-1 rounded-full bg-white/10 text-white/80 text-xs font-medium border border-white/10">
                    {genre}
                  </span>
                ))}
              </div>
            )}

            {series.synopsis && (
              <p className="text-gray-300 text-lg leading-relaxed max-w-3xl">
                {series.synopsis}
              </p>
            )}
          </div>
        </div>
        
        {/* Episodes Section */}
        <div className="mt-16">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 border-b border-white/10 pb-4">
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <span className="w-1.5 h-6 bg-primary rounded-full inline-block"></span>
              Episodios
            </h2>
            
            {totalSeasons > 1 && (
              <select 
                value={selectedSeason}
                onChange={(e) => setSelectedSeason(Number(e.target.value))}
                className="flex h-10 w-full sm:w-48 rounded-md border border-input bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                {seasonOptions.map(n => {
                  const sd = seasonsData.find((s) => s.season === n);
                  return (
                    <option key={n} value={n}>
                      {sd?.name && sd.name !== `Season ${n}` ? sd.name : `Temporada ${n}`}
                      {sd ? ` (${sd.episodes} eps)` : ""}
                    </option>
                  );
                })}
              </select>
            )}
          </div>

          {!series.imdb_id ? (
            <p className="text-muted-foreground text-center py-10">
              Esta serie no tiene enlace de reproducción disponible.
            </p>
          ) : episodesInSeason === 0 ? (
            <p className="text-muted-foreground text-center py-10">No hay episodios disponibles.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {episodeNumbers.map(ep => {
                const playerUrl = buildPlayerUrl(ep);
                return (
                  <Link
                    key={ep}
                    href={playerUrl ?? "#"}
                    className={`group flex items-center justify-between bg-card/50 hover:bg-primary border border-white/5 hover:border-primary rounded-xl px-4 py-3 transition-all ${!playerUrl ? "pointer-events-none opacity-40" : ""}`}
                  >
                    <span className="text-white/60 group-hover:text-white text-sm font-bold">
                      E{ep}
                    </span>
                    <Play className="w-4 h-4 text-white/40 group-hover:text-white fill-current transition-colors" />
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
