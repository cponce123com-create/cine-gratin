import { useState, useEffect, useCallback, useRef } from "react";
import {
  Star, Calendar, Globe, PlayCircle, X, Youtube, Maximize2, ExternalLink,
  Tv, ChevronDown, ChevronLeft, SkipForward, SkipBack, Users,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { PageTransition } from "@/components/layout/PageTransition";
import { MovieCarousel } from "@/components/movie/MovieCarousel";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { apiGetOneSeries, apiGetSeries, apiIncrementSeriesView, type LocalSeries, type SeasonInfo } from "@/lib/api-client";

interface SeriesDetailProps {
  params: { id: string };
}

interface Progress {
  season: number;
  episode: number;
  serverIdx: number;
}

function statusLabel(s: string) {
  if (s === "Returning Series") return { text: "En emisión", cls: "bg-green-500/20 text-green-400 border border-green-500/30" };
  if (s === "Ended") return { text: "Finalizada", cls: "bg-gray-500/20 text-gray-400 border border-gray-500/30" };
  if (s === "Canceled") return { text: "Cancelada", cls: "bg-red-500/20 text-red-400 border border-red-500/30" };
  return { text: s, cls: "bg-white/5 text-muted-foreground border border-border" };
}

function getSeriesUrl(series: LocalSeries, serverIdx: number, season: number, episode: number): string {
  const src = series.video_sources?.[serverIdx];
  if (!src) {
    // Fallback to VidSrc Pro
    const ss = String(season).padStart(2, "0");
    const ee = String(episode).padStart(2, "0");
    return `https://vidsrc.pro/embed/tv/${series.imdb_id}/${ss}/${ee}`;
  }
  const ss = String(season).padStart(2, "0");
  const ee = String(episode).padStart(2, "0");
  return src.url
    .replace("{IMDB_ID}", series.imdb_id)
    .replace("{SEASON}", ss)
    .replace("{EPISODE}", ee);
}

// ─── Small series card for related section ────────────────────────────────────
function RelatedSeriesCard({ series }: { series: LocalSeries }) {
  const [, setLocation] = useLocation();
  return (
    <button
      onClick={() => setLocation(`/series/${series.id}`)}
      className="group relative block w-full aspect-[2/3] rounded-xl overflow-hidden bg-card border border-border shadow-md transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_0_20px_rgba(0,212,255,0.3)] hover:z-10 text-left"
    >
      <img
        src={series.poster_url || "https://placehold.co/400x600/12121a/333333?text=Sin+Poster"}
        alt={series.title}
        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
        loading="lazy"
        onError={(e) => { (e.target as HTMLImageElement).src = "https://placehold.co/400x600/12121a/333333?text=Sin+Poster"; }}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-3">
        <p className="text-white font-bold text-xs line-clamp-2 text-center">{series.title}</p>
        {series.rating > 0 && (
          <p className="text-yellow-400 text-[10px] text-center mt-0.5 flex items-center justify-center gap-0.5">
            <Star className="w-2.5 h-2.5 fill-current" />{series.rating.toFixed(1)}
          </p>
        )}
      </div>
    </button>
  );
}

export default function SeriesDetail({ params }: SeriesDetailProps) {
  const [, setLocation] = useLocation();
  const [series, setSeries] = useState<LocalSeries | null>(null);
  const [related, setRelated] = useState<LocalSeries[]>([]);
  const [notFound, setNotFound] = useState(false);

  const [season, setSeason] = useState(1);
  const [episode, setEpisode] = useState(1);
  const [activeServer, setActiveServer] = useState(0);
  const [openSeasonIdx, setOpenSeasonIdx] = useState(0);
  const [playerFullscreen, setPlayerFullscreen] = useState(false);
  const [showTrailer, setShowTrailer] = useState(false);
  const [activeTab, setActiveTab] = useState<"synopsis" | "cast">("synopsis");

  const episodeGridRef = useRef<HTMLDivElement>(null);

  const progressKey = `cv_progress_${params.id}`;
  const [, setWatched] = useLocalStorage<string[]>("cv_series_watched", []);

  // Load series
  useEffect(() => {
    const load = async () => {
      try {
        const s = await apiGetOneSeries(params.id);
        setSeries(s);

        // SEO meta tags
        const yearRange = s.end_year && s.end_year !== s.year ? `${s.year}–${s.end_year}` : String(s.year);
        document.title = `${s.title} (${yearRange}) — Cine Gratín`;
        const desc = (s.synopsis || "").slice(0, 160);
        const setMeta = (name: string, content: string) => {
          let el = document.querySelector(`meta[name="${name}"]`) as HTMLMetaElement;
          if (!el) { el = document.createElement("meta"); el.name = name; document.head.appendChild(el); }
          el.content = content;
        };
        const setOg = (prop: string, content: string) => {
          let el = document.querySelector(`meta[property="${prop}"]`) as HTMLMetaElement;
          if (!el) { el = document.createElement("meta"); el.setAttribute("property", prop); document.head.appendChild(el); }
          el.content = content;
        };
        setMeta("description", desc);
        setOg("og:title", `${s.title} — Cine Gratín`);
        setOg("og:description", desc);
        setOg("og:image", s.poster_url || s.background_url || "");
        setOg("og:type", "video.tv_show");

        // Restore progress from localStorage
        try {
          const raw = localStorage.getItem(progressKey);
          if (raw) {
            const p: Progress = JSON.parse(raw);
            setSeason(p.season ?? 1);
            setEpisode(p.episode ?? 1);
            setActiveServer(p.serverIdx ?? 0);
            // Open the saved season accordion
            const savedSeasonIdx = (s.seasons_data || []).findIndex(sd => sd.season === p.season);
            setOpenSeasonIdx(savedSeasonIdx >= 0 ? savedSeasonIdx : 0);
          }
        } catch {}

        // Related series (same genre)
        const genre = s.genres?.[0];
        if (genre) {
          const all = await apiGetSeries().catch(() => [] as LocalSeries[]);
          setRelated(all.filter(x => x.id !== s.id && x.genres?.includes(genre)).slice(0, 20));
        }

        // Increment views
        apiIncrementSeriesView(s.id).catch(() => {});
      } catch {
        setNotFound(true);
      }
    };
    load();
    window.scrollTo({ top: 0, behavior: "smooth" });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  // Save progress when ep/season/server changes
  useEffect(() => {
    if (!series) return;
    try {
      localStorage.setItem(progressKey, JSON.stringify({ season, episode, serverIdx: activeServer }));
    } catch {}
  }, [season, episode, activeServer, series, progressKey]);

  // ESC key for fullscreen
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
    return () => { document.removeEventListener("keydown", handleEsc); document.body.style.overflow = ""; };
  }, [playerFullscreen, handleEsc]);

  if (notFound) {
    return (
      <div className="min-h-screen pt-32 px-4 text-center">
        <Tv className="w-20 h-20 text-muted-foreground/30 mx-auto mb-6" />
        <h2 className="text-4xl font-heading text-destructive mb-4">Serie No Encontrada</h2>
        <p className="text-muted-foreground mb-8">No se pudo cargar esta serie.</p>
        <Link href="/series" className="bg-primary text-primary-foreground px-6 py-3 rounded-lg font-bold hover:bg-primary/90 transition-colors">
          Ver Series
        </Link>
      </div>
    );
  }

  if (!series) {
    return (
      <div className="min-h-screen pt-20 flex items-center justify-center">
        <div className="flex flex-col items-center">
          <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="mt-4 font-heading tracking-widest text-muted-foreground text-xl">Cargando Serie...</p>
        </div>
      </div>
    );
  }

  const seasons: SeasonInfo[] = series.seasons_data?.length
    ? series.seasons_data
    : Array.from({ length: series.total_seasons || 1 }, (_, i) => ({ season: i + 1, episodes: 20 }));

  const currentSeasonData = seasons.find(s => s.season === season);
  const episodeCount = currentSeasonData?.episodes ?? 20;
  const activeServers = series.video_sources?.filter(s => s.active) ?? [];
  const currentUrl = getSeriesUrl(series, activeServer, season, episode);

  const goToEpisode = (s: number, e: number) => {
    setSeason(s);
    setEpisode(e);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const goNext = () => {
    if (episode < episodeCount) { setEpisode(ep => ep + 1); }
    else {
      const next = seasons.find(s => s.season === season + 1);
      if (next) { setSeason(s => s + 1); setEpisode(1); }
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const goPrev = () => {
    if (episode > 1) { setEpisode(ep => ep - 1); }
    else if (season > 1) {
      const prev = seasons.find(s => s.season === season - 1);
      setSeason(s => s - 1);
      setEpisode(prev?.episodes ?? 1);
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const isFirst = episode === 1 && season === 1;
  const isLast = episode === episodeCount && season === seasons[seasons.length - 1]?.season;
  const st = statusLabel(series.status);
  const yearRange = series.end_year && series.end_year !== series.year
    ? `${series.year}–${series.end_year}` : String(series.year);

  return (
    <PageTransition>
      {/* === Backdrop === */}
      <div className="relative w-full h-[50vh] min-h-[400px] overflow-hidden">
        {series.background_url ? (
          <img src={series.background_url} alt={series.title} className="absolute inset-0 w-full h-full object-cover scale-105" />
        ) : series.poster_url ? (
          <img src={series.poster_url} alt={series.title} className="absolute inset-0 w-full h-full object-cover scale-105 blur-sm opacity-40" />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-card via-background to-black" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-background/80 via-transparent to-transparent" />
      </div>

      {/* === Main Content === */}
      <div className="max-w-[1400px] mx-auto px-4 md:px-8 -mt-60 relative z-10 pb-16">
        {/* Back button */}
        <button
          onClick={() => setLocation("/series")}
          className="flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors mb-6 text-sm font-bold"
        >
          <ChevronLeft className="w-4 h-4" />
          Volver a Series
        </button>

        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-8">
          {/* === Poster === */}
          <div className="flex flex-col items-center lg:items-start gap-4">
            <div className="w-44 lg:w-full max-w-[260px] rounded-2xl overflow-hidden shadow-[0_0_40px_rgba(0,0,0,0.8)] border border-border">
              <img
                src={series.poster_url || "https://placehold.co/400x600/12121a/333333?text=Sin+Poster"}
                alt={`${series.title} poster`}
                className="w-full"
                onError={(e) => { (e.target as HTMLImageElement).src = "https://placehold.co/400x600/12121a/333333?text=Sin+Poster"; }}
              />
            </div>
            {/* Rating */}
            {series.rating > 0 && (
              <div className="flex items-center gap-2 bg-yellow-400/10 border border-yellow-400/30 rounded-xl px-4 py-2.5 w-full justify-center">
                <Star className="w-5 h-5 text-yellow-400 fill-current" />
                <span className="text-yellow-400 font-bold text-xl">{series.rating.toFixed(1)}</span>
                <span className="text-muted-foreground text-sm">/ 10</span>
              </div>
            )}
          </div>

          {/* === Details === */}
          <div className="flex flex-col gap-6">
            {/* Genres */}
            {series.genres?.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {series.genres.map(g => (
                  <span key={g} className="bg-primary/15 border border-primary/40 text-primary text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider">{g}</span>
                ))}
              </div>
            )}

            {/* Title */}
            <div>
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-heading tracking-wide leading-none text-foreground">{series.title}</h1>
              <div className="flex flex-wrap items-center gap-3 mt-4 text-sm text-muted-foreground">
                <span className="flex items-center gap-1.5"><Calendar className="w-4 h-4" />{yearRange}</span>
                <span className="flex items-center gap-1.5"><Tv className="w-4 h-4" />{series.total_seasons} temporada{series.total_seasons !== 1 ? "s" : ""}</span>
                {series.language && <span className="flex items-center gap-1.5 uppercase"><Globe className="w-4 h-4" />{series.language}</span>}
                {series.status && (
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${st.cls}`}>{st.text}</span>
                )}
              </div>
            </div>

            {/* Creators */}
            {series.creators?.length > 0 && (
              <p className="text-sm text-muted-foreground">
                <span className="text-foreground font-semibold">Creadores:</span>{" "}{series.creators.join(", ")}
              </p>
            )}

            {/* Trailer */}
            {series.yt_trailer_code && (
              <button
                onClick={() => setShowTrailer(true)}
                className="flex items-center gap-2 bg-red-600/90 hover:bg-red-600 text-white px-5 py-2.5 rounded-lg font-bold uppercase tracking-wider text-sm transition-all hover:scale-105 active:scale-95 shadow-lg w-fit"
              >
                <Youtube className="w-5 h-5" />
                Ver Tráiler
              </button>
            )}

            {/* Tabs: Synopsis / Cast */}
            <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-xl">
              <div className="flex border-b border-border">
                {(["synopsis", "cast"] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`flex-1 py-4 text-sm font-bold uppercase tracking-wider transition-colors ${
                      activeTab === tab ? "text-primary bg-primary/10 border-b-2 border-primary" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {tab === "synopsis"
                      ? <span className="flex items-center justify-center gap-2"><Tv className="w-4 h-4" />Sinopsis</span>
                      : <span className="flex items-center justify-center gap-2"><Users className="w-4 h-4" />Reparto</span>}
                  </button>
                ))}
              </div>
              <div className="p-6">
                {activeTab === "synopsis" && (
                  <p className="text-lg leading-relaxed text-muted-foreground">
                    {series.synopsis || "No hay sinopsis disponible."}
                  </p>
                )}
                {activeTab === "cast" && (
                  series.cast_list?.length > 0
                    ? <div className="flex flex-wrap gap-2">
                        {series.cast_list.map(actor => (
                          <span key={actor} className="bg-background/50 border border-border rounded-lg px-3 py-2 text-sm font-medium text-foreground hover:border-primary/50 transition-colors">{actor}</span>
                        ))}
                      </div>
                    : <p className="text-muted-foreground">No hay información de reparto.</p>
                )}
              </div>
            </div>

            {/* === Season / Episode selector === */}
            <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-xl">
              <div className="px-6 pt-5 pb-4 border-b border-border flex items-center justify-between gap-4">
                <h2 className="text-xl font-heading tracking-wide flex items-center gap-2 text-primary">
                  <PlayCircle className="w-5 h-5" />
                  Ver Online
                </h2>
                {/* Server selector */}
                {activeServers.length > 0 && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Servidor:</span>
                    {activeServers.map((srv, i) => (
                      <button
                        key={srv.id}
                        onClick={() => setActiveServer(i)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
                          i === activeServer
                            ? "bg-primary text-primary-foreground shadow-[0_0_10px_rgba(0,212,255,0.3)]"
                            : "bg-secondary text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {srv.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Season accordion */}
              <div className="divide-y divide-border/50">
                {seasons.map((sd, sIdx) => {
                  const isOpen = sIdx === openSeasonIdx;
                  const epCount = sd.episodes ?? 20;
                  return (
                    <div key={sd.season}>
                      <button
                        onClick={() => setOpenSeasonIdx(isOpen ? -1 : sIdx)}
                        className="w-full flex items-center justify-between px-6 py-4 hover:bg-white/5 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <span className={`font-bold text-sm ${season === sd.season ? "text-primary" : "text-foreground"}`}>
                            Temporada {sd.season}
                          </span>
                          {sd.name && sd.name !== `Season ${sd.season}` && (
                            <span className="text-muted-foreground text-xs">{sd.name}</span>
                          )}
                          <span className="text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">{epCount} ep.</span>
                          {season === sd.season && (
                            <span className="text-xs text-primary font-bold bg-primary/10 border border-primary/30 px-2 py-0.5 rounded-full">
                              Ep. {episode}
                            </span>
                          )}
                        </div>
                        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
                      </button>
                      {isOpen && (
                        <div ref={episodeGridRef} className="px-6 pb-5 grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12 gap-2">
                          {Array.from({ length: epCount }, (_, i) => i + 1).map(ep => {
                            const isActive = season === sd.season && episode === ep;
                            return (
                              <button
                                key={ep}
                                onClick={() => goToEpisode(sd.season, ep)}
                                className={`aspect-square rounded-lg text-xs font-bold transition-all ${
                                  isActive
                                    ? "bg-primary text-primary-foreground shadow-[0_0_8px_rgba(0,212,255,0.4)] scale-110"
                                    : "bg-secondary text-muted-foreground hover:bg-primary/20 hover:text-primary"
                                }`}
                                title={`Temporada ${sd.season}, Episodio ${ep}`}
                              >
                                {ep}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Prev / Next episode */}
              <div className="flex items-center gap-3 px-6 py-3 border-t border-border/50 bg-black/20">
                <button
                  onClick={goPrev}
                  disabled={isFirst}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary text-sm font-bold text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
                >
                  <SkipBack className="w-4 h-4" />
                  Anterior
                </button>
                <span className="flex-1 text-center text-xs text-muted-foreground font-mono">
                  T{String(season).padStart(2, "0")} — E{String(episode).padStart(2, "0")}
                </span>
                <button
                  onClick={goNext}
                  disabled={isLast}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary text-sm font-bold text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
                >
                  Siguiente
                  <SkipForward className="w-4 h-4" />
                </button>
              </div>

              {/* Player iframe */}
              <div className="relative aspect-video bg-black w-full group border-t border-border">
                {currentUrl ? (
                  <>
                    <iframe
                      key={currentUrl}
                      src={currentUrl}
                      className="w-full h-full"
                      frameBorder="0"
                      allowFullScreen
                      allow="autoplay; fullscreen; picture-in-picture; encrypted-media; gyroscope; accelerometer; clipboard-write"
                      referrerPolicy="no-referrer"
                      title={`${series.title} T${season} E${episode}`}
                    />
                    <div className="absolute top-2 right-2 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                      <button
                        onClick={() => setPlayerFullscreen(true)}
                        className="flex items-center gap-1.5 bg-black/80 hover:bg-primary/90 text-white px-3 py-1.5 rounded-lg text-xs font-bold backdrop-blur-sm transition-all border border-white/10"
                      >
                        <Maximize2 className="w-3.5 h-3.5" />
                        Pantalla completa
                      </button>
                      <a
                        href={currentUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 bg-black/80 hover:bg-white/20 text-white px-3 py-1.5 rounded-lg text-xs font-bold backdrop-blur-sm transition-all border border-white/10"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        Nueva pestaña
                      </a>
                    </div>
                  </>
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                    <p>No hay fuente de video configurada.</p>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between px-4 py-2 bg-black/40 border-t border-white/5">
                <p className="text-muted-foreground text-xs">Si el video no carga, cambia de servidor arriba o ábrelo en nueva pestaña.</p>
                <button
                  onClick={() => setPlayerFullscreen(true)}
                  className="flex items-center gap-1 text-primary hover:text-primary/80 text-xs font-bold transition-colors flex-shrink-0 ml-3"
                >
                  <Maximize2 className="w-3 h-3" />
                  Expandir
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* === Related Series === */}
        {related.length > 0 && (
          <div className="mt-16 border-t border-border pt-10">
            <MovieCarousel title="Series Similares" viewAllLink="/series">
              {related.map(s => (
                <div key={s.id} className="w-[160px] md:w-[200px] lg:w-[240px] flex-none">
                  <RelatedSeriesCard series={s} />
                </div>
              ))}
            </MovieCarousel>
          </div>
        )}
      </div>

      {/* === Trailer Modal === */}
      {showTrailer && series.yt_trailer_code && (
        <div className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4" onClick={() => setShowTrailer(false)}>
          <div className="relative w-full max-w-4xl aspect-video" onClick={e => e.stopPropagation()}>
            <button onClick={() => setShowTrailer(false)} className="absolute -top-10 right-0 text-white hover:text-primary transition-colors">
              <X className="w-8 h-8" />
            </button>
            <iframe
              src={`https://www.youtube.com/embed/${series.yt_trailer_code}?autoplay=1`}
              allow="autoplay; fullscreen"
              allowFullScreen
              className="w-full h-full rounded-xl border border-border"
              title="Tráiler"
            />
          </div>
        </div>
      )}

      {/* === Fullscreen Player === */}
      {playerFullscreen && currentUrl && (
        <div className="fixed inset-0 z-[200] bg-black flex flex-col" tabIndex={-1}>
          <div className="flex items-center justify-between px-4 py-2 bg-black/80 border-b border-white/10 flex-shrink-0">
            <div className="flex items-center gap-3">
              <Tv className="w-4 h-4 text-primary" />
              <span className="text-white font-bold text-sm truncate max-w-[200px] sm:max-w-none">{series.title}</span>
              <span className="text-muted-foreground text-xs font-mono hidden sm:inline">
                — T{String(season).padStart(2, "0")} E{String(episode).padStart(2, "0")}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {activeServers.length > 1 && activeServers.map((s, i) => (
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
              <button onClick={goPrev} disabled={isFirst} className="flex items-center gap-1 bg-white/10 hover:bg-white/20 text-white px-2.5 py-1.5 rounded-lg text-xs font-bold disabled:opacity-30 transition-all">
                <SkipBack className="w-3.5 h-3.5" />
              </button>
              <span className="text-white/60 text-xs font-mono">T{season} E{episode}</span>
              <button onClick={goNext} disabled={isLast} className="flex items-center gap-1 bg-white/10 hover:bg-white/20 text-white px-2.5 py-1.5 rounded-lg text-xs font-bold disabled:opacity-30 transition-all">
                <SkipForward className="w-3.5 h-3.5" />
              </button>
              <a href={currentUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-white/60 hover:text-white text-xs transition-colors px-2 py-1 rounded hover:bg-white/10">
                <ExternalLink className="w-4 h-4" />
              </a>
              <button onClick={() => setPlayerFullscreen(false)} className="flex items-center gap-1.5 bg-white/10 hover:bg-red-600/80 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-all">
                <X className="w-4 h-4" />
                <span className="hidden sm:inline">Cerrar</span>
              </button>
            </div>
          </div>
          <div className="flex-1 relative">
            <iframe
              key={`fs-${currentUrl}`}
              src={currentUrl}
              className="absolute inset-0 w-full h-full"
              frameBorder="0"
              allowFullScreen
              allow="autoplay; fullscreen; picture-in-picture; encrypted-media; gyroscope; accelerometer; clipboard-write"
              referrerPolicy="no-referrer"
              title={`${series.title} — Pantalla Completa`}
            />
          </div>
          <p className="text-center text-white/30 text-xs py-1.5 flex-shrink-0">
            Presiona <kbd className="font-mono bg-white/10 px-1.5 py-0.5 rounded text-[10px]">ESC</kbd> para salir
          </p>
        </div>
      )}
    </PageTransition>
  );
}
