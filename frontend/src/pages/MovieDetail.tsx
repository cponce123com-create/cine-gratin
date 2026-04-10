import { useState, useRef } from "react";
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

// ── GallerySection ────────────────────────────────────────────────────────────

function GallerySection({ imdbId, type }: { imdbId: string; type: "movie" | "series" }) {
  const [activeTab, setActiveTab] = useState<"backdrops" | "posters">("posters");
  const [lightbox, setLightbox] = useState<string | null>(null);

  const { data: images, isLoading } = useQuery({
    queryKey: ["tmdb-images", imdbId, type],
    queryFn: () => fetchImages(imdbId, type),
    staleTime: 60 * 60 * 1000,
  });

  const items = activeTab === "backdrops" ? (images?.backdrops ?? []) : (images?.posters ?? []);

  if (!isLoading && !images?.backdrops?.length && !images?.posters?.length) return null;

  return (
    <div className="mt-12">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h2 className="text-xl font-bold text-white">Imágenes</h2>
        <div className="flex gap-1">
          {(["posters", "backdrops"] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1 rounded-full text-xs font-bold transition-all border ${
                activeTab === tab
                  ? "bg-brand-red border-red-700 text-white"
                  : "bg-brand-surface border-brand-border text-gray-400 hover:text-white"
              }`}
            >
              {tab === "posters" ? "Carteles" : "Imágenes de fondo"}
              {images && (
                <span className="ml-1 text-[10px] opacity-60">
                  {tab === "posters" ? images.posters.length : images.backdrops.length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex gap-3 overflow-hidden">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className={`flex-shrink-0 bg-brand-surface rounded-xl animate-pulse ${
                activeTab === "posters" ? "w-32 h-48" : "w-56 h-32"
              }`}
            />
          ))}
        </div>
      ) : (
        <div className={`grid gap-2 ${
          activeTab === "posters"
            ? "grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8"
            : "grid-cols-2 sm:grid-cols-3 md:grid-cols-4"
        }`}>
          {items.map((img, i) => (
            <button
              key={i}
              onClick={() => setLightbox(img.url_original)}
              className="group overflow-hidden rounded-lg border border-brand-border hover:border-brand-red/60 transition-colors"
            >
              <img
                src={img.thumb}
                alt=""
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                loading="lazy"
              />
            </button>
          ))}
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          <button
            onClick={() => setLightbox(null)}
            className="absolute top-4 right-4 text-white/70 hover:text-white text-3xl font-bold"
          >✕</button>
          <img
            src={lightbox}
            alt=""
            className="max-w-full max-h-[90vh] object-contain rounded-xl shadow-2xl"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}

// ── RecommendationsSection ────────────────────────────────────────────────────

function RecommendationsSection({
  imdbId, type, title,
}: {
  imdbId: string;
  type: "movie" | "series";
  title: string;
}) {
  const { data: recs = [], isLoading } = useQuery({
    queryKey: ["tmdb-recs", imdbId, type],
    queryFn: () => fetchRecommendations(imdbId, type),
    staleTime: 60 * 60 * 1000,
  });

  if (!isLoading && recs.length === 0) return null;

  return (
    <div className="mt-12">
      <h2 className="text-xl font-bold text-white mb-4">
        Si te gustó <span className="text-brand-red italic">{title}</span>, también te puede gustar…
      </h2>

      {isLoading ? (
        <div className="flex gap-3 overflow-hidden">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex-shrink-0 w-32 h-48 bg-brand-surface rounded-xl animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
          {recs.map(rec => (
            <div key={rec.tmdb_id} className="flex-shrink-0 w-32 group">
              <div className="aspect-[2/3] rounded-xl overflow-hidden bg-brand-surface border border-brand-border">
                {rec.poster_url ? (
                  <img
                    src={rec.poster_url}
                    alt={rec.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-600 text-[10px] text-center px-2">
                    {rec.title}
                  </div>
                )}
                {rec.rating > 0 && (
                  <div className="absolute top-1.5 right-1.5 bg-black/70 backdrop-blur-sm rounded-full px-1.5 py-0.5 text-[10px] font-bold text-brand-gold">
                    ★ {rec.rating}
                  </div>
                )}
              </div>
              <p className="mt-1.5 text-xs font-semibold text-gray-200 truncate group-hover:text-white transition-colors">
                {rec.title}
              </p>
              {rec.year && <p className="text-[10px] text-gray-500">{rec.year}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const VIDEO_ORDER = ["Trailer", "Teaser", "Clip", "Featurette", "Behind the Scenes", "Bloopers"];

function sortVideos(videos: TmdbVideo[]): TmdbVideo[] {
  return [...videos].sort((a, b) => {
    const ia = VIDEO_ORDER.indexOf(a.type);
    const ib = VIDEO_ORDER.indexOf(b.type);
    const orderA = ia === -1 ? 99 : ia;
    const orderB = ib === -1 ? 99 : ib;
    if (orderA !== orderB) return orderA - orderB;
    if (a.official && !b.official) return -1;
    if (!a.official && b.official) return 1;
    return 0;
  });
}

// ── VideoCard ─────────────────────────────────────────────────────────────────

const VIDEO_TYPE_COLORS: Record<string, string> = {
  Trailer: "bg-red-600", Teaser: "bg-orange-500", Clip: "bg-blue-500",
  Featurette: "bg-purple-500", "Behind the Scenes": "bg-green-600", Bloopers: "bg-yellow-500",
};

function VideoTypeLabel({ type }: { type: string }) {
  return (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${VIDEO_TYPE_COLORS[type] ?? "bg-gray-600"} text-white`}>
      {type}
    </span>
  );
}

function VideoCard({ video }: { video: TmdbVideo }) {
  const [playing, setPlaying] = useState(false);
  const thumb = `https://img.youtube.com/vi/${video.key}/hqdefault.jpg`;
  if (playing) {
    return (
      <div className="relative aspect-video w-full rounded-xl overflow-hidden bg-black shadow-xl">
        <iframe
          src={`https://www.youtube.com/embed/${video.key}?autoplay=1`}
          className="absolute inset-0 w-full h-full"
          allowFullScreen
          allow="autoplay; encrypted-media; picture-in-picture"
          title={video.name}
        />
      </div>
    );
  }
  return (
    <button
      onClick={() => setPlaying(true)}
      className="group relative aspect-video w-full rounded-xl overflow-hidden bg-brand-surface shadow-xl border border-brand-border hover:border-red-500/50 transition-all"
    >
      <img src={thumb} alt={video.name} className="w-full h-full object-cover" />
      <div className="absolute inset-0 bg-black/40 group-hover:bg-black/20 transition-colors" />
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="w-12 h-12 rounded-full bg-brand-red/90 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
          <svg className="w-5 h-5 text-white ml-0.5" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
        </div>
      </div>
      <div className="absolute bottom-0 inset-x-0 p-2 bg-gradient-to-t from-black/90 to-transparent">
        <div className="flex items-start gap-1.5">
          <VideoTypeLabel type={video.type} />
          <p className="text-white text-xs font-medium leading-tight line-clamp-2 flex-1 text-left">{video.name}</p>
        </div>
      </div>
    </button>
  );
}

// ── ReviewCard ────────────────────────────────────────────────────────────────

function ReviewCard({ review }: { review: TmdbReview }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = review.content.length > 280;
  const text = expanded || !isLong ? review.content : review.content.slice(0, 280) + "…";
  const dateStr = review.created_at
    ? new Date(review.created_at).toLocaleDateString("es-MX", { year: "numeric", month: "long" })
    : null;
  return (
    <div className="bg-brand-surface border border-brand-border rounded-xl p-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-brand-red/20 border border-brand-red/30 flex items-center justify-center text-sm font-bold text-brand-red">
            {review.author[0]?.toUpperCase() ?? "?"}
          </div>
          <div>
            <p className="text-white font-semibold text-sm">{review.author}</p>
            {dateStr && <p className="text-gray-500 text-xs">{dateStr}</p>}
          </div>
        </div>
        {review.rating !== null && review.rating !== undefined && (
          <span className="flex items-center gap-1 text-brand-gold font-bold text-sm flex-shrink-0">
            ★ {Number(review.rating).toFixed(1)}
          </span>
        )}
      </div>
      <p className="text-gray-300 text-sm leading-relaxed">{text}</p>
      {isLong && (
        <button onClick={() => setExpanded(v => !v)} className="mt-2 text-brand-red hover:text-red-400 text-xs font-medium transition-colors">
          {expanded ? "Leer menos" : "Leer más"}
        </button>
      )}
    </div>
  );
}

// ── ActorModal ────────────────────────────────────────────────────────────────

function ActorModal({ personId, onClose }: { personId: number; onClose: () => void }) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [showAllCredits, setShowAllCredits] = useState(false);

  const { data: person, isLoading, error } = useQuery({
    queryKey: ["person", personId],
    queryFn: () => fetchPerson(personId),
    staleTime: 60 * 60 * 1000,
  });

  const age = person?.birthday && !person.deathday
    ? Math.floor((Date.now() - new Date(person.birthday).getTime()) / (365.25 * 24 * 3600 * 1000))
    : null;

  const creditsToShow = person
    ? showAllCredits ? person.all_credits : person.all_credits.slice(0, 10)
    : [];

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 overflow-y-auto"
      onClick={e => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div className="relative w-full max-w-3xl bg-brand-card border border-brand-border rounded-2xl overflow-hidden shadow-2xl my-8">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 w-8 h-8 rounded-full bg-black/60 hover:bg-black/80 flex items-center justify-center text-white text-lg transition-colors"
        >✕</button>

        {isLoading && (
          <div className="flex items-center justify-center h-64">
            <div className="w-8 h-8 rounded-full border-2 border-brand-red border-t-transparent animate-spin" />
          </div>
        )}
        {error && <div className="p-8 text-center text-red-400">No se pudo cargar el perfil del actor.</div>}

        {person && (
          <div className="flex flex-col sm:flex-row">
            {/* Left: photo + personal info */}
            <div className="sm:w-56 flex-shrink-0 bg-brand-surface">
              <img
                src={person.profile_url || FALLBACK_PERSON}
                alt={person.name}
                className="w-full aspect-[2/3] object-cover object-top"
                onError={e => { (e.currentTarget as HTMLImageElement).src = FALLBACK_PERSON; }}
              />
              <div className="p-4 space-y-3">
                {person.known_for_department && (
                  <div>
                    <p className="text-gray-500 text-[11px] uppercase tracking-wider">Conocido por</p>
                    <p className="text-white text-sm font-semibold">{person.known_for_department}</p>
                  </div>
                )}
                {person.birthday && (
                  <div>
                    <p className="text-gray-500 text-[11px] uppercase tracking-wider">Nacimiento</p>
                    <p className="text-white text-sm">
                      {new Date(person.birthday).toLocaleDateString("es-MX", { year: "numeric", month: "long", day: "numeric" })}
                      {age && <span className="text-gray-400"> ({age} años)</span>}
                    </p>
                  </div>
                )}
                {person.deathday && (
                  <div>
                    <p className="text-gray-500 text-[11px] uppercase tracking-wider">Fallecimiento</p>
                    <p className="text-white text-sm">
                      {new Date(person.deathday).toLocaleDateString("es-MX", { year: "numeric", month: "long", day: "numeric" })}
                    </p>
                  </div>
                )}
                {person.place_of_birth && (
                  <div>
                    <p className="text-gray-500 text-[11px] uppercase tracking-wider">Lugar de nacimiento</p>
                    <p className="text-white text-sm">{person.place_of_birth}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Right: bio + credits */}
            <div className="flex-1 p-5 overflow-y-auto max-h-[80vh] sm:max-h-[600px]">
              <h2 className="text-2xl font-black text-white mb-4">{person.name}</h2>

              {person.biography && (
                <div className="mb-5">
                  <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Biografía</h3>
                  <p className="text-gray-300 text-sm leading-relaxed line-clamp-6 hover:line-clamp-none transition-all cursor-pointer">
                    {person.biography}
                  </p>
                </div>
              )}

              {person.known_for.length > 0 && (
                <div className="mb-5">
                  <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Conocido por</h3>
                  <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                    {person.known_for.map(work => (
                      <div key={`${work.media_type}-${work.id}`} className="flex-shrink-0 w-20">
                        <div className="aspect-[2/3] rounded-lg overflow-hidden bg-brand-surface mb-1">
                          {work.poster_url
                            ? <img src={work.poster_url} alt={work.title} className="w-full h-full object-cover" loading="lazy" />
                            : <div className="w-full h-full flex items-center justify-center text-gray-600 text-[10px] text-center px-1">{work.title}</div>
                          }
                        </div>
                        <p className="text-[10px] text-gray-300 truncate leading-tight">{work.title}</p>
                        {work.year && <p className="text-[10px] text-gray-600">{work.year}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {person.all_credits.length > 0 && (
                <div>
                  <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                    Interpretación <span className="font-normal text-gray-600">({person.all_credits.length})</span>
                  </h3>
                  <div className="space-y-1">
                    {creditsToShow.map((c, i) => (
                      <div key={i} className="flex items-center gap-3 py-1.5 border-b border-brand-border/30 last:border-0">
                        <span className="text-gray-600 text-xs w-10 shrink-0 text-right">{c.year || "—"}</span>
                        <p className="text-sm text-white font-medium flex-1 truncate">{c.title}</p>
                        {c.character && <p className="text-xs text-gray-500 shrink-0 truncate max-w-[120px]">como {c.character}</p>}
                        <span className="text-[10px] text-gray-600 shrink-0 uppercase">{c.media_type === "tv" ? "Serie" : "Película"}</span>
                      </div>
                    ))}
                  </div>
                  {person.all_credits.length > 10 && (
                    <button
                      onClick={() => setShowAllCredits(v => !v)}
                      className="mt-3 text-brand-red hover:text-red-400 text-xs font-bold transition-colors"
                    >
                      {showAllCredits ? "Ver menos" : `Ver todos (${person.all_credits.length})`}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── CastSection ───────────────────────────────────────────────────────────────

function CastSection({ cast }: { cast: CastMember[] }) {
  const [selectedPersonId, setSelectedPersonId] = useState<number | null>(null);
  if (!cast || cast.length === 0) return null;

  return (
    <>
      <div className="mt-12">
        <h2 className="text-xl font-bold text-white mb-4">
          Reparto principal
          <span className="ml-2 text-sm font-normal text-gray-500">{cast.length}</span>
        </h2>
        <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
          {cast.map(member => (
            <button
              key={member.id}
              onClick={() => setSelectedPersonId(member.id)}
              className="flex-shrink-0 w-28 text-left group"
            >
              <div className="aspect-[2/3] rounded-xl overflow-hidden bg-brand-surface border border-brand-border group-hover:border-brand-red/60 transition-colors">
                <img
                  src={member.profile_url || FALLBACK_PERSON}
                  alt={member.name}
                  className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-300"
                  loading="lazy"
                  onError={e => { (e.currentTarget as HTMLImageElement).src = FALLBACK_PERSON; }}
                />
              </div>
              <p className="mt-1.5 text-xs font-bold text-white truncate group-hover:text-brand-red transition-colors">
                {member.name}
              </p>
              {member.character && (
                <p className="text-[10px] text-gray-500 truncate">{member.character}</p>
              )}
            </button>
          ))}
        </div>
      </div>

      {selectedPersonId !== null && (
        <ActorModal personId={selectedPersonId} onClose={() => setSelectedPersonId(null)} />
      )}
    </>
  );
}

// ── MediaSection ──────────────────────────────────────────────────────────────

const MEDIA_TABS = [
  { id: "popular",  label: "Más popular" },
  { id: "trailers", label: "Tráileres" },
  { id: "teasers",  label: "Teasers" },
  { id: "clips",    label: "Clips" },
  { id: "bts",      label: "Behind the Scenes" },
  { id: "all",      label: "Todo" },
];

function MediaSection({ videos, mainTrailerKey }: { videos: TmdbVideo[]; mainTrailerKey?: string }) {
  const [activeTab, setActiveTab] = useState("popular");
  const sorted = sortVideos(videos);

  const filterMap: Record<string, TmdbVideo[]> = {
    popular: sorted.slice(0, 9),
    trailers: sorted.filter(v => v.type === "Trailer"),
    teasers:  sorted.filter(v => v.type === "Teaser"),
    clips:    sorted.filter(v => v.type === "Clip"),
    bts:      sorted.filter(v => ["Behind the Scenes", "Featurette", "Bloopers"].includes(v.type)),
    all:      sorted,
  };

  const visibleTabs = MEDIA_TABS.filter(tab => (filterMap[tab.id]?.length ?? 0) > 0);
  const currentVideos = filterMap[activeTab] ?? [];

  if (videos.length === 0 && !mainTrailerKey) return null;

  return (
    <div className="mt-12">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h2 className="text-xl font-bold text-white">
          Media
          {videos.length > 0 && <span className="ml-2 text-sm font-normal text-gray-500">{videos.length} vídeos</span>}
        </h2>
        {visibleTabs.length > 1 && (
          <div className="flex gap-1 flex-wrap">
            {visibleTabs.map(tab => (
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
                {tab.id !== "popular" && tab.id !== "all" && (
                  <span className="ml-1 text-[10px] opacity-60">{filterMap[tab.id]?.length ?? 0}</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {currentVideos.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {currentVideos.map(v => <VideoCard key={v.key} video={v} />)}
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
      ) : null}
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

        {/* ── Media ordenada con tabs ───────────────── */}
        <MediaSection videos={allVideos} mainTrailerKey={movie.yt_trailer_code} />

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

        {/* ── Galería de imágenes ───────────────────── */}
        {movie.imdb_id && (
          <GallerySection imdbId={movie.imdb_id} type="movie" />
        )}

        {/* ── Recomendaciones ──────────────────────── */}
        {movie.imdb_id && (
          <RecommendationsSection imdbId={movie.imdb_id} type="movie" title={movie.title} />
        )}
      </div>
    </div>
  );
}

function PlayIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
  );
}
