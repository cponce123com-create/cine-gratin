import { Link } from "react-router-dom";
import type { Movie, Series } from "@/lib/types";

interface MediaCardProps {
  item: Movie | Series;
  type: "movie" | "series";
  size?: "sm" | "md" | "lg";
}

const FALLBACK_POSTER =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='300' viewBox='0 0 200 300'%3E%3Crect width='200' height='300' fill='%231a1a1a'/%3E%3Ctext x='100' y='150' font-family='sans-serif' font-size='14' fill='%23555' text-anchor='middle' dominant-baseline='middle'%3ESin imagen%3C/text%3E%3C/svg%3E";

export default function MediaCard({ item, type, size = "md" }: MediaCardProps) {
  const href = type === "movie" ? `/pelicula/${item.id}` : `/serie/${item.id}`;

  const sizeClasses = {
    sm: "w-32 md:w-36",
    md: "w-36 md:w-44",
    lg: "w-44 md:w-52",
  };

  return (
    <Link to={href} className={`group flex-shrink-0 ${sizeClasses[size]}`}>
      <div className="relative overflow-hidden rounded-lg bg-brand-surface card-hover">
        {/* Poster */}
        <div className="aspect-[2/3] w-full">
          <img
            src={item.poster_url || FALLBACK_POSTER}
            alt={item.title}
            loading="lazy"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).src = FALLBACK_POSTER;
            }}
            className="w-full h-full object-cover"
          />
        </div>

        {/* Hover overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-3">
          <p className="text-white text-xs font-semibold line-clamp-2 leading-snug">
            {item.title}
          </p>
          {item.rating !== undefined && (
            <div className="flex items-center gap-1 mt-1">
              <span className="text-brand-gold text-xs">&#9733;</span>
              <span className="text-gray-300 text-xs">{Number(item.rating).toFixed(1)}</span>
            </div>
          )}
          {item.year && (
            <span className="text-gray-400 text-xs mt-0.5">{item.year}</span>
          )}
        </div>

        {/* Rating badge */}
        {item.rating !== undefined && (
          <div className="absolute top-2 right-2 bg-black/70 backdrop-blur-sm rounded px-1.5 py-0.5 flex items-center gap-0.5 opacity-0 group-hover:opacity-0">
          </div>
        )}
      </div>
      <p className="mt-2 text-xs text-gray-400 truncate px-0.5 group-hover:text-gray-200 transition-colors">
        {item.title}
      </p>
    </Link>
  );
}
