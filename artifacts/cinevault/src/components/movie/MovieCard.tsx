import { Link } from "wouter";
import { Star, Play } from "lucide-react";
import { Movie } from "@/lib/yts";

export interface RecentlyWatchedMovie {
  id: number;
  slug: string;
  title: string;
  year: number;
  rating: number;
  medium_cover_image: string;
}

interface MovieCardProps {
  movie: Movie | RecentlyWatchedMovie;
  onSaveRecent?: (movie: RecentlyWatchedMovie) => void;
}

export function MovieCard({ movie, onSaveRecent }: MovieCardProps) {
  const posterUrl = movie.medium_cover_image || `https://yts.mx/assets/images/movies/${movie.slug}/medium-cover.jpg`;
  
  const handleClick = () => {
    if (onSaveRecent) {
      onSaveRecent({
        id: movie.id,
        slug: movie.slug,
        title: movie.title,
        year: movie.year,
        rating: movie.rating,
        medium_cover_image: posterUrl
      });
    }
  };

  const primaryGenre = 'genres' in movie && movie.genres && movie.genres.length > 0 
    ? movie.genres[0] 
    : null;

  return (
    <Link 
      href={`/movie/${movie.id}`} 
      onClick={handleClick}
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
          (e.target as HTMLImageElement).src = "https://placehold.co/400x600/12121a/333333?text=No+Poster";
        }}
      />

      {/* Badges */}
      <div className="absolute top-3 left-3 right-3 flex justify-between items-start pointer-events-none">
        {primaryGenre && (
          <span className="bg-primary/90 text-primary-foreground text-[10px] font-bold px-2 py-1 rounded shadow-sm backdrop-blur-md uppercase tracking-wider">
            {primaryGenre}
          </span>
        )}
        <span className="bg-black/80 text-white text-xs font-bold px-2 py-1 rounded shadow-sm backdrop-blur-md flex items-center gap-1 border border-white/10">
          <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
          {movie.rating.toFixed(1)}
        </span>
      </div>

      {/* Hover Overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-4 translate-y-4 group-hover:translate-y-0">
        <h3 className="font-heading text-xl text-white line-clamp-2 leading-tight mb-1">
          {movie.title}
        </h3>
        <p className="text-muted-foreground text-sm mb-3">{movie.year}</p>
        
        <div className="flex items-center justify-center gap-2 bg-primary text-primary-foreground py-2 rounded font-bold uppercase tracking-widest text-sm transition-transform active:scale-95">
          <Play className="w-4 h-4 fill-current" />
          Watch Now
        </div>
      </div>
    </Link>
  );
}

export function MovieCardSkeleton() {
  return (
    <div className="w-full aspect-[2/3] rounded-xl bg-card border border-border overflow-hidden animate-pulse">
      <div className="w-full h-full bg-muted/50"></div>
    </div>
  );
}
