import { useState, useEffect } from "react";
import { useMovieDetails, useMovieSuggestions, getMagnetUrl, getBestQuality, RecentlyWatchedMovie } from "@/lib/yts";
import { getMovieByImdb, incrementViews } from "@/lib/admin-db";
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
  Image,
  X,
  Magnet,
  Youtube,
  Server,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { useLocalStorage } from "@/hooks/use-local-storage";

interface MovieDetailProps {
  params: { id: string };
}

const DEFAULT_VIDEO_SERVERS = [
  { name: "Server 1", label: "vidsrc.net", getUrl: (imdb: string) => `https://vidsrc.net/embed/movie/${imdb}` },
  { name: "Server 2", label: "multiembed", getUrl: (imdb: string) => `https://multiembed.mov/embed/imdb/${imdb}` },
  { name: "Server 3", label: "2embed", getUrl: (imdb: string) => `https://www.2embed.cc/embed/${imdb}` },
];

function getQualityBadgeStyle(quality: string) {
  if (quality.includes("2160")) return "bg-yellow-500/90 text-black font-bold";
  if (quality.includes("1080")) return "bg-blue-600/90 text-white font-bold";
  if (quality.includes("720")) return "bg-green-600/90 text-white font-bold";
  return "bg-secondary text-muted-foreground font-bold";
}

