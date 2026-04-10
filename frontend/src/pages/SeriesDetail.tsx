import { useState, useMemo, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Helmet } from "react-helmet-async";
import { getSeriesById } from "@/lib/api";
import type { SeasonData, TmdbVideo, TmdbReview, CastMember } from "@/lib/types";

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
  known_for: {
    id: number; media_type: string; title: string;
    character: string; poster_url: string; year: string; rating: number;
  }[];
  all_credits: {
    id: number; media_type: string; title: string;
    character: string; year: string;
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

function parseSeasons(raw: unknown): SeasonData[] {
  if (!raw) return [];
  if (typeof raw === "string") {
    try { return JSON.parse(raw) as SeasonData[]; } catch { return []; }
  }
  return Array.isArray(raw) ? (raw as SeasonData[]) : [];
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

  const VIDEO_TABS_S = [
    { id: "popular",  label: "Más popular" },
    { id: "trailers", label: "Tráileres" },
    { id: "teasers",  label: "Teasers" },
    { id: "clips",    label: "Clips" },
    { id: "bts",      label: "Behind the Scenes" },
    { id: "all",      label: "Todo" },
  ];

  const hasPosters   = (images?.posters?.length ?? 0) > 0;
  const hasBackdrops = (images?.backdrops?.length ?? 0) > 0;

  const allTabs = [
    ...VIDEO_TABS_S.filter(t => (filterMap[t.id]?.length ?? 0) > 0),
    ...(hasPosters   ? [{ id: "posters",   label: "Carteles" }]          : []),
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
              <button key={i} onClick={() => setLightbox(img.url_original)} className="group overflow-hidden rounded-lg border border-brand-border hover:border-brand-red/60 transition-colors">
                <div className={activeTab === "posters" ? "aspect-[2/3]" : "aspect-video"}>
                  <img src={img.thumb} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy" />
                </div>
              </button>
            ))}
          </div>
          {lightbox && (
            <div className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
              <button onClick={() => setLightbox(null)} className="absolute top-4 right-4 text-white/70 hover:text-white text-3xl font-bold">✕</button>
              <img src={lightbox} alt="" className="max-w-full max-h-[90vh] object-contain rounded-xl shadow-2xl" onClick={e => e.stopPropagation()} />
              <a href={lightbox} target="_blank" rel="noreferrer" className="absolute bottom-4 right-4 text-xs text-gray-400 hover:text-white">Ver original ↗</a>
            </div>
          )}
        </>
      ) : (
        (() => {
          const cv = filterMap[activeTab] ?? [];
          return cv.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {cv.map(v => <VideoCard key={v.key} video={v} />)}
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

// ── GallerySection ── (removed — merged into MediaSection above)

// ── RecommendationsSection (from own DB) ──────────────────────────────────────

function RecommendationsSection({
  currentId, genres, mediaType, title,
}: {
  currentId: string | number;
  genres: string[];
  mediaType: "movie" | "series";
  title: string;
}) {
  const { data: allSeries = [] } = useQuery({
    queryKey: ["series"],
    queryFn: () => import("@/lib/api").then(m => m.getSeries({ limit: 5000 })),
    staleTime: 5 * 60 * 1000,
  });

  const recommendations = useMemo(() => {
    if (!allSeries.length || !genres.length) return [];
    return allSeries
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
  }, [allSeries, currentId, genres]);

  if (recommendations.length === 0) return null;

  return (
    <div className="mt-12">
      <h2 className="text-xl font-bold text-white mb-4">
        Si te gustó <span className="text-brand-red italic">{title}</span>, también te puede gustar…
      </h2>
      <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
        {recommendations.map(item => (
          <a key={item.id} href={`/serie/${item.id}`} className="flex-shrink-0 w-32 group">
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

    () => Array.from({ length: episodeCount }, (_, i) => i + 1),
    [episodeCount]
  );

  const ogImage = series?.background_url || series?.poster_url || "";
  const allVideos: TmdbVideo[] = series?.videos ?? [];
  const reviews: TmdbReview[] = series?.reviews ?? [];
  const castFull: CastMember[] = (series as any)?.cast_full ?? [];

  const statusLabel =
    series?.status === "Ended" ? "Finalizada"
    : series?.status === "Returning Series" ? "En emisión"
    : series?.status || null;

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

  if (error || !series) {
    return (
      <div className="min-h-screen bg-brand-dark flex items-center justify-center pt-16">
        <div className="text-center">
          <p className="text-red-400 text-lg">No se pudo cargar la serie.</p>
          <Link to="/series" className="mt-4 inline-block text-brand-red hover:text-red-400 underline">
            Volver a series
          </Link>
        </div>
      </div>
    );
  }

  const showYear = (series.year ?? 0) > 0;
  const yearRange = showYear
    ? series.end_year && series.end_year !== series.year
      ? `${series.year}–${series.end_year}`
      : String(series.year)
    : null;

  return (
    <div className="min-h-screen bg-brand-dark">
      <Helmet>
        <title>{series.title}{yearRange ? ` (${yearRange})` : ""} — Cine Gratín</title>
        <meta name="description" content={series.synopsis?.slice(0, 160) ?? ""} />
        <meta property="og:title" content={`${series.title} — Cine Gratín`} />
        <meta property="og:description" content={series.synopsis?.slice(0, 200) ?? ""} />
        {ogImage && <meta property="og:image" content={ogImage} />}
        <meta property="og:type" content="video.tv_show" />
      </Helmet>

      {/* Backdrop */}
      <div className="relative w-full h-[55vh] min-h-[380px] overflow-hidden">
        <img
          src={series.background_url || series.poster_url || FALLBACK_BG}
          alt={series.title}
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
              src={series.poster_url || FALLBACK_POSTER}
              alt={series.title}
              className="w-full aspect-[2/3] object-cover rounded-xl shadow-2xl border border-brand-border"
              onError={e => { (e.currentTarget as HTMLImageElement).src = FALLBACK_POSTER; }}
            />
          </div>

          {/* Info */}
          <div className="flex-1 pt-2 sm:pt-12">
            <h1 className="text-2xl sm:text-4xl font-black text-white mb-2 leading-tight">
              {series.title}
              {yearRange && <span className="ml-2 text-lg sm:text-2xl font-normal text-gray-400">({yearRange})</span>}
            </h1>

            <div className="flex flex-wrap items-center gap-3 mb-4">
              {series.rating !== undefined && Number(series.rating) > 0 && (
                <span className="flex items-center gap-1 text-brand-gold font-bold">
                  ★ {Number(series.rating).toFixed(1)}
                </span>
              )}
              {seasonsData.length > 0 && (
                <span className="text-gray-400">
                  {seasonsData.length} temporada{seasonsData.length !== 1 ? "s" : ""}
                </span>
              )}
              {series.total_seasons && seasonsData.length === 0 && (
                <span className="text-gray-400">
                  {series.total_seasons} temporada{series.total_seasons !== 1 ? "s" : ""}
                </span>
              )}
              {statusLabel && (
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${
                  statusLabel === "En emisión"
                    ? "bg-green-900/30 text-green-400 border-green-800/50"
                    : "bg-gray-800 text-gray-400 border-gray-700"
                }`}>
                  {statusLabel}
                </span>
              )}
            </div>

            {series.genres && series.genres.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-5">
                {series.genres.map(g => (
                  <span key={g} className="text-xs bg-brand-surface border border-brand-border rounded-full px-3 py-1 text-gray-300">{g}</span>
                ))}
              </div>
            )}

            {series.synopsis && (
              <p className="text-gray-300 text-sm sm:text-base leading-relaxed max-w-2xl mb-5">
                {series.synopsis}
              </p>
            )}

            {series.creators && series.creators.length > 0 && (
              <p className="text-gray-400 text-sm mb-5">
                <span className="text-gray-500">Creadores: </span>
                {series.creators.join(", ")}
              </p>
            )}

            {series.imdb_id && (
              <button
                onClick={() => navigate(`/player/series/${series.imdb_id}?season=1&episode=1&title=${encodeURIComponent(series.title)}`)}
                className="flex items-center gap-2 bg-brand-red hover:bg-red-700 text-white font-bold py-3 px-6 rounded-lg transition-colors"
              >
                <PlayIcon /> Ver ahora
              </button>
            )}
          </div>
        </div>

        {/* ── Reparto ───────────────────────────────────── */}
        <CastSection cast={castFull} />

        {/* ── Season selector + Episodes ─────────────────── */}
        {seasonsData.length > 0 && (
          <div className="mt-12">
            <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-1">
              {seasonsData.map((season, idx) => (
                <button
                  key={season.season}
                  onClick={() => setSelectedSeasonIdx(idx)}
                  className={`flex-shrink-0 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                    selectedSeasonIdx === idx
                      ? "bg-brand-red text-white"
                      : "bg-brand-surface border border-brand-border text-gray-400 hover:text-white hover:border-gray-500"
                  }`}
                >
                  T{season.season}
                  <span className="ml-1.5 text-xs opacity-60">{season.episodes}ep</span>
                </button>
              ))}
            </div>

            {episodes.length === 0 ? (
              <p className="text-gray-500 text-sm">Sin episodios disponibles.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {episodes.map(epNum => (
                  <button
                    key={epNum}
                    onClick={() => {
                      if (series.imdb_id) {
                        navigate(`/player/series/${series.imdb_id}?season=${currentSeason.season}&episode=${epNum}&title=${encodeURIComponent(series.title)}`);
                      }
                    }}
                    className="flex items-center gap-3 bg-brand-surface border border-brand-border rounded-lg px-4 py-3 hover:border-brand-red hover:bg-brand-surface/80 transition-all group text-left"
                  >
                    <span className="text-brand-red font-black text-sm w-7 text-center flex-shrink-0">{epNum}</span>
                    <span className="text-gray-300 text-sm group-hover:text-white transition-colors truncate">Episodio {epNum}</span>
                    <span className="ml-auto flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"><PlayIcon /></span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {seasonsData.length === 0 && (
          <div className="mt-12 text-center py-12 border border-brand-border rounded-xl">
            <p className="text-gray-500">No hay información de temporadas disponible.</p>
            {series.imdb_id && (
              <button
                onClick={() => navigate(`/player/series/${series.imdb_id}?season=1&episode=1&title=${encodeURIComponent(series.title)}`)}
                className="mt-4 flex items-center gap-2 bg-brand-red hover:bg-red-700 text-white font-bold py-2 px-5 rounded-lg transition-colors mx-auto"
              >
                <PlayIcon /> Ver T1 E1
              </button>
            )}
          </div>
        )}

        {/* ── Media + Imágenes (tabs unificados) ──────────── */}
        <MediaSection
          videos={allVideos}
          mainTrailerKey={series.yt_trailer_code}
          imdbId={series.imdb_id}
          mediaType="series"
        />

        {/* ── Reseñas ───────────────────────────────────── */}
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

        {/* ── Recomendaciones desde la BD propia ─────────── */}
        <RecommendationsSection
          currentId={series.id}
          genres={series.genres ?? []}
          mediaType="series"
          title={series.title}
        />
      </div>
    </div>
  );
}

function PlayIcon() {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
  );
}
