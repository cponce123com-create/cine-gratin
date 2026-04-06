import { useMovieList } from "@/lib/yts";
import { MovieCard, MovieCardSkeleton, RecentlyWatchedMovie } from "@/components/movie/MovieCard";
import { PageTransition } from "@/components/layout/PageTransition";
import { Search } from "lucide-react";
import { useLocalStorage } from "@/hooks/use-local-storage";

interface SearchProps {
  params: {
    query: string;
  };
}

export default function SearchPage({ params }: SearchProps) {
  const query = decodeURIComponent(params.query || "");
  const { data, loading, error } = useMovieList({ query_term: query, limit: 20 });
  const [, setRecentMovies] = useLocalStorage<RecentlyWatchedMovie[]>("cv_recently_watched", []);

  const handleSaveRecent = (movie: RecentlyWatchedMovie) => {
    setRecentMovies(prev => {
      const filtered = prev.filter(m => m.id !== movie.id);
      return [movie, ...filtered].slice(0, 6);
    });
  };

  return (
    <PageTransition>
      <div className="min-h-screen pt-32 pb-20 px-4 md:px-8 max-w-[1600px] mx-auto">
        <div className="mb-10">
          <h1 className="text-4xl font-heading tracking-wide flex items-center gap-3">
            <span className="w-1.5 h-8 bg-primary block rounded-full"></span>
            Resultados de Búsqueda
          </h1>
          <p className="text-muted-foreground mt-2 text-lg">
            Resultados para <span className="text-primary font-bold">"{query}"</span>
          </p>
        </div>

        {error && (
          <div className="py-20 text-center">
            <h2 className="text-2xl font-heading text-destructive mb-2">Error de Búsqueda</h2>
            <p className="text-muted-foreground">{error.message}</p>
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-6">
          {loading ? (
            Array.from({ length: 12 }).map((_, i) => (
              <MovieCardSkeleton key={`skel-${i}`} />
            ))
          ) : data?.movies?.length ? (
            data.movies.map((movie) => (
              <MovieCard key={movie.id} movie={movie} onSaveRecent={handleSaveRecent} />
            ))
          ) : null}
        </div>

        {!loading && (!data?.movies || data.movies.length === 0) && !error && (
          <div className="py-32 text-center flex flex-col items-center justify-center animate-in fade-in slide-in-from-bottom-8">
            <div className="w-32 h-32 mb-8 rounded-full bg-card border border-border flex items-center justify-center shadow-[0_0_30px_rgba(0,0,0,0.5)]">
              <Search className="w-12 h-12 text-muted-foreground opacity-50" />
            </div>
            <h2 className="text-4xl font-heading tracking-widest text-muted-foreground mb-4">
              SIN RESULTADOS
            </h2>
            <p className="text-muted-foreground text-lg max-w-md mx-auto">
              No encontramos coincidencias para "{query}". Revisa la ortografía o intenta con otro término.
            </p>
          </div>
        )}
      </div>
    </PageTransition>
  );
}