function formatRuntime(minutes: number) {
  if (!minutes) return "N/A";
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export default function MovieDetail({ params }: MovieDetailProps) {
  const { data, loading, error } = useMovieDetails(params.id);
  const { data: suggestionsData } = useMovieSuggestions(params.id);
  const [, setRecentMovies] = useLocalStorage<RecentlyWatchedMovie[]>("cv_recently_watched", []);

  const [activeServer, setActiveServer] = useState(0);
  const [activeTab, setActiveTab] = useState<"synopsis" | "specs">("synopsis");
  const [activeSpecIdx, setActiveSpecIdx] = useState(0);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [lightboxIdx, setLightboxIdx] = useState(0);
  const [showTrailer, setShowTrailer] = useState(false);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [params.id]);

  useEffect(() => {
    if (data?.movie) {
      const movie = data.movie;
      document.title = `${movie.title} (${movie.year}) — CineVault`;
      // Track view in local DB if movie exists there
      if (movie.imdb_code) {
        const local = getMovieByImdb(movie.imdb_code);
        if (local) incrementViews(movie.imdb_code);
      }

      let metaDesc = document.querySelector('meta[name="description"]');
      if (!metaDesc) {
        metaDesc = document.createElement("meta");
        metaDesc.setAttribute("name", "description");
        document.head.appendChild(metaDesc);
      }
      metaDesc.setAttribute("content", (movie.synopsis || movie.summary || "").slice(0, 160));

      // Open Graph
      const setOG = (prop: string, content: string) => {
        let el = document.querySelector(`meta[property="${prop}"]`);
        if (!el) {
          el = document.createElement("meta");
          el.setAttribute("property", prop);
          document.head.appendChild(el);
        }
        el.setAttribute("content", content);
      };
      setOG("og:title", `${movie.title} (${movie.year})`);
      setOG("og:description", (movie.synopsis || movie.summary || "").slice(0, 200));
      setOG("og:image", movie.large_cover_image || movie.medium_cover_image);
      setOG("og:type", "video.movie");
    }
    return () => {
      document.title = "CineVault — Premium Movie Streaming";
    };
  }, [data]);

  if (loading) {
    return (
      <div className="min-h-screen pt-20 flex items-center justify-center">
        <div className="flex flex-col items-center">
          <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
          <p className="mt-4 font-heading tracking-widest text-muted-foreground text-xl">Loading Movie...</p>
        </div>
      </div>
    );
  }

  if (error || !data?.movie) {
    return (
      <div className="min-h-screen pt-32 px-4 text-center">
        <h2 className="text-4xl font-heading text-destructive mb-4">Movie Not Found</h2>
        <p className="text-muted-foreground">Could not load this movie. Try browsing for another title.</p>
      </div>
    );
  }

  const { movie } = data;

  // Check local DB for this movie (by IMDb code) — use its custom video sources if present
  const localMovie = movie.imdb_code ? getMovieByImdb(movie.imdb_code) : undefined;
  const VIDEO_SERVERS = localMovie?.video_sources && localMovie.video_sources.length > 0
    ? localMovie.video_sources
        .filter(s => s.active)
        .map(s => ({ name: s.name, label: s.name, getUrl: () => s.url }))
    : DEFAULT_VIDEO_SERVERS;

  const backdropUrl = localMovie?.background_url
    || `https://yts.mx/assets/images/movies/${movie.slug}/background.jpg`;
  const screenshots = [1, 2, 3].map(n => ({
    medium: `https://yts.mx/assets/images/movies/${movie.slug}/medium-screenshot${n}.jpg`,
    large: `https://yts.mx/assets/images/movies/${movie.slug}/large-screenshot${n}.jpg`,
    idx: n - 1,
  }));
  const screenshotLarges = screenshots.map(s => s.large);

  const handleSaveRecent = () => {
    setRecentMovies(prev => {
      const filtered = prev.filter(m => m.id !== movie.id);
      return [
        {
          id: movie.id,
          slug: movie.slug,
          title: movie.title,
          year: movie.year,
          rating: movie.rating,
          medium_cover_image: movie.medium_cover_image,
          timestamp: Date.now(),
          quality: getBestQuality(movie.torrents) || undefined,
          genres: movie.genres,
        },
        ...filtered,
      ].slice(0, 10);
    });
  };

  const handleDownload = (quality: string, type: string) => {
    toast.success(`Opening ${quality} ${type} torrent...`, {
      description: "Ensure you have a BitTorrent client installed.",
    });
  };

  const handleMagnet = (quality: string) => {
    toast.success(`Opening ${quality} magnet link...`);
  };

  const openLightbox = (largeUrl: string, idx: number) => {
    setLightboxSrc(largeUrl);
    setLightboxIdx(idx);
  };

  const closeLightbox = () => setLightboxSrc(null);

  const lightboxPrev = () => {
    const newIdx = (lightboxIdx - 1 + screenshotLarges.length) % screenshotLarges.length;
    setLightboxIdx(newIdx);
    setLightboxSrc(screenshotLarges[newIdx]);
  };

  const lightboxNext = () => {
    const newIdx = (lightboxIdx + 1) % screenshotLarges.length;
    setLightboxIdx(newIdx);
    setLightboxSrc(screenshotLarges[newIdx]);
  };

  const activeTorrent = movie.torrents?.[activeSpecIdx];

  return (
    <PageTransition>
      <div className="min-h-screen pb-20">

        {/* === BACKDROP HEADER === */}
        <div className="relative w-full h-[65vh] min-h-[520px]">
          <div className="absolute inset-0 z-0 overflow-hidden">
            <img
              src={backdropUrl}
              alt={movie.title}
              className="w-full h-full object-cover blur-[2px] scale-105 opacity-70"
              onError={(e) => {
                (e.target as HTMLImageElement).src =
                  movie.background_image_original || movie.background_image || "";
              }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-background via-background/75 to-background/10"></div>
            <div className="absolute inset-0 bg-gradient-to-r from-background/60 to-transparent"></div>
          </div>

          <div className="relative z-10 max-w-6xl mx-auto px-4 md:px-8 h-full flex items-end pb-10">
            <div className="flex flex-col md:flex-row gap-8 items-end md:items-start w-full">
              {/* Poster */}
              <div className="w-44 md:w-60 flex-shrink-0 rounded-xl overflow-hidden shadow-[0_0_40px_rgba(0,0,0,0.9)] border border-white/10 -mt-28 md:-mt-44 self-end md:self-auto">
                <img
                  src={movie.large_cover_image || movie.medium_cover_image}
                  alt={movie.title}
                  className="w-full h-auto object-cover"
                />
              </div>

              {/* Meta */}
              <div className="flex-1 pb-2">
                <h1 className="text-4xl md:text-6xl font-heading tracking-wide mb-3 text-white leading-none drop-shadow-lg">
                  {movie.title}
                </h1>
                <div className="flex flex-wrap items-center gap-3 text-sm font-medium mb-4">
                  <span className="flex items-center gap-1 bg-white/10 px-2 py-1 rounded backdrop-blur-md">
                    <Calendar className="w-4 h-4" /> {movie.year}
                  </span>
                  <span className="flex items-center gap-1 bg-yellow-500/20 px-2 py-1 rounded backdrop-blur-md text-yellow-400">
                    <Star className="w-4 h-4 fill-current" /> {movie.rating} / 10
                  </span>
                  {movie.runtime > 0 && (
                    <span className="flex items-center gap-1 bg-white/10 px-2 py-1 rounded backdrop-blur-md">
                      <Clock className="w-4 h-4" /> {formatRuntime(movie.runtime)}
                    </span>
                  )}
                  <span className="flex items-center gap-1 bg-white/10 px-2 py-1 rounded backdrop-blur-md uppercase">
                    <Globe className="w-4 h-4" /> {movie.language}
                  </span>
                  {movie.mpa_rating && (
                    <span className="border border-white/30 px-2 py-1 rounded text-xs font-bold uppercase">
                      {movie.mpa_rating}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-2 mb-4">
                  {movie.genres?.map(genre => (
                    <span
                      key={genre}
                      className="bg-primary/20 border border-primary/40 text-primary px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest backdrop-blur-sm"
                    >
                      {genre}
                    </span>
                  ))}
                </div>
                {/* Trailer button */}
                {movie.yt_trailer_code && (
                  <button
                    onClick={() => setShowTrailer(true)}
                    className="flex items-center gap-2 bg-red-600/90 hover:bg-red-600 text-white px-5 py-2.5 rounded-lg font-bold uppercase tracking-wider text-sm transition-all hover:scale-105 active:scale-95 shadow-lg"
                    data-testid="btn-trailer"
                  >
                    <Youtube className="w-5 h-5" />
                    Watch Trailer
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* === MAIN CONTENT === */}
        <div className="max-w-6xl mx-auto px-4 md:px-8 mt-6 grid grid-cols-1 lg:grid-cols-3 gap-10">

          {/* Left: Synopsis / Specs / Cast / Screenshots / Player */}
          <div className="lg:col-span-2 space-y-8">

            {/* Tabs: Synopsis | Tech Specs */}
            <section className="bg-card/60 backdrop-blur-md border border-border rounded-2xl shadow-xl overflow-hidden">
              <div className="flex border-b border-border">
                {(["synopsis", "specs"] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`flex-1 py-4 text-sm font-bold uppercase tracking-widest transition-colors ${
                      activeTab === tab
                        ? "text-primary border-b-2 border-primary bg-primary/5"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                    data-testid={`tab-${tab}`}
                  >
                    {tab === "synopsis" ? (
                      <span className="flex items-center justify-center gap-2"><Info className="w-4 h-4" />Synopsis</span>
                    ) : (
                      <span className="flex items-center justify-center gap-2"><Server className="w-4 h-4" />Tech Specs</span>
                    )}
                  </button>
                ))}
              </div>

              <div className="p-6 md:p-8">
                {activeTab === "synopsis" && (
                  <p className="text-lg leading-relaxed text-muted-foreground">
                    {movie.description_full || movie.summary || "No synopsis available for this title."}
                  </p>
                )}

                {activeTab === "specs" && movie.torrents && movie.torrents.length > 0 && (
                  <div>
                    {/* Quality tabs */}
                    <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
                      {movie.torrents.map((t, i) => (
                        <button
                          key={`${t.hash}-${i}`}
                          onClick={() => setActiveSpecIdx(i)}
                          className={`flex-shrink-0 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
                            activeSpecIdx === i
                              ? getQualityBadgeStyle(t.quality) + " shadow-lg"
                              : "bg-secondary text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          {t.quality} {t.type}
                        </button>
                      ))}
                    </div>

                    {activeTorrent && (
                      <div className="grid grid-cols-2 gap-4">
                        {[
                          { label: "Quality", value: activeTorrent.quality },
                          { label: "Source", value: activeTorrent.type },
                          { label: "File Size", value: activeTorrent.size },
                          { label: "Language", value: movie.language?.toUpperCase() || "EN" },
                          { label: "Runtime", value: formatRuntime(movie.runtime) },
                          { label: "MPA Rating", value: movie.mpa_rating || "N/A" },
                          ...(activeTorrent.video_codec ? [{ label: "Video Codec", value: activeTorrent.video_codec }] : []),
                          ...(activeTorrent.audio_channels ? [{ label: "Audio", value: activeTorrent.audio_channels }] : []),
                          ...(activeTorrent.bit_depth ? [{ label: "Bit Depth", value: activeTorrent.bit_depth + "-bit" }] : []),
                          ...(activeTorrent.fps ? [{ label: "FPS", value: String(activeTorrent.fps) }] : []),
                          { label: "Seeds", value: String(activeTorrent.seeds) },
                          { label: "Peers", value: String(activeTorrent.peers) },
                        ].map(({ label, value }) => (
                          <div key={label} className="bg-background/50 rounded-xl p-4 border border-border">
                            <p className="text-xs text-muted-foreground font-bold uppercase tracking-wider mb-1">{label}</p>
                            <p className="text-foreground font-semibold">{value}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </section>

            {/* Cast */}
            {movie.cast && movie.cast.length > 0 && (
              <section>
                <h2 className="text-2xl font-heading tracking-wide mb-5 flex items-center gap-2">
                  <span className="w-1 h-6 bg-primary block rounded-full"></span>
                  Top Cast
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {movie.cast.map(actor => (
                    <div
                      key={actor.imdb_code}
                      className="flex items-center gap-3 bg-card/60 border border-border p-3 rounded-xl hover:border-primary/40 transition-colors backdrop-blur-sm"
                    >
                      <div className="w-14 h-14 rounded-full overflow-hidden bg-muted flex-shrink-0 ring-2 ring-border">
                        {actor.url_small_image ? (
                          <img
                            src={actor.url_small_image}
                            alt={actor.name}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              const el = e.target as HTMLImageElement;
                              el.style.display = "none";
                            }}
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-xl font-heading text-muted-foreground bg-gradient-to-br from-card to-muted">
                            {actor.name.charAt(0)}
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-bold text-sm text-foreground truncate">{actor.name}</h3>
                        <p className="text-xs text-muted-foreground truncate italic">{actor.character_name}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Screenshots */}
            <section>
              <h2 className="text-2xl font-heading tracking-wide mb-5 flex items-center gap-2">
                <span className="w-1 h-6 bg-primary block rounded-full"></span>
                <Image className="w-5 h-5" />
                Screenshots
              </h2>
              <div className="grid grid-cols-3 gap-3">
                {screenshots.map(({ medium, large, idx }) => (
                  <button
                    key={idx}
                    onClick={() => openLightbox(large, idx)}
                    className="relative aspect-video rounded-xl overflow-hidden border border-border hover:border-primary transition-all hover:scale-[1.02] shadow-md group"
                    data-testid={`btn-screenshot-${idx}`}
                  >
                    <img
                      src={medium}
                      alt={`Screenshot ${idx + 1}`}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      loading="lazy"
                      onError={(e) => {
                        (e.target as HTMLImageElement).closest("button")?.classList.add("hidden");
                      }}
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 rounded-full p-2">
                        <Image className="w-5 h-5 text-white" />
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </section>

            {/* Video Player */}
            {movie.imdb_code && (
              <section className="bg-card border border-border rounded-2xl shadow-xl overflow-hidden">
                <div className="px-6 pt-6 pb-4">
                  <h2 className="text-2xl font-heading tracking-wide mb-4 flex items-center gap-2 text-primary">
                    <PlayCircle className="w-5 h-5" />
                    Watch Online
                  </h2>
                  {/* Server buttons */}
                  <div className="flex items-center gap-2 flex-wrap mb-4">
                    <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground mr-1">Stream via:</span>
                    {VIDEO_SERVERS.map((server, i) => (
                      <button
                        key={server.name}
                        onClick={() => { setActiveServer(i); handleSaveRecent(); }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
                          activeServer === i
                            ? "bg-primary text-primary-foreground shadow-[0_0_10px_rgba(0,212,255,0.4)]"
                            : "bg-secondary text-muted-foreground hover:border-primary hover:text-primary border border-border"
                        }`}
                        data-testid={`btn-server-${i}`}
                      >
                        {server.name}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="w-full aspect-video bg-black relative">
                  <iframe
                    key={`${movie.imdb_code}-${activeServer}`}
                    src={VIDEO_SERVERS[activeServer].getUrl(movie.imdb_code)}
                    width="100%"
                    height="100%"
                    allowFullScreen
                    className="absolute inset-0 w-full h-full"
                    title={`${movie.title} — ${VIDEO_SERVERS[activeServer].name}`}
                  />
                </div>
              </section>
            )}
          </div>

          {/* Right: Downloads */}
          <div className="space-y-6">
            <section className="bg-card border border-border rounded-2xl shadow-xl sticky top-24">
              <div className="p-6 border-b border-border">
                <h2 className="text-2xl font-heading tracking-wide flex items-center gap-2 text-primary">
                  <Download className="w-5 h-5" />
                  Downloads
                </h2>
                <p className="text-xs text-muted-foreground mt-1">All available qualities</p>
              </div>

              {movie.torrents && movie.torrents.length > 0 ? (
                <div className="divide-y divide-border">
                  {movie.torrents.map((torrent, idx) => (
                    <div key={`${torrent.hash}-${idx}`} className="p-4 hover:bg-secondary/30 transition-colors">
                      {/* Quality header */}
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`text-xs px-2 py-0.5 rounded ${getQualityBadgeStyle(torrent.quality)}`}>
                          {torrent.quality}
                        </span>
                        <span className="text-xs bg-secondary px-2 py-0.5 rounded text-muted-foreground uppercase font-bold tracking-wider">
                          {torrent.type}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mb-3">
                        {torrent.size} &nbsp;·&nbsp; {torrent.seeds} seeds &nbsp;·&nbsp; {torrent.peers} peers
                      </p>
                      <div className="flex gap-2">
                        <a
                          href={torrent.url}
                          onClick={() => handleDownload(torrent.quality, torrent.type)}
                          className="flex-1 flex items-center justify-center gap-1.5 bg-primary/10 hover:bg-primary hover:text-primary-foreground text-primary border border-primary/30 hover:border-primary py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all"
                          data-testid={`btn-download-${idx}`}
                        >
                          <Download className="w-3.5 h-3.5" />
                          Download
                        </a>
                        <a
                          href={getMagnetUrl(torrent, movie.title)}
                          onClick={() => handleMagnet(torrent.quality)}
                          className="flex-1 flex items-center justify-center gap-1.5 bg-secondary hover:bg-primary/10 hover:text-primary hover:border-primary/30 border border-border text-muted-foreground py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all"
                          data-testid={`btn-magnet-${idx}`}
                        >
                          <Magnet className="w-3.5 h-3.5" />
                          Magnet
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-6 text-center text-muted-foreground">No downloads available.</div>
              )}
            </section>
          </div>
        </div>

        {/* Similar Movies */}
        {suggestionsData?.movies && suggestionsData.movies.length > 0 && (
          <div className="max-w-[1600px] mx-auto mt-16 border-t border-border pt-10">
            <MovieCarousel title="Similar Movies">
              {suggestionsData.movies.map(m => (
                <div key={m.id} className="w-[160px] md:w-[200px] lg:w-[240px] flex-none">
                  <MovieCard movie={m} />
                </div>
              ))}
            </MovieCarousel>
          </div>
        )}
      </div>

      {/* === LIGHTBOX MODAL === */}
      {lightboxSrc && (
        <div
          className="fixed inset-0 z-[200] bg-black/95 flex items-center justify-center p-4 backdrop-blur-sm"
          onClick={closeLightbox}
          data-testid="lightbox-overlay"
        >
          <button
            onClick={closeLightbox}
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors z-10"
          >
            <X className="w-5 h-5" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); lightboxPrev(); }}
            className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors z-10"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); lightboxNext(); }}
            className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors z-10"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
          <img
            src={lightboxSrc}
            alt="Screenshot"
            className="max-w-full max-h-[85vh] object-contain rounded-xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            onError={(e) => {
              (e.target as HTMLImageElement).src = screenshots[lightboxIdx]?.medium || "";
            }}
          />
          <p className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/60 text-sm">
            {lightboxIdx + 1} / {screenshotLarges.length}
          </p>
        </div>
      )}

      {/* === TRAILER MODAL === */}
      {showTrailer && movie.yt_trailer_code && (
        <div
          className="fixed inset-0 z-[200] bg-black/95 flex items-center justify-center p-4 backdrop-blur-sm"
          onClick={() => setShowTrailer(false)}
          data-testid="trailer-overlay"
        >
          <button
            onClick={() => setShowTrailer(false)}
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors z-10"
          >
            <X className="w-5 h-5" />
          </button>
          <div
            className="w-full max-w-4xl aspect-video rounded-2xl overflow-hidden shadow-2xl border border-white/10"
            onClick={(e) => e.stopPropagation()}
          >
            <iframe
              src={`https://www.youtube.com/embed/${movie.yt_trailer_code}?autoplay=1`}
              width="100%"
              height="100%"
              allowFullScreen
              allow="autoplay"
              className="w-full h-full"
              title="Trailer"
            />
          </div>
        </div>
      )}
    </PageTransition>
  );
}
