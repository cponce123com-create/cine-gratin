import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { TmdbVideo } from "@/lib/types";
import { sortVideos, fetchImages } from "./helpers";
import { VIDEO_TABS } from "./constants";
import { VideoCard } from "./VideoCard";

export function MediaSection({
  videos,
  mainTrailerKey,
  imdbId,
  mediaType,
}: {
  videos: TmdbVideo[];
  mainTrailerKey?: string;
  imdbId?: string;
  mediaType: "movie" | "series";
}) {
  const [activeTab, setActiveTab] = useState("popular");
  const [lightbox, setLightbox] = useState<string | null>(null);
  const sorted = sortVideos(videos);

  const { data: images } = useQuery({
    queryKey: ["tmdb-images", imdbId, mediaType],
    queryFn: () => fetchImages(imdbId!, mediaType),
    enabled: !!imdbId,
    staleTime: 60 * 60 * 1000,
  });

  const filterMap: Record<string, TmdbVideo[]> = {
    popular: sorted.slice(0, 9),
    trailers: sorted.filter((v) => v.type === "Trailer"),
    teasers: sorted.filter((v) => v.type === "Teaser"),
    clips: sorted.filter((v) => v.type === "Clip"),
    bts: sorted.filter((v) => ["Behind the Scenes", "Featurette", "Bloopers"].includes(v.type)),
    all: sorted,
  };

  const hasPosters = (images?.posters?.length ?? 0) > 0;
  const hasBackdrops = (images?.backdrops?.length ?? 0) > 0;

  const allTabs = [
    ...VIDEO_TABS.filter((t) => (filterMap[t.id]?.length ?? 0) > 0),
    ...(hasPosters ? [{ id: "posters", label: "Carteles" }] : []),
    ...(hasBackdrops ? [{ id: "backdrops", label: "Imágenes de fondo" }] : []),
  ];

  const hasContent = videos.length > 0 || mainTrailerKey || hasPosters || hasBackdrops;
  if (!hasContent) return null;

  const isImageTab = activeTab === "posters" || activeTab === "backdrops";
  const imageItems = activeTab === "posters" ? (images?.posters ?? []) : (images?.backdrops ?? []);

  return (
    <div className="mt-12">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h2 className="text-xl font-bold text-white">
          Media
          {videos.length > 0 && (
            <span className="ml-2 text-sm font-normal text-gray-500">{videos.length} vídeos</span>
          )}
        </h2>
        {allTabs.length > 1 && (
          <div className="flex gap-1 flex-wrap">
            {allTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-1 rounded-full text-xs font-bold transition-all border ${
                  activeTab === tab.id
                    ? "bg-brand-red border-red-700 text-white"
                    : "bg-brand-surface border-brand-border text-gray-400 hover:text-white"
                }`}
              >
                {tab.label}
                {tab.id === "posters" && (
                  <span className="ml-1 text-[10px] opacity-60">{images?.posters?.length ?? 0}</span>
                )}
                {tab.id === "backdrops" && (
                  <span className="ml-1 text-[10px] opacity-60">{images?.backdrops?.length ?? 0}</span>
                )}
                {!["popular", "all", "posters", "backdrops"].includes(tab.id) && (
                  <span className="ml-1 text-[10px] opacity-60">{filterMap[tab.id]?.length ?? 0}</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {isImageTab ? (
        <>
          <div
            className={`grid gap-2 ${
              activeTab === "posters"
                ? "grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8"
                : "grid-cols-2 sm:grid-cols-3 md:grid-cols-4"
            }`}
          >
            {imageItems.map((img, i) => (
              <button
                key={i}
                onClick={() => setLightbox(img.url_original)}
                className="group overflow-hidden rounded-lg border border-brand-border hover:border-brand-red/60 transition-colors"
              >
                <div className={activeTab === "posters" ? "aspect-[2/3]" : "aspect-video"}>
                  <img
                    src={img.thumb}
                    alt=""
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    loading="lazy"
                  />
                </div>
              </button>
            ))}
          </div>
          {lightbox && (
            <div
              className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4"
              onClick={() => setLightbox(null)}
            >
              <button
                onClick={() => setLightbox(null)}
                className="absolute top-4 right-4 text-white/70 hover:text-white text-3xl font-bold"
              >
                ✕
              </button>
              <img
                src={lightbox}
                alt=""
                className="max-w-full max-h-[90vh] object-contain rounded-xl shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              />
              <a
                href={lightbox}
                target="_blank"
                rel="noreferrer"
                className="absolute bottom-4 right-4 text-xs text-gray-400 hover:text-white"
              >
                Ver original ↗
              </a>
            </div>
          )}
        </>
      ) : (
        (() => {
          const currentVideos = filterMap[activeTab] ?? [];
          return currentVideos.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {currentVideos.map((v) => (
                <VideoCard key={v.key} video={v} />
              ))}
            </div>
          ) : mainTrailerKey ? (
            <div className="relative aspect-video w-full max-w-3xl rounded-xl overflow-hidden bg-brand-surface shadow-2xl">
              <iframe
                src={`https://www.youtube.com/embed/${mainTrailerKey}`}
                title="Tráiler"
                className="absolute inset-0 w-full h-full"
                allowFullScreen
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              />
            </div>
          ) : null;
        })()
      )}
    </div>
  );
}

