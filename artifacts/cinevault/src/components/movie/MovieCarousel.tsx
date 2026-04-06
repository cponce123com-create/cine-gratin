import { useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface MovieCarouselProps {
  title: string;
  children: React.ReactNode;
  viewAllLink?: string;
  titleIcon?: React.ReactNode;
}

export function MovieCarousel({ title, children, viewAllLink, titleIcon }: MovieCarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: "left" | "right") => {
    if (scrollRef.current) {
      const { scrollLeft, clientWidth } = scrollRef.current;
      const scrollTo = direction === "left" 
        ? scrollLeft - clientWidth * 0.75 
        : scrollLeft + clientWidth * 0.75;
      
      scrollRef.current.scrollTo({ left: scrollTo, behavior: "smooth" });
    }
  };

  return (
    <div className="w-full py-6">
      <div className="flex items-end justify-between px-6 md:px-10 mb-4">
        <h2 className="text-3xl font-heading text-foreground tracking-wide flex items-center gap-3">
          <span className="w-1.5 h-6 bg-primary block rounded-full"></span>
          {titleIcon && <span className="opacity-70">{titleIcon}</span>}
          {title}
        </h2>
        {viewAllLink && (
          <a href={viewAllLink} className="text-sm text-primary hover:text-white transition-colors font-medium uppercase tracking-wider">
            Ver Todo
          </a>
        )}
      </div>

      <div className="relative group">
        <button 
          onClick={() => scroll("left")}
          className="absolute left-0 top-0 bottom-0 w-12 z-20 flex items-center justify-center bg-gradient-to-r from-background to-transparent opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-0 focus:outline-none"
          aria-label="Desplazar izquierda"
        >
          <div className="w-8 h-8 rounded-full bg-black/50 border border-white/10 flex items-center justify-center backdrop-blur-md text-white hover:bg-primary hover:text-primary-foreground hover:scale-110 transition-all">
            <ChevronLeft className="w-5 h-5" />
          </div>
        </button>

        <div 
          ref={scrollRef}
          className="flex overflow-x-auto gap-4 md:gap-6 px-6 md:px-10 pb-6 pt-2 snap-x snap-mandatory scrollbar-none"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {children}
        </div>

        <button 
          onClick={() => scroll("right")}
          className="absolute right-0 top-0 bottom-0 w-12 z-20 flex items-center justify-center bg-gradient-to-l from-background to-transparent opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-0 focus:outline-none"
          aria-label="Desplazar derecha"
        >
          <div className="w-8 h-8 rounded-full bg-black/50 border border-white/10 flex items-center justify-center backdrop-blur-md text-white hover:bg-primary hover:text-primary-foreground hover:scale-110 transition-all">
            <ChevronRight className="w-5 h-5" />
          </div>
        </button>
      </div>
    </div>
  );
}
