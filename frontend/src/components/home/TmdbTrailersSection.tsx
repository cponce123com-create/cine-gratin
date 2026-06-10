import { useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import type { TmdbTrailerItem } from "./types";

const BASE_URL =
  (import.meta.env["VITE_API_URL"] as string | undefined) || "https://cine-gratin.onrender.com";

async function fetchTmdbTrailers(type: string): Promise<TmdbTrailerItem[]> {
  const res = await fetch(`${BASE_URL}/api/tmdb/trailers?type=${type}`);
  if (!res.ok) return [];
  return res.json();
}

const TABS = [
  { id: "popular", label: "Popular" },
  { id: "streaming", label: "Streaming" },
  { id: "theatres", label: "En cines" },
];

export default function TmdbTrailersSection() {
  const [activeTab, setActiveTab] = useState("popular");
  const [activeTrailer, setActiveTrailer] = useState<string | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["tmdb-trailers", activeTab],
    queryFn: () => fetchTmdbTrailers(activeTab),
    staleTime: 30 * 60 * 1000,
  });

  const closeModal = () => setActiveTrailer(null);

  return (
    <div className="px-4 sm:px-6 lg:px-8 mb-10">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h2 className="text-xl sm:text-2xl font-black text-white flex items-center gap-3">
          <span className="w-2 h-7 bg-brand-red rounded-full" />
          Últimos Tráileres
        </h2>
        <div className="flex gap-1 bg-brand-surface border border-brand-border rounded-full p-0.5">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${
                activeTab === tab.id ? "bg-brand-red text-white" : "text-gray-400 hover:text-white"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex gap-3 overflow-hidden">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="flex-shrink-0 w-56 sm:w-64 h-36 sm:h-40 bg-brand-surface rounded-xl animate-pulse"
            />
          ))}
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
          {items.map((item) => (
            <button
              key={item.tmdb_id}
              onClick={() => setActiveTrailer(item.trailer_key)}
              className="flex-shrink-0 w-56 sm:w-64 group text-left"
            >
              <div className="relative rounded-xl overflow-hidden bg-brand-surface aspect-video">
                <img
                  src={item.backdrop_url || item.thumbnail_url}
                  alt={item.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-black/30 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                  <div className="w-12 h-12 rounded-full bg-white/90 group-hover:bg-white group-hover:scale-110 transition-all flex items-center justify-center shadow-lg">
                    <svg className="w-5 h-5 text-black ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </div>
                </div>
              </div>
              <p className="mt-1.5 text-xs font-semibold text-gray-200 truncate group-hover:text-white transition-colors">
                {item.title}
              </p>
              <p className="text-[10px] text-gray-500 truncate">{item.trailer_name}</p>
            </button>
          ))}
        </div>
      )}

      {activeTrailer && (
        <div
          ref={modalRef}
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === modalRef.current) closeModal();
          }}
        >
          <div className="relative w-full max-w-4xl">
            <button
              onClick={closeModal}
              className="absolute -top-10 right-0 text-white/70 hover:text-white text-2xl font-bold transition-colors"
            >
              ✕
            </button>
            <div className="relative aspect-video rounded-xl overflow-hidden bg-black shadow-2xl">
              <iframe
                src={`https://www.youtube.com/embed/${activeTrailer}?autoplay=1&rel=0`}
                className="absolute inset-0 w-full h-full"
                allow="autoplay; fullscreen"
                allowFullScreen
                title="Tráiler"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
