import { useState, useRef, useMemo } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Helmet } from "react-helmet-async";
import { getMovie } from "@/lib/api";
import type { TmdbVideo, TmdbReview, CastMember } from "@/lib/types";

const BASE_URL =
  (import.meta.env["VITE_API_URL"] as string | undefined) ||
  "https://cine-gratin.onrender.com";

// ── Types ─────────────────────────────────────────────────────────────────────

interface TmdbImage {
  url: string;
  url_original: string;
  thumb: string;
}

interface TmdbImages {
  backdrops: TmdbImage[];
  posters: TmdbImage[];
}

interface TmdbRecommendation {
  tmdb_id: number;
  media_type: string;
  title: string;
  poster_url: string;
  year: string;
  rating: number;
  overview: string;
}

interface PersonProfile {
  id: number;
  name: string;
  biography: string;
  birthday: string | null;
  deathday: string | null;
  place_of_birth: string | null;
  known_for_department: string;
  profile_url: string;
  profile_photos: string[];
  known_for: {
    id: number; media_type: string; title: string;
    character: string; poster_url: string; year: string; rating: number;
  }[];
  all_credits: {
    id: number; media_type: string; title: string;
    character: string; year: string; poster_url: string;
  }[];
}

// ── Fetch helpers ─────────────────────────────────────────────────────────────

async function fetchPerson(personId: number): Promise<PersonProfile> {
  const res = await fetch(`${BASE_URL}/api/tmdb/person/${personId}`);
  if (!res.ok) throw new Error("No se pudo cargar el perfil");
  return res.json();
}

async function fetchImages(imdbId: string, type: "movie" | "series"): Promise<TmdbImages> {
  const res = await fetch(`${BASE_URL}/api/tmdb/images/${imdbId}?type=${type}`);
  if (!res.ok) throw new Error("No se pudieron cargar imágenes");
  return res.json();
}

async function fetchRecommendations(imdbId: string, type: "movie" | "series"): Promise<TmdbRecommendation[]> {
  const res = await fetch(`${BASE_URL}/api/tmdb/recommendations/${imdbId}?type=${type}`);
  if (!res.ok) return [];
  return res.json();
}

const FALLBACK_BG =
  "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=1400&auto=format&fit=crop";
const FALLBACK_POSTER =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='300' viewBox='0 0 200 300'%3E%3Crect width='200' height='300' fill='%231a1a1a'/%3E%3Ctext x='100' y='150' font-family='sans-serif' font-size='14' fill='%23555' text-anchor='middle' dominant-baseline='middle'%3ESin imagen%3C/text%3E%3C/svg%3E";
const FALLBACK_PERSON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='150' viewBox='0 0 100 150'%3E%3Crect width='100' height='150' fill='%231e1e1e'/%3E%3Ccircle cx='50' cy='55' r='22' fill='%23333'/%3E%3Cellipse cx='50' cy='130' rx='35' ry='30' fill='%23333'/%3E%3C/svg%3E";

// ── MediaSection (videos + images unified) ───────────────────────────────────

const VIDEO_TABS = [
  { id: "popular",  label: "Más popular" },
  { id: "trailers", label: "Tráileres" },
  { id: "teasers",  label: "Teasers" },
  { id: "clips",    label: "Clips" },
  { id: "bts",      label: "Behind the Scenes" },
  { id: "all",      label: "Todo" },
];

