import { useRef } from "react";
import { Link } from "react-router-dom";
import type { Movie, Series } from "@/lib/types";
import MediaCard from "./MediaCard";

export interface MixedItem {
  item: Movie | Series;
  type: "movie" | "series";
}

interface GenreCarouselProps {
  id?: string;
  title: string;
  items: MixedItem[];
  viewAllLink?: string;
}

export default function GenreCarousel({ id, title, items, viewAllLink }: GenreCarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  if (items.length === 0) return null;

  const scroll = (dir: "left" | "right") => {
    if (!scrollRef.current) return;
    const amount = scrollRef.current.clientWidth * 0.75;
    scrollRef.current.scrollBy({ left: dir === "left" ? -amount : amount, behavior: "smooth" });
  };

  return (
    <section id={id ? `genre-${id}` : undefined} className="mb-10 scroll-mt-4">
      <div className="flex items-center justify-between mb-4 px-4 sm:px-6 lg:px-8">
        <h2 className="text-lg sm:text-xl font-bold text-white">{title}</h2>
        <div className="flex gap-2">
          <button
            onClick={() => scroll("left")}
            aria-label="Anterior"
            className="w-8 h-8 rounded-full bg-brand-surface border border-brand-border text-gray-300 hover:text-white hover:border-gray-500 transition-colors flex items-center justify-center text-sm"
          >
            &#8249;
          </button>
          <button
            onClick={() => scroll("right")}
            aria-label="Siguiente"
            className="w-8 h-8 rounded-full bg-brand-surface border border-brand-border text-gray-300 hover:text-white hover:border-gray-500 transition-colors flex items-center justify-center text-sm"
          >
            &#8250;
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex gap-3 overflow-x-auto carousel-scroll px-4 sm:px-6 lg:px-8 pb-2"
      >
        {items.map(({ item, type }) => (
          <MediaCard key={`${type}-${item.id}`} item={item} type={type} size="md" />
        ))}
        
        {viewAllLink && (
          <Link
            to={viewAllLink}
            className="flex-shrink-0 w-[140px] sm:w-[180px] aspect-[2/3] rounded-lg bg-brand-surface border border-brand-border flex flex-col items-center justify-center gap-3 group hover:border-brand-red transition-all"
          >
            <div className="w-12 h-12 rounded-full bg-brand-dark border border-brand-border flex items-center justify-center group-hover:bg-brand-red group-hover:border-brand-red transition-all">
              <svg className="w-6 h-6 text-gray-400 group-hover:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
            <span className="text-sm font-bold text-gray-400 group-hover:text-white">Ver todo</span>
          </Link>
        )}
      </div>
    </section>
  );
}
