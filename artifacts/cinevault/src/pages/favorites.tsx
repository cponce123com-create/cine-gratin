import { Heart, Trash2 } from "lucide-react";
import { PageTransition } from "@/components/layout/PageTransition";
import { MovieCard } from "@/components/movie/MovieCard";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { FavoriteMovie, RecentlyWatchedMovie } from "@/lib/yts";

export default function Favorites() {
  const [favorites, setFavorites] = useLocalStorage<FavoriteMovie[]>("cv_favorites", []);
  const [, setRecentMovies] = useLocalStorage<RecentlyWatchedMovie[]>("cv_recently_watched", []);

  const handleSaveRecent = (movie: RecentlyWatchedMovie) => {
    setRecentMovies(prev => {
      const filtered = prev.filter(m => m.id !== movie.id);
      return [movie, ...filtered].slice(0, 10);
    });
  };

  const clearAll = () => {
    if (confirm("¿Eliminar todas las películas de Mi Lista?")) {
      setFavorites([]);
    }
  };

  return (
    <PageTransition>
      <div className="min-h-screen pt-24 pb-20 px-4 md:px-8 max-w-[1600px] mx-auto">
        <div className="flex items-center justify-between mb-8 gap-4">
          <h1 className="text-4xl font-heading tracking-wide flex items-center gap-3">
            <span className="w-1.5 h-8 bg-red-500 block rounded-full"></span>
            <Heart className="w-8 h-8 text-red-500 fill-red-500" />
            Mi Lista
            {favorites.length > 0 && (
              <span className="text-xl text-muted-foreground font-sans">
                ({favorites.length} {favorites.length === 1 ? "película" : "películas"})
              </span>
            )}
          </h1>

          {favorites.length > 0 && (
            <button
              onClick={clearAll}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-destructive transition-colors border border-border hover:border-destructive/50 px-4 py-2 rounded-lg"
              data-testid="btn-clear-favorites"
            >
              <Trash2 className="w-4 h-4" />
              Borrar Todo
            </button>
          )}
        </div>

        {favorites.length === 0 ? (
          <div className="py-32 text-center flex flex-col items-center justify-center">
            <div className="w-28 h-28 mb-6 rounded-full bg-card border border-border flex items-center justify-center">
              <Heart className="w-12 h-12 text-muted-foreground" />
            </div>
            <h2 className="text-3xl font-heading tracking-widest text-muted-foreground mb-3">Tu Lista está Vacía</h2>
            <p className="text-muted-foreground max-w-md mx-auto leading-relaxed">
              Pasa el cursor sobre cualquier película y haz clic en el corazón para guardarla aquí.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-6">
            {favorites.map(movie => (
              <MovieCard
                key={movie.id}
                movie={movie}
                onSaveRecent={handleSaveRecent}
              />
            ))}
          </div>
        )}
      </div>
    </PageTransition>
  );
}
