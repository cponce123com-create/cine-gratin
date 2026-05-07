import { useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { fetchSagas, type SagaItem } from "@/lib/api";
import SectionSkeleton from "./SectionSkeleton";

export default function SagasSection() {
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: sagas = [], isLoading } = useQuery<SagaItem[]>({
    queryKey: ["sagas"],
    queryFn: fetchSagas,
    staleTime: 30 * 60 * 1000,
  });

  if (isLoading) return <SectionSkeleton title="Sagas" />;
  if (sagas.length === 0) return null;

  const scroll = (dir: "left" | "right") => {
    if (!scrollRef.current) return;
    const amount = scrollRef.current.clientWidth * 0.75;
    scrollRef.current.scrollBy({ left: dir === "left" ? -amount : amount, behavior: "smooth" });
  };

  return (
    <section className="mb-10">
      <div className="flex items-center justify-between mb-4 px-4 sm:px-6 lg:px-8">
        <h2 className="text-lg sm:text-xl font-bold text-white flex items-center gap-3">
          <span className="w-2 h-7 bg-brand-red rounded-full" />
          Sagas
        </h2>
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
        {sagas.map((saga) => (
          <Link
            key={saga.id}
            to={`/saga/${saga.id}`}
            className="group flex-shrink-0 w-44 md:w-52"
          >
            <div className="relative overflow-hidden rounded-lg bg-brand-surface card-hover">
              <div className="aspect-[2/3] w-full relative">
                {saga.poster_path ? (
                  <img
                    src={saga.poster_path}
                    alt={saga.name}
                    loading="lazy"
                    className="w-full h-full object-cover transition-opacity duration-300"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-brand-surface">
                    <span className="text-gray-500 text-xs">{saga.name}</span>
                  </div>
                )}
              </div>

              {/* Part count badge */}
              <div className="absolute top-1.5 right-1.5 bg-black/70 backdrop-blur-sm rounded-md px-1.5 py-0.5">
                <span className="text-white text-[10px] font-bold">{saga.part_count} {saga.part_count === 1 ? "film" : "films"}</span>
              </div>

              {/* Hover overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-3">
                <p className="text-white text-xs font-semibold line-clamp-2 leading-snug">
                  {saga.name}
                </p>
              </div>
            </div>
            <p className="mt-2 text-xs text-gray-400 truncate px-0.5 group-hover:text-gray-200 transition-colors">
              {saga.name}
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
}