function MediaSection({
  videos, mainTrailerKey, imdbId, mediaType,
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
    popular:  sorted.slice(0, 9),
    trailers: sorted.filter(v => v.type === "Trailer"),
    teasers:  sorted.filter(v => v.type === "Teaser"),
    clips:    sorted.filter(v => v.type === "Clip"),
    bts:      sorted.filter(v => ["Behind the Scenes", "Featurette", "Bloopers"].includes(v.type)),
    all:      sorted,
  };

  const hasPosters   = (images?.posters?.length ?? 0) > 0;
  const hasBackdrops = (images?.backdrops?.length ?? 0) > 0;

  const allTabs = [
    ...VIDEO_TABS.filter(t => (filterMap[t.id]?.length ?? 0) > 0),
    ...(hasPosters   ? [{ id: "posters",   label: "Carteles" }]          : []),
    ...(hasBackdrops ? [{ id: "backdrops", label: "Imágenes de fondo" }] : []),
  ];

  const hasContent = videos.length > 0 || mainTrailerKey || hasPosters || hasBackdrops;
  if (!hasContent) return null;

  const isImageTab  = activeTab === "posters" || activeTab === "backdrops";
  const imageItems  = activeTab === "posters" ? (images?.posters ?? []) : (images?.backdrops ?? []);

  return (
    <div className="mt-12">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h2 className="text-xl font-bold text-white">
          Media
          {videos.length > 0 && <span className="ml-2 text-sm font-normal text-gray-500">{videos.length} vídeos</span>}
        </h2>
        {allTabs.length > 1 && (
          <div className="flex gap-1 flex-wrap">
            {allTabs.map(tab => (
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
                {tab.id === "posters"   && <span className="ml-1 text-[10px] opacity-60">{images?.posters?.length ?? 0}</span>}
                {tab.id === "backdrops" && <span className="ml-1 text-[10px] opacity-60">{images?.backdrops?.length ?? 0}</span>}
                {!["popular","all","posters","backdrops"].includes(tab.id) && (
                  <span className="ml-1 text-[10px] opacity-60">{filterMap[tab.id]?.length ?? 0}</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {isImageTab ? (
        <>
          <div className={`grid gap-2 ${
            activeTab === "posters"
              ? "grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8"
              : "grid-cols-2 sm:grid-cols-3 md:grid-cols-4"
          }`}>
            {imageItems.map((img, i) => (
              <button
                key={i}
                onClick={() => setLightbox(img.url_original)}
                className="group overflow-hidden rounded-lg border border-brand-border hover:border-brand-red/60 transition-colors"
              >
                <div className={activeTab === "posters" ? "aspect-[2/3]" : "aspect-video"}>
                  <img src={img.thumb} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy" />
                </div>
              </button>
            ))}
          </div>
          {lightbox && (
            <div className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
              <button onClick={() => setLightbox(null)} className="absolute top-4 right-4 text-white/70 hover:text-white text-3xl font-bold transition-colors">✕</button>
              <img src={lightbox} alt="" className="max-w-full max-h-[90vh] object-contain rounded-xl shadow-2xl" onClick={e => e.stopPropagation()} />
              <a href={lightbox} target="_blank" rel="noreferrer" className="absolute bottom-4 right-4 text-xs text-gray-400 hover:text-white transition-colors">Ver original ↗</a>
            </div>
          )}
        </>
      ) : (
        (() => {
          const currentVideos = filterMap[activeTab] ?? [];
          return currentVideos.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {currentVideos.map(v => <VideoCard key={v.key} video={v} />)}
            </div>
          ) : mainTrailerKey ? (
            <div className="relative aspect-video w-full max-w-3xl rounded-xl overflow-hidden bg-brand-surface shadow-2xl">
              <iframe src={`https://www.youtube.com/embed/${mainTrailerKey}`} title="Tráiler" className="absolute inset-0 w-full h-full" allowFullScreen allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" />
            </div>
          ) : null;
        })()
      )}
    </div>
  );
}

// ── RecommendationsSection (from own DB) ──────────────────────────────────────

function RecommendationsSection({
  currentId, genres, mediaType, title,
}: {
  currentId: string | number;
  genres: string[];
  mediaType: "movie" | "series";
  title: string;
}) {
  const { data: allMovies = [] } = useQuery({
    queryKey: ["movies"],
    queryFn: () => import("@/lib/api").then(m => m.getMovies({ limit: 5000 })),
    staleTime: 5 * 60 * 1000,
    enabled: mediaType === "movie",
  });

  const { data: allSeries = [] } = useQuery({
    queryKey: ["series"],
    queryFn: () => import("@/lib/api").then(m => m.getSeries({ limit: 5000 })),
    staleTime: 5 * 60 * 1000,
    enabled: mediaType === "series",
  });

  const recommendations = useMemo(() => {
    const pool = mediaType === "movie" ? allMovies : allSeries;
    if (!pool.length || !genres.length) return [];
    return pool
      .filter(item => String(item.id) !== String(currentId))
      .map(item => {
        const itemGenres: string[] = (item.genres as string[]) ?? [];
        const matches = genres.filter(g =>
          itemGenres.some(ig => ig.toLowerCase().includes(g.toLowerCase()) || g.toLowerCase().includes(ig.toLowerCase()))
        ).length;
        return { item, matches };
      })
      .filter(s => s.matches > 0)
      .sort((a, b) => b.matches !== a.matches ? b.matches - a.matches : (Number(b.item.views) || 0) - (Number(a.item.views) || 0))
      .slice(0, 18)
      .map(s => s.item);
  }, [allMovies, allSeries, currentId, genres, mediaType]);

  if (recommendations.length === 0) return null;

  return (
    <div className="mt-12">
      <h2 className="text-xl font-bold text-white mb-4">
        Si te gustó <span className="text-brand-red italic">{title}</span>, también te puede gustar…
      </h2>
      <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
        {recommendations.map(item => (
          <a key={item.id} href={`/${mediaType === "movie" ? "pelicula" : "serie"}/${item.id}`} className="flex-shrink-0 w-32 group">
            <div className="relative aspect-[2/3] rounded-xl overflow-hidden bg-brand-surface border border-brand-border group-hover:border-brand-red/60 transition-colors">
              {item.poster_url
                ? <img src={item.poster_url} alt={item.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy" />
                : <div className="w-full h-full flex items-center justify-center text-gray-600 text-xs text-center px-2">{item.title}</div>
              }
              {(item.rating ?? 0) > 0 && (
                <div className="absolute top-1.5 right-1.5 bg-black/70 backdrop-blur-sm rounded-full px-1.5 py-0.5 text-[10px] font-bold text-brand-gold">
                  ★ {Number(item.rating).toFixed(1)}
                </div>
              )}
            </div>
            <p className="mt-1.5 text-xs font-semibold text-gray-200 truncate group-hover:text-white transition-colors">{item.title}</p>
            {item.year && <p className="text-[10px] text-gray-500">{item.year}</p>}
          </a>
        ))}
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function MovieDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: movie, isLoading: loading, error } = useQuery({
    queryKey: ["movie", id],
    queryFn: () => getMovie(id!),
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
  });

  const runtimeMin = movie?.runtime ?? movie?.duration_min ?? null;
  const runtimeLabel = runtimeMin
    ? runtimeMin >= 60 ? `${Math.floor(runtimeMin / 60)}h ${runtimeMin % 60}m` : `${runtimeMin} min`
    : null;

  const firstSource = movie?.video_sources?.[0];
  const ogImage = movie?.background_url || movie?.poster_url || "";
  const allVideos: TmdbVideo[] = movie?.videos ?? [];
  const reviews: TmdbReview[] = movie?.reviews ?? [];
  const castFull: CastMember[] = (movie as any)?.cast_full ?? [];

  if (loading) {
    return (
      <div className="min-h-screen bg-brand-dark flex items-center justify-center pt-16">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 rounded-full border-2 border-brand-red border-t-transparent animate-spin" />
          <p className="text-gray-400 text-sm">Cargando...</p>
        </div>
      </div>
    );
  }

  if (error || !movie) {
    return (
      <div className="min-h-screen bg-brand-dark flex items-center justify-center pt-16">
        <div className="text-center">
          <p className="text-red-400 text-lg">No se pudo cargar la película.</p>
          <Link to="/peliculas" className="mt-4 inline-block text-brand-red hover:text-red-400 underline">Volver a películas</Link>
        </div>
      </div>
    );
  }

  const showYear = (movie.year ?? 0) > 0;

  return (
    <div className="min-h-screen bg-brand-dark">
      <Helmet>
        <title>{movie.title}{showYear ? ` (${movie.year})` : ""} — Cine Gratín</title>
        <meta name="description" content={movie.synopsis?.slice(0, 160) ?? ""} />
        <meta property="og:title" content={`${movie.title} — Cine Gratín`} />
        <meta property="og:description" content={movie.synopsis?.slice(0, 200) ?? ""} />
        {ogImage && <meta property="og:image" content={ogImage} />}
        <meta property="og:type" content="video.movie" />
      </Helmet>

      {/* Backdrop */}
      <div className="relative w-full h-[55vh] min-h-[380px] overflow-hidden">
        <img
          src={movie.background_url || movie.poster_url || FALLBACK_BG}
          alt={movie.title}
          className="w-full h-full object-cover object-top"
          onError={e => { (e.currentTarget as HTMLImageElement).src = FALLBACK_BG; }}
        />
        <div className="absolute inset-0 hero-gradient" />
        <div className="absolute inset-x-0 bottom-0 h-40 hero-gradient-bottom" />
        <button
          onClick={() => navigate(-1)}
          className="absolute top-20 left-6 flex items-center gap-2 text-gray-300 hover:text-white text-sm transition-colors"
        >
          ← Volver
        </button>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 -mt-24 relative z-10 pb-16">
        <div className="flex flex-col sm:flex-row gap-8">

          {/* Poster */}
          <div className="flex-shrink-0 w-36 sm:w-48 md:w-56">
            <img
              src={movie.poster_url || FALLBACK_POSTER}
              alt={movie.title}
              className="w-full aspect-[2/3] object-cover rounded-xl shadow-2xl border border-brand-border"
              onError={e => { (e.currentTarget as HTMLImageElement).src = FALLBACK_POSTER; }}
            />
          </div>

          {/* Info */}
          <div className="flex-1 pt-2 sm:pt-12">
            <h1 className="text-2xl sm:text-4xl font-black text-white mb-2 leading-tight">
              {movie.title}
              {showYear && <span className="ml-2 text-lg sm:text-2xl font-normal text-gray-400">({movie.year})</span>}
            </h1>

            <div className="flex flex-wrap items-center gap-3 mb-4">
              {movie.rating !== undefined && Number(movie.rating) > 0 && (
                <span className="flex items-center gap-1 text-brand-gold font-bold">★ {Number(movie.rating).toFixed(1)}</span>
              )}
              {runtimeLabel && <span className="text-gray-400">{runtimeLabel}</span>}
              {movie.mpa_rating && movie.mpa_rating !== "NR" && (
                <span className="text-xs border border-gray-600 text-gray-400 px-1.5 py-0.5 rounded">{movie.mpa_rating}</span>
              )}
            </div>

            {movie.genres && movie.genres.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-5">
                {movie.genres.map(g => (
                  <span key={g} className="text-xs bg-brand-surface border border-brand-border rounded-full px-3 py-1 text-gray-300">{g}</span>
                ))}
              </div>
            )}

            {movie.synopsis && (
              <p className="text-gray-300 text-sm sm:text-base leading-relaxed mb-5 max-w-2xl">{movie.synopsis}</p>
            )}

            {movie.director && (
              <p className="text-gray-400 text-sm mb-5">
                <span className="text-gray-500">Director: </span>{movie.director}
              </p>
            )}

            <div className="flex flex-wrap gap-3">
              {movie.imdb_id ? (
                <button
                  onClick={() => navigate(`/player/movie/${movie.imdb_id}?title=${encodeURIComponent(movie.title)}`)}
                  className="flex items-center gap-2 bg-brand-red hover:bg-red-700 text-white font-bold py-3 px-6 rounded-lg transition-colors"
                >
                  <PlayIcon /> Ver ahora
                </button>
              ) : firstSource ? (
                <button
                  onClick={() => navigate(`/player?url=${encodeURIComponent(firstSource.url)}&title=${encodeURIComponent(movie.title)}&label=${encodeURIComponent(firstSource.label)}`)}
                  className="flex items-center gap-2 bg-brand-red hover:bg-red-700 text-white font-bold py-3 px-6 rounded-lg transition-colors"
                >
                  <PlayIcon /> Ver ahora
                </button>
              ) : null}
            </div>
          </div>
        </div>

        {/* ── Reparto ───────────────────────────────── */}
        <CastSection cast={castFull} />

        {/* ── Media + Imágenes (tabs unificados) ──────── */}
        <MediaSection
          videos={allVideos}
          mainTrailerKey={movie.yt_trailer_code}
          imdbId={movie.imdb_id}
          mediaType="movie"
        />

        {/* ── Reseñas ───────────────────────────────── */}
        {reviews.length > 0 && (
          <div className="mt-12">
            <h2 className="text-xl font-bold text-white mb-4">
              Reseñas <span className="ml-2 text-sm font-normal text-gray-500">{reviews.length}</span>
            </h2>
            <div className="flex flex-col gap-4">
              {reviews.map((r, i) => <ReviewCard key={i} review={r} />)}
            </div>
          </div>
        )}

        {/* ── Recomendaciones desde la BD propia ───────── */}
        <RecommendationsSection
          currentId={movie.id}
          genres={movie.genres ?? []}
          mediaType="movie"
          title={movie.title}
        />
      </div>
    </div>
  );
}

function PlayIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
  );
}
