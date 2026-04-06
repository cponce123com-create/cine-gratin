import { useEffect, useState } from "react";
import { LocalMovie } from "@/lib/admin-db";
import { apiSearchMovies, apiSearchSeries, type LocalSeries } from "@/lib/api-client";
import { MovieCard } from "@/components/movie/MovieCard";
import { PageTransition } from "@/components/layout/PageTransition";
import { Search, Film, Tv } from "lucide-react";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { useLocation } from "wouter";

interface SearchProps {
  params: { query: string };
}

interface WatchedEntry {
  id: string;
  timestamp: number;
}

type Tab = "all" | "movies" | "series";

function SeriesResultCard({ series }: { series: LocalSeries }) {
  const [, setLocation] = useLocation();
  return (
    <button
      onClick={() => setLocation(`/series/${series.id}`)}
      className="group relative block w-full aspect-[2/3] rounded-xl overflow-hidden bg-card border border-border shadow-md transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_0_20px_rgba(0,212,255,0.3)] hover:z-10 text-left"
    >
      <img
        src={series.poster_url || "https://placehold.co/400x600/12121a/333333?text=Sin+Poster"}
        alt={series.title}
        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
        loading="lazy"
        onError={e => { (e.target as HTMLImageElement).src = "https://placehold.co/400x600/12121a/333333?text=Sin+Poster"; }}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
      <div className="absolute top-2 left-2">
        <span className="bg-blue-500/90 text-white text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider">Serie</span>
      </div>
      <div className="absolute bottom-0 left-0 right-0 p-3">
        <p className="text-white font-bold text-xs line-clamp-2">{series.title}</p>
        <p className="text-white/60 text-[10px] mt-0.5">{series.year} · T{series.total_seasons}</p>
      </div>
    </button>
  );
}

export default function SearchPage({ params }: SearchProps) {
  const query = decodeURIComponent(params.query || "");
  const [movies, setMovies] = useState<LocalMovie[]>([]);
  const [series, setSeries] = useState<LocalSeries[]>([]);
  const [tab, setTab] = useState<Tab>("all");
  const [loading, setLoading] = useState(false);
  const [, setWatched] = useLocalStorage<WatchedEntry[]>("cv_recently_watched", []);

  useEffect(() => {
    if (!query.trim()) { setMovies([]); setSeries([]); return; }
    setLoading(true);
    document.title = `"${query}" — Cine Gratín`;
    Promise.all([
      apiSearchMovies(query).catch(() => [] as LocalMovie[]),
      apiSearchSeries(query).catch(() => [] as LocalSeries[]),
    ]).then(([m, s]) => {
      setMovies(m);
      setSeries(s);
    }).finally(() => setLoading(false));
  }, [query]);

  const handleSaveRecent = (id: string) => {
    setWatched(prev => {
      const filtered = prev.filter(w => w.id !== id);
      return [{ id, timestamp: Date.now() }, ...filtered].slice(0, 10);
    });
  };

  const totalResults = movies.length + series.length;

  const tabs: { id: Tab; label: string; icon: React.ReactNode; count: number }[] = [
    { id: "all", label: "Todo", icon: <Search className="w-4 h-4" />, count: totalResults },
    { id: "movies", label: "Películas", icon: <Film className="w-4 h-4" />, count: movies.length },
    { id: "series", label: "Series", icon: <Tv className="w-4 h-4" />, count: series.length },
  ];

  return (
    <PageTransition>
      <div className="min-h-screen pt-32 pb-20 px-4 md:px-8 max-w-[1600px] mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-heading tracking-wide flex items-center gap-3">
            <span className="w-1.5 h-8 bg-primary block rounded-full" />
            Resultados de Búsqueda
          </h1>
          <p className="text-muted-foreground mt-2 text-lg">
            {loading ? "Buscando..." : (
              totalResults > 0
                ? <><span className="text-primary font-bold">{totalResults}</span> resultado{totalResults !== 1 ? "s" : ""} para <span className="text-primary font-bold">"{query}"</span></>
                : <>Sin resultados para <span className="text-primary font-bold">"{query}"</span></>
            )}
          </p>
        </div>

        {/* Tabs */}
        {totalResults > 0 && (
          <div className="flex gap-2 mb-8 border-b border-border pb-3">
            {tabs.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                  tab === t.id
                    ? "bg-primary/10 text-primary border border-primary/30"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                }`}
              >
                {t.icon}
                {t.label}
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-mono ${
                  tab === t.id ? "bg-primary/20 text-primary" : "bg-secondary text-muted-foreground"
                }`}>{t.count}</span>
              </button>
            ))}
          </div>
        )}

        {/* Movies section */}
        {(tab === "all" || tab === "movies") && movies.length > 0 && (
          <div className="mb-12">
            {tab === "all" && (
              <h2 className="text-xl font-heading tracking-wide mb-4 flex items-center gap-2 text-foreground">
                <Film className="w-5 h-5 text-primary" />
                Películas
                <span className="text-xs text-muted-foreground font-normal ml-1">({movies.length})</span>
              </h2>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-6">
              {movies.map(movie => (
                <MovieCard
                  key={movie.id}
                  movie={movie}
                  onSaveRecent={() => handleSaveRecent(movie.id)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Series section */}
        {(tab === "all" || tab === "series") && series.length > 0 && (
          <div className="mb-12">
            {tab === "all" && (
              <h2 className="text-xl font-heading tracking-wide mb-4 flex items-center gap-2 text-foreground">
                <Tv className="w-5 h-5 text-primary" />
                Series
                <span className="text-xs text-muted-foreground font-normal ml-1">({series.length})</span>
              </h2>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-6">
              {series.map(s => (
                <SeriesResultCard key={s.id} series={s} />
              ))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {!loading && totalResults === 0 && query.trim() && (
          <div className="py-32 text-center flex flex-col items-center justify-center animate-in fade-in slide-in-from-bottom-8">
            <div className="w-32 h-32 mb-8 rounded-full bg-card border border-border flex items-center justify-center shadow-[0_0_30px_rgba(0,0,0,0.5)]">
              <Search className="w-12 h-12 text-muted-foreground opacity-50" />
            </div>
            <h2 className="text-4xl font-heading tracking-widest text-muted-foreground mb-4">SIN RESULTADOS</h2>
            <p className="text-muted-foreground text-lg max-w-md mx-auto">
              No encontramos coincidencias para "{query}". Revisa la ortografía o intenta con otro término.
            </p>
          </div>
        )}
      </div>
    </PageTransition>
  );
}
