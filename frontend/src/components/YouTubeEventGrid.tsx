import { memo, useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Helmet } from "react-helmet-async";
import { SkeletonGrid } from "@/components/SkeletonCard";
import type { ChannelItem } from "@/lib/channels-api";

const FALLBACK_THUMBNAIL =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='320' height='180' viewBox='0 0 320 180'%3E%3Crect width='320' height='180' fill='%231a1a1a'/%3E%3Ctext x='160' y='90' font-family='sans-serif' font-size='14' fill='%23555' text-anchor='middle' dominant-baseline='middle'%3ESin imagen%3C/text%3E%3C/svg%3E";

interface YouTubeEventGridProps {
  /** Page <title> */
  title: string;
  /** Heading shown above the grid */
  heading: string;
  /** React Query key */
  queryKey: string[];
  /** Fetch function (must respect { limit } param) */
  fetchFn: (params?: { q?: string; limit?: number; offset?: number }) => Promise<ChannelItem[]>;
  /** Shown when items list is empty after a successful load */
  emptyMessage?: string;
  /** Shown on fetch error */
  errorMessage?: string;
}

const YouTubeEventGrid = memo(function YouTubeEventGrid({
  title,
  heading,
  queryKey,
  fetchFn,
  emptyMessage = "No hay eventos disponibles.",
  errorMessage = "No se pudieron cargar los eventos.",
}: YouTubeEventGridProps) {
  const {
    data: items,
    isLoading: loading,
    error,
  } = useQuery({
    queryKey,
    queryFn: () => fetchFn({ limit: 100 }),
    staleTime: 5 * 60 * 1000,
  });

  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    let list = items ?? [];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((e) => e.title.toLowerCase().includes(q));
    }
    return list;
  }, [items, search]);

  const selectedItem = useMemo(() => items?.find((e) => e.yt_id === selectedId), [items, selectedId]);

  return (
    <div className="min-h-screen bg-brand-dark pt-20 pb-16">
      <Helmet>
        <title>{title}</title>
      </Helmet>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-black text-white mb-2">{heading}</h1>
          <p className="text-gray-400 text-sm">
            {items ? `${filtered.length} eventos disponibles` : "Cargando..."}
          </p>
        </div>

        <div className="mb-8">
          <div className="relative max-w-md">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar evento..."
              className="w-full bg-brand-surface border border-brand-border rounded-lg px-4 py-2.5 pl-10 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-gray-500 transition-colors"
            />
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
              <SearchIcon />
            </span>
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
              >
                &times;
              </button>
            )}
          </div>
        </div>

        {selectedId && selectedItem && (
          <div className="mb-12 bg-black rounded-xl overflow-hidden shadow-2xl ring-1 ring-white/10">
            <div className="aspect-video w-full relative">
              <iframe
                src={`https://www.youtube.com/embed/${selectedId}?autoplay=1`}
                title="YouTube video player"
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                className="absolute inset-0 w-full h-full"
              />
            </div>
            <div className="p-4 bg-brand-surface/50 flex justify-between items-center">
              <h2 className="text-lg font-bold text-white">{selectedItem.title}</h2>
              <button
                onClick={() => setSelectedId(null)}
                className="text-gray-400 hover:text-white text-sm font-medium"
              >
                Cerrar reproductor
              </button>
            </div>
          </div>
        )}

        {loading && <SkeletonGrid />}

        {error && (
          <div className="text-center py-20">
            <p className="text-red-400 text-lg">{errorMessage}</p>
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div className="text-center py-20">
            <p className="text-gray-400 text-lg">{emptyMessage}</p>
            <button
              onClick={() => {
                setSearch("");
              }}
              className="mt-4 text-brand-red hover:text-red-400 text-sm underline"
            >
              Limpiar búsqueda
            </button>
          </div>
        )}

        {!loading && !error && filtered.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filtered.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  setSelectedId(item.yt_id);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                className="group block text-left"
              >
                <div className="aspect-video w-full rounded-lg overflow-hidden bg-brand-surface card-hover relative">
                  <img
                    src={item.thumbnail || FALLBACK_THUMBNAIL}
                    alt={item.title}
                    loading="lazy"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).src = FALLBACK_THUMBNAIL;
                    }}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <div className="w-12 h-12 bg-brand-red rounded-full flex items-center justify-center shadow-lg transform scale-90 group-hover:scale-100 transition-transform">
                      <PlayIcon />
                    </div>
                  </div>
                </div>
                <div className="mt-3">
                  <p className="text-sm text-gray-200 font-bold line-clamp-2 group-hover:text-brand-red transition-colors">
                    {item.title}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-gray-500 font-medium">{item.channel_name}</span>
                    {item.published_at && (
                      <span className="text-[10px] text-gray-600">
                        • {new Date(item.published_at).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});

function SearchIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg className="w-6 h-6 text-white ml-1" viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

export default YouTubeEventGrid;
