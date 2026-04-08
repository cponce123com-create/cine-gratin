import { Link } from "react-router-dom";
import type { Movie, Series } from "@/lib/types";
import { optimizeImageUrl, tmdbSrcSet } from "@/lib/utils";

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

  const posterSize = size === "sm" ? "small" : size === "lg" ? "large" : "medium";
  const posterUrl = optimizeImageUrl(item.poster_url, posterSize);
  const posterSrcSet = tmdbSrcSet(item.poster_url);
  const posterSizes = size === "sm" ? "128px" : size === "lg" ? "(max-width:640px) 176px, 208px" : "(max-width:640px) 144px, 176px";

  const hasRating = item.rating !== undefined && item.rating !== null && Number(item.rating) > 0;

  return (
    <Link to={href} className={`group flex-shrink-0 carousel-item ${sizeClasses[size]}`}>
      <div className="relative overflow-hidden rounded-lg bg-brand-surface card-hover">
        {/* Poster */}
        <div className="aspect-[2/3] w-full relative">
          <img
            src={posterUrl || FALLBACK_POSTER}
            srcSet={posterSrcSet || undefined}
            sizes={posterSrcSet ? posterSizes : undefined}
            alt={item.title}
            loading="lazy"
            decoding="async"
            fetchPriority="low"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).src = FALLBACK_POSTER;
            }}
            className="w-full h-full object-cover transition-opacity duration-300"
          />
        </div>

        {/* Rating badge — always visible, top-right corner */}
        {hasRating && (
          <div className="absolute top-1.5 right-1.5 bg-black/70 backdrop-blur-sm rounded-md px-1.5 py-0.5 flex items-center gap-0.5">
            <span className="text-brand-gold text-[10px] leading-none">★</span>
            <span className="text-white text-[10px] font-bold leading-none">
              {Number(item.rating).toFixed(1)}
            </span>
          </div>
        )}

        {/* Hover overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-3">
          <p className="text-white text-xs font-semibold line-clamp-2 leading-snug">
            {item.title}
          </p>
          {item.year && (
            <span className="text-gray-400 text-xs mt-0.5">{item.year}</span>
          )}
        </div>
      </div>
      <p className="mt-2 text-xs text-gray-400 truncate px-0.5 group-hover:text-gray-200 transition-colors">
        {item.title}
      </p>
    </Link>
  );
}
