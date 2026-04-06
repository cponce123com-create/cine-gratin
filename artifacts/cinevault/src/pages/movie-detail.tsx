import { useState, useEffect, useCallback } from "react";
import { LocalMovie, makeVideoSourcesForImdb } from "@/lib/admin-db";
import { apiGetMovie, apiGetMovies, apiGetServers, apiIncrementView } from "@/lib/api-client";
import { PageTransition } from "@/components/layout/PageTransition";
import { MovieCard } from "@/components/movie/MovieCard";
import { MovieCarousel } from "@/components/movie/MovieCarousel";
import {
  Star,
  Clock,
  Calendar,
  Globe,
  Download,
  PlayCircle,
  Info,
  X,
  Magnet,
  Youtube,
  ChevronLeft,
  ChevronRight,
  Film,
  Maximize2,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { Link } from "wouter";

interface MovieDetailProps {
  params: { id: string };
}

interface WatchedEntry {
  id: string;
  timestamp: number;
}

interface VideoServer {
  name: string;
  url: string;
}

function formatRuntime(minutes: number) {
  if (!minutes) return "N/A";
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function getQualityStyle(quality: string) {
  if (quality.includes("2160")) return "bg-yellow-500/90 text-black";
  if (quality.includes("1080")) return "bg-blue-600/90 text-white";
  if (quality.includes("720")) return "bg-green-600/90 text-white";
  return "bg-secondary text-muted-foreground";
}

function getMagnetUrl(url: string, title: string) {
  if (url.startsWith("magnet:")) return url;
  return `magnet:?xt=urn:btih:${url}&dn=${encodeURIComponent(title)}`;
}

export default function MovieDetail({ params }: MovieDetailProps) {
  const [movie, setMovie] = useState<LocalMovie | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [similar, setSimilar] = useState<LocalMovie[]>([]);
  const [videoServers, setVideoServers] = useState<VideoServer[]>([]);
  const [activeServer, setActiveServer] = useState(0);
  const [activeTab, setActiveTab] = useState<"synopsis" | "specs">("synopsis");
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [showTrailer, setShowTrailer] = useState(false);
  const [playerFullscreen, setPlayerFullscreen] = useState(false);
  const [, setWatched] = useLocalStorage<WatchedEntry[]>("cv_recently_watched", []);

  const handleEsc = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") setPlayerFullscreen(false);
  }, []);

  useEffect(() => {
    if (playerFullscreen) {
      document.addEventListener("keydown", handleEsc);
      document.body.style.overflow = "hidden";
    } else {
      document.removeEventListener("keydown", handleEsc);
      document.body.style.overflow = "";
    }
    return () => {
      document.removeEventListener("keydown", handleEsc);
      document.body.style.overflow = "";
    };
  }, [playerFullscreen, handleEsc]);

  useEffect(() => {
    const load = async () => {
      let m: LocalMovie | null = null;
      try {
        m = await apiGetMovie(params.id);
      } catch {
        setNotFound(true);
        return;
      }
      setMovie(m);
      document.title = `${m.title} (${m.year}) — CineVault`;

      // Similar movies (same primary genre, excluding self)
      const genre = m.genres?.[0];
      if (genre) {
        const all = await apiGetMovies().catch(() => [] as LocalMovie[]);
        setSimilar(all.filter((x) => x.id !== m!.id && x.genres?.includes(genre)).slice(0, 20));
      }

      // Build video server list
      let servers: VideoServer[] = [];
      if (m.video_sources && m.video_sources.filter((s) => s.active).length > 0) {
        servers = m.video_sources.filter((s) => s.active).map((s) => ({ name: s.name, url: s.url }));
      } else if (m.imdb_id) {
        const dbServers = await apiGetServers().catch(() => [] as import("@/lib/admin-db").VideoServer[]);
        const mockSources = makeVideoSourcesForImdb(m.imdb_id);
        servers = (dbServers.length > 0
          ? dbServers.filter(s => s.active).sort((a, b) => a.order - b.order).map(s => ({
              name: s.name,
              url: s.url_pattern.replace("{IMDB_ID}", m!.imdb_id),
            }))
          : mockSources.map((s) => ({ name: s.name, url: s.url }))
        );
      }
      setVideoServers(servers);

      // Increment views
      apiIncrementView(m.id).catch(() => {});

      // Add to recently watched
      setWatched((prev) => {
        const filtered = prev.filter((w) => w.id !== m!.id);
        return [{ id: m!.id, timestamp: Date.now() }, ...filtered].slice(0, 10);
      });
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  const handleSaveRecent = (id: string) => {
    setWatched((prev) => {
      const filtered = prev.filter((w) => w.id !== id);
      return [{ id, timestamp: Date.now() }, ...filtered].slice(0, 10);
    });
  };

  if (notFound) {
    return (
      <div className="min-h-screen pt-32 px-4 text-center">
        <Film className="w-20 h-20 text-muted-foreground/30 mx-auto mb-6" />
        <h2 className="text-4xl font-heading text-destructive mb-4">
          Película No Encontrada
        </h2>
        <p className="text-muted-foreground mb-8">
          No se pudo cargar esta película.
        </p>
        <Link
          href="/browse"
          className="bg-primary text-primary-foreground px-6 py-3 rounded-lg font-bold hover:bg-primary/90 transition-colors"
        >
          Explorar Películas
        </Link>
      </div>
    );
  }

  if (!movie) {
    return (
      <div className="min-h-screen pt-20 flex items-center justify-center">
        <div className="flex flex-col items-center">
          <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="mt-4 font-heading tracking-widest text-muted-foreground text-xl">
            Cargando Película...
          </p>
        </div>
      </div>
    );
  }

  const currentServerUrl = videoServers[activeServer]?.url || "";

  return (
    <PageTransition>
      {/* === Backdrop === */}
      <div className="relative w-full h-[50vh] min-h-[400px] overflow-hidden">
        {movie.background_url ? (
          <img
            src={movie.background_url}
            alt={movie.title}
            className="absolute inset-0 w-full h-full object-cover scale-105"
          />
        ) : movie.poster_url ? (
          <img
            src={movie.poster_url}
            alt={movie.title}
            className="absolute inset-0 w-full h-full object-cover scale-105 blur-sm opacity-40"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-card via-background to-black" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-background/80 via-transparent to-transparent" />
      </div>

      {/* === Main Content === */}
      <div className="max-w-[1400px] mx-auto px-4 md:px-8 -mt-60 relative z-10 pb-16">
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr_340px] gap-8">
          {/* === Poster === */}
          <div className="flex flex-col items-center lg:items-start gap-4">
            <div className="w-48 lg:w-full max-w-[280px] rounded-2xl overflow-hidden shadow-[0_0_40px_rgba(0,0,0,0.8)] border border-border">
              <img
                src={
                  movie.poster_url ||
                  "https://placehold.co/400x600/12121a/333333?text=Sin+Poster"
                }
                alt={`${movie.title} poster`}
                className="w-full"
                onError={(e) => {
                  (e.target as HTMLImageElement).src =
                    "https://placehold.co/400x600/12121a/333333?text=Sin+Poster";
                }}
              />
            </div>
          </div>

          {/* === Middle: Details === */}
          <div className="flex flex-col gap-6">
            {/* Genres */}
            {movie.genres?.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {movie.genres.map((g) => (
                  <span
                    key={g}
                    className="bg-primary/15 border border-primary/40 text-primary text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider"
                  >
                    {g}
                  </span>
                ))}
              </div>
            )}

            {/* Title */}
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-heading tracking-wide leading-none text-foreground">
              {movie.title}
            </h1>

            {/* Meta */}
            <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
              {movie.year > 0 && (
                <span className="flex items-center gap-1.5">
                  <Calendar className="w-4 h-4" />
                  {movie.year}
                </span>
              )}
              {movie.runtime > 0 && (
                <span className="flex items-center gap-1.5">
                  <Clock className="w-4 h-4" />
                  {formatRuntime(movie.runtime)}
                </span>
              )}
              {movie.language && (
                <span className="flex items-center gap-1.5 uppercase">
                  <Globe className="w-4 h-4" />
                  {movie.language}
                </span>
              )}
              {movie.mpa_rating && (
                <span className="border border-border px-2 py-0.5 rounded text-xs font-bold uppercase">
                  {movie.mpa_rating}
                </span>
              )}
              {movie.rating > 0 && (
                <span className="flex items-center gap-1.5 text-yellow-400 font-bold text-base">
                  <Star className="w-5 h-5 fill-current" />
                  {movie.rating.toFixed(1)}
                </span>
              )}
            </div>

            {/* Director */}
            {movie.director && (
              <p className="text-sm text-muted-foreground">
                <span className="text-foreground font-semibold">Director:</span>{" "}
                {movie.director}
              </p>
            )}

            {/* Trailer button */}
            {movie.yt_trailer_code && (
              <div>
                <button
                  onClick={() => setShowTrailer(true)}
                  className="flex items-center gap-2 bg-red-600/90 hover:bg-red-600 text-white px-5 py-2.5 rounded-lg font-bold uppercase tracking-wider text-sm transition-all hover:scale-105 active:scale-95 shadow-lg"
                  data-testid="btn-trailer"
                >
                  <Youtube className="w-5 h-5" />
                  Ver Tráiler
                </button>
              </div>
            )}

            {/* Tabs: Synopsis / Specs */}
            <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-xl">
              <div className="flex border-b border-border">
                {(["synopsis", "specs"] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`flex-1 py-4 text-sm font-bold uppercase tracking-wider transition-colors ${
                      activeTab === tab
                        ? "text-primary bg-primary/10 border-b-2 border-primary"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                    data-testid={`tab-${tab}`}
                  >
                    {tab === "synopsis" ? (
                      <span className="flex items-center justify-center gap-2">
                        <Info className="w-4 h-4" />
                        Sinopsis
                      </span>
                    ) : (
                      <span className="flex items-center justify-center gap-2">
                        <Download className="w-4 h-4" />
                        Especificaciones
                      </span>
                    )}
                  </button>
                ))}
              </div>

              <div className="p-6 md:p-8">
                {activeTab === "synopsis" && (
                  <p className="text-lg leading-relaxed text-muted-foreground">
                    {movie.synopsis ||
                      "No hay sinopsis disponible para este título."}
                  </p>
                )}

                {activeTab === "specs" && (
                  <div className="grid grid-cols-2 gap-4">
                    {[
                      { label: "Año", value: String(movie.year) },
                      {
                        label: "Duración",
                        value: formatRuntime(movie.runtime),
                      },
                      {
                        label: "Idioma",
                        value: movie.language?.toUpperCase() || "N/A",
                      },
                      {
                        label: "Clasificación",
                        value: movie.mpa_rating || "N/A",
                      },
                      {
                        label: "Géneros",
                        value: movie.genres?.join(", ") || "N/A",
                      },
                      {
                        label: "Puntuación",
                        value: movie.rating > 0 ? String(movie.rating) : "N/A",
                      },
                      ...(movie.director
                        ? [{ label: "Director", value: movie.director }]
                        : []),
                    ].map(({ label, value }) => (
                      <div
                        key={label}
                        className="bg-background/50 rounded-xl p-4 border border-border"
                      >
                        <p className="text-xs text-muted-foreground font-bold uppercase tracking-wider mb-1">
                          {label}
                        </p>
                        <p className="text-foreground font-semibold">{value}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Cast */}
            {movie.cast_list?.length > 0 && (
              <section>
                <h2 className="text-2xl font-heading tracking-wide mb-5 flex items-center gap-2">
                  <span className="w-1 h-6 bg-primary block rounded-full" />
                  Reparto Principal
                </h2>
                <div className="flex flex-wrap gap-2">
                  {movie.cast_list.map((actor) => (
                    <span
                      key={actor}
                      className="bg-card border border-border rounded-lg px-3 py-2 text-sm font-medium text-foreground hover:border-primary/50 transition-colors"
                    >
                      {actor}
                    </span>
                  ))}
                </div>
              </section>
            )}

            {/* Video Player */}
            {videoServers.length > 0 && (
              <section className="bg-card border border-border rounded-2xl shadow-xl overflow-hidden">
                <div className="px-6 pt-6 pb-4">
                  <h2 className="text-2xl font-heading tracking-wide mb-4 flex items-center gap-2 text-primary">
                    <PlayCircle className="w-5 h-5" />
                    Ver Online
                  </h2>
                  {/* Server buttons */}
                  <div className="flex items-center gap-2 flex-wrap mb-4">
                    <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground mr-1">
                      Servidor:
                    </span>
                    {videoServers.map((server, i) => (
                      <button
                        key={server.name + i}
                        onClick={() => setActiveServer(i)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
                          i === activeServer
                            ? "bg-primary text-primary-foreground shadow-[0_0_10px_rgba(0,212,255,0.3)]"
                            : "bg-secondary text-muted-foreground hover:text-foreground"
                        }`}
                        data-testid={`btn-server-${i}`}
                      >
                        {server.name}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="relative aspect-video bg-black w-full group">
                  <iframe
                    key={currentServerUrl}
                    src={currentServerUrl}
                    className="w-full h-full"
                    frameBorder="0"
                    allowFullScreen
                    allow="autoplay; fullscreen; picture-in-picture; encrypted-media; gyroscope; accelerometer; clipboard-write"
                    referrerPolicy="no-referrer"
                    title={`${movie.title} — ${videoServers[activeServer]?.name}`}
                    data-testid="video-player"
                  />
                  {/* Overlay controls */}
                  <div className="absolute top-2 right-2 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                    <button
                      onClick={() => setPlayerFullscreen(true)}
                      className="flex items-center gap-1.5 bg-black/80 hover:bg-primary/90 text-white px-3 py-1.5 rounded-lg text-xs font-bold backdrop-blur-sm transition-all border border-white/10 hover:border-primary/50"
                      title="Pantalla completa"
                    >
                      <Maximize2 className="w-3.5 h-3.5" />
                      Pantalla completa
                    </button>
                    <a
                      href={currentServerUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 bg-black/80 hover:bg-white/20 text-white px-3 py-1.5 rounded-lg text-xs font-bold backdrop-blur-sm transition-all border border-white/10"
                      title="Abrir en pestaña nueva"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      Nueva pestaña
                    </a>
                  </div>
                </div>
                <div className="flex items-center justify-between px-3 py-2 bg-black/40 border-t border-white/5">
                  <p className="text-muted-foreground text-xs">
                    Si el video no carga, prueba otro servidor arriba o ábrelo en nueva pestaña.
                  </p>
                  <button
                    onClick={() => setPlayerFullscreen(true)}
                    className="flex items-center gap-1 text-primary hover:text-primary/80 text-xs font-bold transition-colors flex-shrink-0 ml-3"
                  >
                    <Maximize2 className="w-3 h-3" />
                    Expandir
                  </button>
                </div>
              </section>
            )}

            {!videoServers.length && (
              <div className="bg-card border border-border rounded-2xl p-8 text-center text-muted-foreground">
                <PlayCircle className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="font-medium">
                  No hay fuentes de video configuradas para esta película.
                </p>
                <p className="text-sm mt-1">
                  Agrega fuentes de video desde el panel de administración.
                </p>
              </div>
            )}
          </div>

          {/* === Right Sidebar: Downloads === */}
          <div>
            <section className="bg-card border border-border rounded-2xl shadow-xl sticky top-24">
              <div className="p-6 border-b border-border">
                <h2 className="text-2xl font-heading tracking-wide flex items-center gap-2 text-primary">
                  <Download className="w-5 h-5" />
                  Descargas
                </h2>
                <p className="text-xs text-muted-foreground mt-1">
                  Todas las calidades disponibles
                </p>
              </div>

              {movie.torrents && movie.torrents.length > 0 ? (
                <div className="divide-y divide-border">
                  {movie.torrents.map((torrent, idx) => (
                    <div key={idx} className="p-4">
                      <div className="flex items-center justify-between mb-3">
                        <span
                          className={`text-xs font-bold px-2 py-1 rounded uppercase tracking-wider ${getQualityStyle(
                            torrent.quality
                          )}`}
                        >
                          {torrent.quality}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {torrent.size}
                        </span>
                      </div>
                      <div className="flex gap-2">
                        {torrent.url && (
                          <a
                            href={torrent.url}
                            target="_blank"
                            rel="noreferrer"
                            onClick={() =>
                              toast.success(
                                `Abriendo torrent ${torrent.quality}...`,
                                {
                                  description:
                                    "Asegúrate de tener un cliente BitTorrent instalado.",
                                }
                              )
                            }
                            className="flex-1 flex items-center justify-center gap-1.5 bg-primary/10 hover:bg-primary hover:text-primary-foreground text-primary border border-primary/30 hover:border-primary py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all"
                            data-testid={`btn-download-${idx}`}
                          >
                            <Download className="w-3.5 h-3.5" />
                            Descargar
                          </a>
                        )}
                        {torrent.url && (
                          <a
                            href={getMagnetUrl(torrent.url, movie.title)}
                            onClick={() =>
                              toast.success(
                                `Abriendo enlace magnet ${torrent.quality}...`
                              )
                            }
                            className="flex-1 flex items-center justify-center gap-1.5 bg-secondary hover:bg-primary/10 hover:text-primary hover:border-primary/30 border border-border text-muted-foreground py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all"
                          >
                            <Magnet className="w-3.5 h-3.5" />
                            Magnet
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-8 text-center text-muted-foreground">
                  <Download className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p>No hay descargas disponibles.</p>
                </div>
              )}
            </section>
          </div>
        </div>

        {/* Similar Movies */}
        {similar.length > 0 && (
          <div className="mt-16 border-t border-border pt-10">
            <MovieCarousel title="Películas Similares">
              {similar.map((m) => (
                <div
                  key={m.id}
                  className="w-[160px] md:w-[200px] lg:w-[240px] flex-none"
                >
                  <MovieCard movie={m} onSaveRecent={() => handleSaveRecent(m.id)} />
                </div>
              ))}
            </MovieCarousel>
          </div>
        )}
      </div>

      {/* === Trailer Modal === */}
      {showTrailer && movie.yt_trailer_code && (
        <div
          className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4"
          onClick={() => setShowTrailer(false)}
        >
          <div
            className="relative w-full max-w-4xl aspect-video"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowTrailer(false)}
              className="absolute -top-10 right-0 text-white hover:text-primary transition-colors"
            >
              <X className="w-8 h-8" />
            </button>
            <iframe
              src={`https://www.youtube.com/embed/${movie.yt_trailer_code}?autoplay=1`}
              allow="autoplay; fullscreen"
              allowFullScreen
              className="w-full h-full rounded-xl border border-border"
              title="Tráiler"
            />
          </div>
        </div>
      )}

      {/* === Fullscreen Player Modal === */}
      {playerFullscreen && currentServerUrl && (
        <div
          className="fixed inset-0 z-[200] bg-black flex flex-col"
          onKeyDown={(e) => e.key === "Escape" && setPlayerFullscreen(false)}
          tabIndex={-1}
        >
          {/* Top bar */}
          <div className="flex items-center justify-between px-4 py-2 bg-black/80 border-b border-white/10 flex-shrink-0">
            <div className="flex items-center gap-3">
              <Film className="w-4 h-4 text-primary" />
              <span className="text-white font-bold text-sm truncate max-w-[200px] sm:max-w-none">
                {movie?.title}
              </span>
              <span className="text-muted-foreground text-xs font-mono hidden sm:inline">
                — {videoServers[activeServer]?.name}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {/* Server switcher in fullscreen */}
              {videoServers.length > 1 && videoServers.map((s, i) => (
                <button
                  key={i}
                  onClick={() => setActiveServer(i)}
                  className={`px-2.5 py-1 rounded text-xs font-bold transition-all hidden sm:block ${
                    i === activeServer ? "bg-primary text-black" : "bg-white/10 text-white hover:bg-white/20"
                  }`}
                >
                  {s.name}
                </button>
              ))}
              <a
                href={currentServerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-white/60 hover:text-white text-xs transition-colors px-2 py-1 rounded hover:bg-white/10"
                title="Abrir en nueva pestaña"
              >
                <ExternalLink className="w-4 h-4" />
                <span className="hidden sm:inline">Nueva pestaña</span>
              </a>
              <button
                onClick={() => setPlayerFullscreen(false)}
                className="flex items-center gap-1.5 bg-white/10 hover:bg-red-600/80 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
              >
                <X className="w-4 h-4" />
                <span className="hidden sm:inline">Cerrar</span>
              </button>
            </div>
          </div>
          {/* Player fills entire remaining space */}
          <div className="flex-1 relative">
            <iframe
              key={`fs-${currentServerUrl}`}
              src={currentServerUrl}
              className="absolute inset-0 w-full h-full"
              frameBorder="0"
              allowFullScreen
              allow="autoplay; fullscreen; picture-in-picture; encrypted-media; gyroscope; accelerometer; clipboard-write"
              referrerPolicy="no-referrer"
              title={`${movie?.title} — Pantalla Completa`}
            />
          </div>
          {/* ESC hint */}
          <p className="text-center text-white/30 text-xs py-1.5 flex-shrink-0">
            Presiona <kbd className="font-mono bg-white/10 px-1.5 py-0.5 rounded text-[10px]">ESC</kbd> para salir · Usa el control del reproductor para pantalla completa nativa
          </p>
        </div>
      )}

      {/* === Lightbox === */}
      {lightboxSrc && (
        <div
          className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center p-4"
          onClick={() => setLightboxSrc(null)}
        >
          <button
            onClick={() => setLightboxSrc(null)}
            className="absolute top-4 right-4 text-white hover:text-primary"
          >
            <X className="w-8 h-8" />
          </button>
          <img
            src={lightboxSrc}
            alt="Captura"
            className="max-w-full max-h-[90vh] rounded-xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </PageTransition>
  );
}