// ── RecommendationsSection ──────────────────────────────────────────────────────

import { useMemo } from "react";
import { Link } from "react-router-dom";

export function RecommendationsSection({
  currentId,
  genres,
  mediaType,
  title,
}: {
  currentId: string | number;
  genres: string[];
  mediaType: "movie" | "series";
  title: string;
}) {
  const { data: allMovies = [] } = useQuery({
    queryKey: ["movies"],
    queryFn: () => import("@/lib/api").then((m) => m.getMovies({ limit: 5000 })),
    staleTime: 5 * 60 * 1000,
    enabled: mediaType === "movie",
  });

  const { data: allSeries = [] } = useQuery({
    queryKey: ["series"],
    queryFn: () => import("@/lib/api").then((m) => m.getSeries({ limit: 5000 })),
    staleTime: 5 * 60 * 1000,
    enabled: mediaType === "series",
  });

  const recommendations = useMemo(() => {
    const pool = mediaType === "movie" ? allMovies : allSeries;
    if (!pool.length || !genres.length) return [];
    return pool
      .filter((item) => String(item.id) !== String(currentId))
      .map((item) => {
        const itemGenres: string[] = (item.genres as string[]) ?? [];
        const matches = genres.filter((g) =>
          itemGenres.some(
            (ig) => ig.toLowerCase().includes(g.toLowerCase()) || g.toLowerCase().includes(ig.toLowerCase()),
          ),
        ).length;
        return { item, matches };
      })
      .filter((s) => s.matches > 0)
      .sort((a, b) =>
        b.matches !== a.matches
          ? b.matches - a.matches
          : (Number(b.item.views) || 0) - (Number(a.item.views) || 0),
      )
      .slice(0, 18)
      .map((s) => s.item);
  }, [allMovies, allSeries, currentId, genres, mediaType]);

  if (recommendations.length === 0) return null;

  return (
    <div className="mt-12">
      <h2 className="text-xl font-bold text-white mb-4">
        Si te gustó <span className="text-brand-red italic">{title}</span>, también te puede gustar…
      </h2>
      <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
        {recommendations.map((item) => (
          <Link
            key={item.id}
            to={`/${mediaType === "movie" ? "pelicula" : "serie"}/${item.id}`}
            className="flex-shrink-0 w-32 group"
          >
            <div className="relative aspect-[2/3] rounded-xl overflow-hidden bg-brand-surface border border-brand-border group-hover:border-brand-red/60 transition-colors">
              {item.poster_url ? (
                <img
                  src={item.poster_url}
                  alt={item.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  loading="lazy"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-600 text-xs text-center px-2">
                  {item.title}
                </div>
              )}
              {(item.rating ?? 0) > 0 && (
                <div className="absolute top-1.5 right-1.5 bg-black/70 backdrop-blur-sm rounded-full px-1.5 py-0.5 text-[10px] font-bold text-brand-gold">
                  ★ {Number(item.rating).toFixed(1)}
                </div>
              )}
            </div>
            <p className="mt-1.5 text-xs font-semibold text-gray-200 truncate group-hover:text-white transition-colors">
              {item.title}
            </p>
            {item.year && <p className="text-[10px] text-gray-500">{item.year}</p>}
          </Link>
        ))}
      </div>
    </div>
  );
}
