import { Link } from "wouter";
import { Play } from "lucide-react";
import { cn } from "@/lib/utils";

interface MediaCardProps {
  id: string;
  title: string;
  posterUrl: string;
  year?: number;
  type: "movie" | "series";
  className?: string;
}

export function MediaCard({ id, title, posterUrl, year, type, className }: MediaCardProps) {
  const href = type === "movie" ? `/pelicula/${id}` : `/serie/${id}`;

  return (
    <Link href={href} className={cn("group block relative overflow-hidden rounded-lg bg-card transition-transform duration-300 hover:scale-105 hover:z-10", className)}>
      <div className="aspect-[2/3] w-full overflow-hidden bg-muted">
        <img
          src={posterUrl}
          alt={title}
          loading="lazy"
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
          onError={(e) => {
            const target = e.target as HTMLImageElement;
            target.src = "https://via.placeholder.com/400x600/1a1a1a/e5e5e5?text=No+Poster";
          }}
        />
        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
          <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center text-primary-foreground transform scale-50 group-hover:scale-100 transition-transform duration-300">
            <Play fill="currentColor" className="w-5 h-5 ml-1" />
          </div>
        </div>
      </div>
      <div className="absolute bottom-0 w-full p-4 bg-gradient-to-t from-black/90 via-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300">
        <h3 className="font-semibold text-white line-clamp-1">{title}</h3>
        {year && <p className="text-xs text-gray-300">{year}</p>}
      </div>
    </Link>
  );
}
