import { Link } from "wouter";
import { Star, Play, Heart } from "lucide-react";
import { LocalMovie } from "@/lib/admin-db";
import { useLocalStorage } from "@/hooks/use-local-storage";

interface MovieCardProps {
  movie: LocalMovie;
  onSaveRecent?: () => void;
  isRecent?: boolean;
}

export function MovieCard({ movie, onSaveRecent, isRecent }: MovieCardProps) {
  const posterUrl =
    movie.poster_url ||
    "https://placehold.co/400x600/12121a/333333?text=Sin+Poster";

  const [favorites, setFavorites] = useLocalStorage<string[]>("cv_favorites", []);
  const isFavorited = favorites.includes(movie.id);

  const quality = movie.torrents?.[0]?.quality || "";
  const primaryGenre = movie.genres?.[0] || null;

  const handleFavoriteToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setFavorites((prev) =>
      isFavorited ? prev.filter((id) => id !== movie.id) : [...prev, movie.id]
    );
  };

  return (
    <Link
      href={`/movie/${movie.id}`}
      onClick={onSaveRecent}
      className="group relative block w-full aspect-[2/3] rounded-xl overflow-hidden bg-card border border-border shadow-md transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_0_20px_rgba(0,212,255,0.3)] hover:z-10 focus:outline-none focus:ring-2 focus:ring-primary"
      data-testid={`movie-card-${movie.id}`}
    >
      {/* Poster */}
      <img
        src={posterUrl}
        alt={`${movie.title} poster`}
        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
        loading="lazy"
        onError={(e) => {
          (e.target as HTMLImageElement).src =
            "https://placehold.co/400x600/12121a/333333?text=Sin+Poster";
        }}
      />

      {/* Badges */}
      <div className="absolute top-3 left-3 right-3 flex justify-between items-start pointer-events-none">
        {primaryGenre ? (
          <span className="bg-primary/90 text-primary-foreground text-[10px] font-bold px-2 py-1 rounded shadow backdrop-blur-md uppercase tracking-wider max-w-[45%] truncate">
            {primaryGenre}
          </span>
        ) : (
          <span />
        )}
        <div className="flex flex-col items-end gap-1">
          {quality && (
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded shadow backdrop-blur-md uppercase tracking-wider ${
                quality.includes("2160")
                  ? "bg-yellow-500/90 text-black"
                  : "bg-blue-600/90 text-white"
              }`}
            >
              {quality.includes("2160") ? "4K" : quality}
            </span>
          )}
          {movie.rating > 0 && (
            <span className="bg-black/80 text-white text-xs font-bold px-2 py-1 rounded shadow backdrop-blur-md flex items-center gap-1 border border-white/10">
              <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
              {movie.rating.toFixed(1)}
            </span>
          )}
        </div>
      </div>

      {/* Favorite button */}
      <button
        onClick={handleFavoriteToggle}
        className={`absolute bottom-3 right-3 w-8 h-8 rounded-full flex items-center justify-center z-20 transition-all duration-200 ${
          isFavorited
            ? "bg-red-500/90 text-white opacity-100 scale-100"
            : "bg-black/60 text-white opacity-0 group-hover:opacity-100 hover:bg-red-500/80 backdrop-blur-md border border-white/10"
        }`}
        data-testid={`btn-favorite-${movie.id}`}
        aria-label={isFavorited ? "Quitar de favoritos" : "Agregar a favoritos"}
      >
        <Heart className={`w-4 h-4 ${isFavorited ? "fill-current" : ""}`} />
      </button>

      {/* Hover overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-300 flex flex-col justify-end p-4 translate-y-4 group-hover:translate-y-0">
        <h3 className="font-heading text-xl text-white line-clamp-2 leading-tight mb-1">
          {movie.title}
        </h3>
        <p className="text-muted-foreground text-sm mb-3">{movie.year}</p>
        <div className="flex items-center justify-center gap-2 bg-primary text-primary-foreground py-2 rounded font-bold uppercase tracking-widest text-sm transition-transform active:scale-95">
          <Play className="w-4 h-4 fill-current" />
          {isRecent ? "Reanudar" : "Ver Ahora"}
        </div>
      </div>
    </Link>
  );
}

export function MovieCardSkeleton() {
  return (
    <div className="w-full aspect-[2/3] rounded-xl bg-card border border-border overflow-hidden animate-pulse">
      <div className="w-full h-full bg-muted/50" />
    </div>
  );
}
