import { useState, useEffect, useRef, useCallback } from "react";
import {
  Search, Tv, Play, Star, ChevronDown, ChevronLeft, ChevronRight,
  X, Maximize2, ExternalLink, Film, Calendar, Users,
  SkipForward, SkipBack, RefreshCw, Repeat, Info,
} from "lucide-react";
import { PageTransition } from "@/components/layout/PageTransition";
import { useTvSearch, useTvSeasons, TvShow } from "@/lib/tvmaze";
import { useDebounce } from "@/hooks/use-debounce";
import { apiGetSeries, apiIncrementSeriesView, type LocalSeries, type SeasonInfo } from "@/lib/api-client";

type PlayerMode = "catalog" | "search";

const SERVERS_TV = ["VidSrc", "MultiEmbed", "2Embed", "EmbedSu"];
const AUTOPLAY_COUNTDOWN = 10; // seconds

function getEmbedUrl(server: number, imdb: string, s: number, e: number): string {
  const ss = String(s).padStart(2, "0");
  const ee = String(e).padStart(2, "0");
  if (server === 0) return `https://vidsrc.net/embed/tv/${imdb}/${ss}/${ee}`;
  if (server === 1) return `https://multiembed.mov/embed/imdb/${imdb}&s=${ss}&e=${ee}`;
  if (server === 2) return `https://www.2embed.cc/embedtv/${imdb}&s=${ss}&e=${ee}`;
  return `https://embed.su/embed/tv/${imdb}/${ss}/${ee}`;
}

function getDbSeriesUrl(series: LocalSeries, serverIdx: number, s: number, e: number): string {
  const src = series.video_sources?.[serverIdx];
  if (!src) return getEmbedUrl(serverIdx, series.imdb_id, s, e);
  const ss = String(s).padStart(2, "0");
  const ee = String(e).padStart(2, "0");
  return src.url.replace("{SEASON}", ss).replace("{EPISODE}", ee);
}

function statusLabel(s: string) {
  if (s === "Returning Series") return { text: "En emisión", cls: "bg-green-500/15 text-green-400 border-green-500/30" };
  if (s === "Ended") return { text: "Finalizada", cls: "bg-gray-500/15 text-gray-400 border-gray-500/30" };
  if (s === "Canceled") return { text: "Cancelada", cls: "bg-red-500/15 text-red-400 border-red-500/30" };
  return { text: s, cls: "bg-white/5 text-muted-foreground border-border" };
}

// ─── Countdown overlay (next episode) ───────────────────────────────────────
function NextEpisodeOverlay({
  secondsLeft,
  onCancel,
  onNow,
  nextLabel,
}: {
  secondsLeft: number;
  onCancel: () => void;
  onNow: () => void;
  nextLabel: string;
}) {
  const pct = ((AUTOPLAY_COUNTDOWN - secondsLeft) / AUTOPLAY_COUNTDOWN) * 100;
  return (
    <div className="absolute bottom-4 right-4 z-20 w-72 bg-black/90 border border-white/20 rounded-2xl p-4 backdrop-blur-md shadow-2xl">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <p className="text-white font-bold text-sm">Siguiente episodio en {secondsLeft}s</p>
          <p className="text-white/60 text-xs mt-0.5 line-clamp-1">{nextLabel}</p>
        </div>
        <button onClick={onCancel} className="text-white/50 hover:text-white transition-colors flex-shrink-0 mt-0.5">
          <X className="w-4 h-4" />
        </button>
      </div>
      {/* Progress bar */}
      <div className="h-1 bg-white/20 rounded-full mb-3 overflow-hidden">
        <div
          className="h-full bg-primary rounded-full transition-all duration-1000 ease-linear"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex gap-2">
        <button
          onClick={onNow}
          className="flex-1 flex items-center justify-center gap-1.5 bg-primary hover:bg-primary/90 text-black font-bold py-2 rounded-lg text-xs transition-colors"
        >
          <SkipForward className="w-3.5 h-3.5" /> Ver ahora
        </button>
        <button
          onClick={onCancel}
          className="px-3 py-2 rounded-lg border border-white/20 text-white/70 hover:text-white text-xs transition-colors"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function Series() {
  const [dbSeries, setDbSeries] = useState<LocalSeries[]>([]);
  const [loadingDb, setLoadingDb] = useState(true);

  // Player state
  const [mode, setMode] = useState<PlayerMode | null>(null);
  const [currentSeries, setCurrentSeries] = useState<LocalSeries | null>(null);
  const [searchImdb, setSearchImdb] = useState<string | null>(null);
  const [searchShow, setSearchShow] = useState<TvShow | null>(null);
  const [season, setSeason] = useState(1);
  const [episode, setEpisode] = useState(1);
  const [activeServer, setActiveServer] = useState(0);
  const [playerFullscreen, setPlayerFullscreen] = useState(false);
  const [showTrailer, setShowTrailer] = useState(false);
  const [activeTab, setActiveTab] = useState<"synopsis" | "cast">("synopsis");

  // Auto-play
  const [autoPlay, setAutoPlay] = useState(() => {
    try { return localStorage.getItem("cv_autoplay") !== "false"; } catch { return true; }
  });
  const [countdown, setCountdown] = useState<number | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // TVMaze search
  const [searchInput, setSearchInput] = useState("");
  const debouncedQuery = useDebounce(searchInput, 400);
  const { results, loading: searchLoading } = useTvSearch(debouncedQuery);
  const { seasons: tvMazeSeasons } = useTvSeasons(searchShow?.id ?? null);

  // Season info
  const seasonOptions: SeasonInfo[] = (() => {
    if (currentSeries?.seasons_data?.length) return currentSeries.seasons_data;
    if (mode === "search" && tvMazeSeasons.length > 0) {
      return tvMazeSeasons.map(s => ({ season: s.number, episodes: s.episodeOrder ?? 20 }));
    }
    return Array.from({ length: 5 }, (_, i) => ({ season: i + 1, episodes: 20 }));
  })();

  const episodeCount = seasonOptions.find(s => s.season === season)?.episodes ?? 20;
  const totalSeasons = seasonOptions.length || currentSeries?.total_seasons || 5;

  const isLastEpisode = episode === episodeCount && season === totalSeasons;
  const isFirstEpisode = episode === 1 && season === 1;

  // Current URL
  const currentUrl = (() => {
    if (mode === "catalog" && currentSeries) {
      return getDbSeriesUrl(currentSeries, activeServer, season, episode);
    }
    if (mode === "search" && searchImdb) {
      return getEmbedUrl(activeServer, searchImdb, season, episode);
    }
    return "";
  })();

  const nextEpisodeLabel = (() => {
    if (episode < episodeCount) return `T${String(season).padStart(2,"0")} E${String(episode + 1).padStart(2,"0")}`;
    const nextSeason = seasonOptions.find(s => s.season === season + 1);
    if (nextSeason) return `Temporada ${season + 1} — Ep. 1`;
    return "";
  })();

  const videoServers = currentSeries?.video_sources?.filter(s => s.active) ?? null;
  const serverList = videoServers ?? SERVERS_TV.map((n, i) => ({ id: String(i), name: n, url: "", active: true }));

  // ─── Go to next / previous episode ────────────────────────────────────────
  const goToNext = useCallback(() => {
    setCountdown(null);
    if (countdownRef.current) clearInterval(countdownRef.current);
    if (episode < episodeCount) {
      setEpisode(e => e + 1);
    } else {
      const nextSeason = seasonOptions.find(s => s.season === season + 1);
      if (nextSeason) { setSeason(s => s + 1); setEpisode(1); }
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [episode, episodeCount, season, seasonOptions]);

  const goToPrev = useCallback(() => {
    setCountdown(null);
    if (countdownRef.current) clearInterval(countdownRef.current);
    if (episode > 1) {
      setEpisode(e => e - 1);
    } else if (season > 1) {
      const prevSeason = seasonOptions.find(s => s.season === season - 1);
      setSeason(s => s - 1);
      setEpisode(prevSeason?.episodes ?? 1);
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [episode, season, seasonOptions]);

  const startCountdown = useCallback(() => {
    if (isLastEpisode) return;
    setCountdown(AUTOPLAY_COUNTDOWN);
  }, [isLastEpisode]);

  const cancelCountdown = () => {
    setCountdown(null);
    if (countdownRef.current) clearInterval(countdownRef.current);
  };

  // ─── Countdown timer ───────────────────────────────────────────────────────
  useEffect(() => {
    if (countdown === null) return;
    if (countdown === 0) { goToNext(); return; }
    countdownRef.current = setInterval(() => {
      setCountdown(c => (c !== null && c > 0 ? c - 1 : null));
    }, 1000);
    return () => { if (countdownRef.current) clearInterval(countdownRef.current); };
  }, [countdown, goToNext]);

  // ─── postMessage listener (detect video end from embed players) ───────────
  useEffect(() => {
    if (!mode) return;
    const handler = (e: MessageEvent) => {
      try {
        const data = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
        // VidSrc / common embed patterns
        const isEnd =
          data?.event === "ended" ||
          data?.type === "ended" ||
          data?.status === "ended" ||
          data?.state === "ended" ||
          data?.event === "video:ended" ||
          data?.playerState === 0 || // YouTube API: 0 = ended
          String(data).toLowerCase().includes("ended");
        if (isEnd && autoPlay && !isLastEpisode) {
          startCountdown();
        }
      } catch { /* ignore parse errors */ }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [mode, autoPlay, isLastEpisode, startCountdown]);

  // ─── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    if (!mode) return;
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "ArrowRight" || e.key === "n" || e.key === "N") {
        if (!isLastEpisode) goToNext();
      }
      if (e.key === "ArrowLeft" || e.key === "p" || e.key === "P") {
        if (!isFirstEpisode) goToPrev();
      }
      if (e.key === "Escape") {
        if (playerFullscreen) setPlayerFullscreen(false);
        else cancelCountdown();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [mode, isLastEpisode, isFirstEpisode, goToNext, goToPrev, playerFullscreen]);

  // ─── Fullscreen body lock ──────────────────────────────────────────────────
  useEffect(() => {
    document.body.style.overflow = playerFullscreen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [playerFullscreen]);

  // ─── Persist autoplay preference ─────────────────────────────────────────
  useEffect(() => {
    try { localStorage.setItem("cv_autoplay", String(autoPlay)); } catch {}
  }, [autoPlay]);

  // Reset countdown when episode changes
  useEffect(() => {
    cancelCountdown();
  }, [episode, season]);

  // ─── Open series ──────────────────────────────────────────────────────────
  const openCatalogSeries = (s: LocalSeries) => {
    setCurrentSeries(s);
    setSeason(1); setEpisode(1); setActiveServer(0);
    setMode("catalog");
    apiIncrementSeriesView(s.id).catch(() => {});
    setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 50);
  };

  const handleSelectSearchShow = (show: TvShow) => {
    setSearchShow(show);
    setSearchImdb(show.externals.imdb);
    setCurrentSeries(null);
    setSeason(1); setEpisode(1); setActiveServer(0);
    setMode("search");
    setSearchInput("");
    setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 50);
  };

  const closePlayer = () => {
    setMode(null);
    setCurrentSeries(null);
    setSearchImdb(null);
    setSearchShow(null);
    setPlayerFullscreen(false);
    cancelCountdown();
  };

  const featuredSeries = dbSeries.filter(s => s.featured);

  useEffect(() => {
    apiGetSeries()
      .then(data => { setDbSeries(data); setLoadingDb(false); })
      .catch(() => setLoadingDb(false));
  }, []);

  return (
    <PageTransition>
      <div className="min-h-screen pt-24 pb-20">
        <div className="max-w-7xl mx-auto px-4 md:px-8">

          {/* Header */}
          <div className="mb-8">
            <h1 className="text-5xl font-heading tracking-wide flex items-center gap-3 mb-2">
              <span className="w-1.5 h-10 bg-primary block rounded-full" />
              <Tv className="w-9 h-9 text-primary" />
              Series de TV
            </h1>
            <p className="text-muted-foreground ml-[52px] text-sm">
              {dbSeries.length > 0
                ? `${dbSeries.length} serie${dbSeries.length !== 1 ? "s" : ""} en el catálogo`
                : "Busca y transmite cualquier serie de televisión"}
            </p>
          </div>

          {/* ═══ ACTIVE PLAYER ═══ */}
          {mode && currentUrl && (
            <div className="mb-10 space-y-3">

              {/* Series info header */}
              <div className="flex items-start gap-4 bg-card border border-border rounded-2xl p-5">
                {currentSeries?.poster_url && (
                  <img src={currentSeries.poster_url} alt={currentSeries.title} className="w-16 h-24 object-cover rounded-xl flex-shrink-0 hidden sm:block" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-2xl font-heading tracking-wide line-clamp-1">
                        {currentSeries?.title || searchShow?.name || searchImdb}
                      </h2>
                      <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground mt-1">
                        {currentSeries && (
                          <>
                            <span className="font-mono">{currentSeries.year}{currentSeries.end_year ? `–${currentSeries.end_year}` : ""}</span>
                            {currentSeries.rating > 0 && (
                              <span className="flex items-center gap-1 text-yellow-400 font-bold">
                                <Star className="w-3.5 h-3.5 fill-current" />{currentSeries.rating}
                              </span>
                            )}
                            {currentSeries.status && (() => {
                              const { text, cls } = statusLabel(currentSeries.status);
                              return <span className={`text-[10px] px-2 py-0.5 rounded border font-bold uppercase tracking-wide ${cls}`}>{text}</span>;
                            })()}
                            <span className="font-mono text-xs">{currentSeries.total_seasons} temp.</span>
                          </>
                        )}
                        {searchShow && (
                          <>
                            {searchShow.premiered && <span>{searchShow.premiered.slice(0, 4)}</span>}
                            {searchShow.rating.average && <span className="flex items-center gap-1 text-yellow-400"><Star className="w-3.5 h-3.5 fill-current" />{searchShow.rating.average}</span>}
                          </>
                        )}
                      </div>
                      {currentSeries?.genres.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {currentSeries.genres.slice(0, 4).map(g => (
                            <span key={g} className="text-[10px] bg-primary/15 border border-primary/30 text-primary px-2 py-0.5 rounded-full font-bold uppercase tracking-wide">{g}</span>
                          ))}
                        </div>
                      )}
                    </div>
                    <button onClick={closePlayer} className="flex items-center gap-1.5 bg-card border border-border text-muted-foreground hover:text-foreground px-3 py-2 rounded-lg text-xs transition-colors flex-shrink-0">
                      <X className="w-3.5 h-3.5" /> Cambiar
                    </button>
                  </div>

                  {currentSeries && (
                    <div className="mt-3 border-t border-border pt-3">
                      <div className="flex gap-3 mb-2 flex-wrap">
                        {["synopsis", "cast"].map(t => (
                          <button key={t} onClick={() => setActiveTab(t as "synopsis" | "cast")} className={`text-xs font-bold uppercase tracking-wider transition-colors ${activeTab === t ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}>
                            {t === "synopsis" ? "Sinopsis" : "Reparto"}
                          </button>
                        ))}
                        {currentSeries.yt_trailer_code && (
                          <button onClick={() => setShowTrailer(true)} className="text-xs font-bold uppercase tracking-wider text-muted-foreground hover:text-primary transition-colors flex items-center gap-1 ml-auto">
                            <Play className="w-3 h-3" /> Tráiler
                          </button>
                        )}
                      </div>
                      {activeTab === "synopsis" && currentSeries.synopsis && (
                        <p className="text-muted-foreground text-sm line-clamp-3 leading-relaxed">{currentSeries.synopsis}</p>
                      )}
                      {activeTab === "cast" && currentSeries.cast_list.length > 0 && (
                        <p className="text-muted-foreground text-sm">{currentSeries.cast_list.slice(0, 8).join(", ")}</p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Episode & season selector */}
              <div className="bg-card border border-border rounded-2xl p-4">
                <div className="flex flex-wrap gap-3 items-center">
                  {/* Season select */}
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap">Temporada</label>
                    <div className="relative">
                      <select value={season} onChange={e => { setSeason(Number(e.target.value)); setEpisode(1); }} className="bg-background border border-border text-foreground rounded-lg pl-3 pr-8 py-2 text-sm focus:border-primary outline-none appearance-none cursor-pointer">
                        {seasonOptions.map(s => (
                          <option key={s.season} value={s.season}>T{String(s.season).padStart(2,"0")} {s.episodes ? `(${s.episodes} ep.)` : ""}</option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                    </div>
                  </div>
                  {/* Episode select */}
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap">Episodio</label>
                    <div className="relative">
                      <select value={episode} onChange={e => setEpisode(Number(e.target.value))} className="bg-background border border-border text-foreground rounded-lg pl-3 pr-8 py-2 text-sm focus:border-primary outline-none appearance-none cursor-pointer">
                        {Array.from({ length: Math.max(episodeCount, 1) }, (_, i) => (
                          <option key={i + 1} value={i + 1}>Ep. {String(i + 1).padStart(2,"0")}</option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                    </div>
                  </div>

                  {/* Prev / Next buttons */}
                  <div className="flex items-center gap-1.5 ml-auto">
                    <button
                      onClick={goToPrev}
                      disabled={isFirstEpisode}
                      title="Episodio anterior (P)"
                      className="flex items-center gap-1.5 bg-card border border-border text-muted-foreground hover:text-foreground hover:border-primary/40 disabled:opacity-30 px-3 py-2 rounded-lg text-xs font-bold transition-all"
                    >
                      <SkipBack className="w-4 h-4" />
                      <span className="hidden sm:inline">Anterior</span>
                    </button>
                    <span className="text-xs text-muted-foreground font-mono px-1 hidden sm:inline">
                      S{String(season).padStart(2,"0")}E{String(episode).padStart(2,"0")}
                    </span>
                    <button
                      onClick={goToNext}
                      disabled={isLastEpisode}
                      title="Siguiente episodio (N)"
                      className="flex items-center gap-1.5 bg-primary/15 border border-primary/30 text-primary hover:bg-primary/25 disabled:opacity-30 px-3 py-2 rounded-lg text-xs font-bold transition-all"
                    >
                      <span className="hidden sm:inline">Siguiente</span>
                      <SkipForward className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Server switcher + auto-play toggle */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Servidor:</span>
                {serverList.map((srv, i) => (
                  <button key={i} onClick={() => setActiveServer(i)} className={`px-3.5 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${activeServer === i ? "bg-primary text-primary-foreground shadow-[0_0_12px_rgba(0,212,255,0.3)]" : "bg-card border border-border text-muted-foreground hover:border-primary hover:text-primary"}`}>
                    {srv.name}
                  </button>
                ))}

                {/* Auto-play toggle */}
                <div className="ml-auto flex items-center gap-2">
                  <button
                    onClick={() => setAutoPlay(a => !a)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-all border ${autoPlay ? "bg-primary/15 border-primary/40 text-primary" : "bg-card border-border text-muted-foreground"}`}
                    title="Auto-reproducción: pasa al siguiente episodio automáticamente"
                  >
                    <Repeat className={`w-3.5 h-3.5 ${autoPlay ? "text-primary" : ""}`} />
                    <span className="hidden sm:inline">Auto-rep.</span>
                    <span className={`w-2 h-2 rounded-full ${autoPlay ? "bg-primary" : "bg-muted-foreground/40"}`} />
                  </button>
                </div>
              </div>

              {/* ─── Video player ──────────────────────────────── */}
              <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-2xl">
                <div className="relative w-full aspect-video bg-black group">
                  <iframe
                    key={`${currentUrl}-s${season}e${episode}-srv${activeServer}`}
                    src={currentUrl}
                    className="absolute inset-0 w-full h-full"
                    frameBorder="0"
                    allowFullScreen
                    allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
                    referrerPolicy="no-referrer"
                    title={`S${String(season).padStart(2,"0")}E${String(episode).padStart(2,"0")}`}
                  />

                  {/* Hover overlay buttons */}
                  <div className="absolute top-2 right-2 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                    <button onClick={() => setPlayerFullscreen(true)} className="flex items-center gap-1.5 bg-black/80 hover:bg-primary/90 text-white px-3 py-1.5 rounded-lg text-xs font-bold backdrop-blur-sm border border-white/10 hover:border-primary/50 transition-all">
                      <Maximize2 className="w-3.5 h-3.5" /> Pantalla completa
                    </button>
                    <a href={currentUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 bg-black/80 hover:bg-white/20 text-white px-3 py-1.5 rounded-lg text-xs font-bold backdrop-blur-sm border border-white/10 transition-all">
                      <ExternalLink className="w-3.5 h-3.5" /> Nueva pestaña
                    </a>
                  </div>

                  {/* Next episode countdown overlay */}
                  {countdown !== null && (
                    <NextEpisodeOverlay
                      secondsLeft={countdown}
                      onCancel={cancelCountdown}
                      onNow={goToNext}
                      nextLabel={nextEpisodeLabel}
                    />
                  )}
                </div>

                {/* Player footer bar */}
                <div className="flex items-center justify-between px-4 py-2.5 bg-black/30 border-t border-white/5 gap-3">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={goToPrev}
                      disabled={isFirstEpisode}
                      className="flex items-center gap-1 text-white/50 hover:text-white disabled:opacity-20 text-xs transition-colors"
                    >
                      <SkipBack className="w-3.5 h-3.5" /> Anterior
                    </button>
                    <span className="text-white/30 text-xs font-mono">
                      S{String(season).padStart(2,"0")}E{String(episode).padStart(2,"0")}
                    </span>
                    {!isLastEpisode && (
                      <button
                        onClick={goToNext}
                        className="flex items-center gap-1 text-primary hover:text-primary/80 text-xs font-bold transition-colors"
                      >
                        Siguiente <SkipForward className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    {/* "Terminó el episodio?" trigger */}
                    {autoPlay && !isLastEpisode && countdown === null && (
                      <button
                        onClick={startCountdown}
                        className="text-white/40 hover:text-white/70 text-[11px] transition-colors flex items-center gap-1"
                        title="Marcar episodio como terminado para auto-pasar al siguiente"
                      >
                        <RefreshCw className="w-3 h-3" /> ¿Terminó?
                      </button>
                    )}
                    <button onClick={() => setPlayerFullscreen(true)} className="text-primary text-xs font-bold flex items-center gap-1 hover:text-primary/80 transition-colors">
                      <Maximize2 className="w-3 h-3" /> Expandir
                    </button>
                  </div>
                </div>
              </div>

              {/* Keyboard hint + subtitles note */}
              <div className="flex flex-wrap items-center gap-4 text-[11px] text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <Info className="w-3 h-3" />
                  <span>Atajos: <kbd className="bg-card border border-border px-1.5 py-0.5 rounded font-mono text-[10px]">N</kbd> siguiente · <kbd className="bg-card border border-border px-1.5 py-0.5 rounded font-mono text-[10px]">P</kbd> anterior</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span>🌐 Subtítulos: actívalos dentro del reproductor pulsando el ícono CC</span>
                </div>
              </div>
            </div>
          )}

          {/* ═══ SEARCH BAR ═══ */}
          <div className="relative mb-8">
            <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
              <Search className="w-5 h-5 text-muted-foreground" />
            </div>
            <input
              type="text"
              placeholder="Buscar series de TV (vía TVMaze)..."
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              className="w-full bg-card border border-border focus:border-primary focus:ring-1 focus:ring-primary text-foreground rounded-xl pl-12 pr-4 py-4 text-base outline-none placeholder:text-muted-foreground"
            />
            {searchLoading && (
              <div className="absolute inset-y-0 right-4 flex items-center">
                <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            )}
            {debouncedQuery && results.length > 0 && (
              <div className="absolute top-full left-0 right-0 z-50 mt-2 bg-card border border-border rounded-xl shadow-2xl overflow-hidden max-h-96 overflow-y-auto">
                {results.map(({ show }) => (
                  <button key={show.id} onClick={() => handleSelectSearchShow(show)} className="w-full flex items-center gap-4 p-4 hover:bg-secondary transition-colors text-left border-b border-border last:border-0">
                    <div className="w-12 h-16 rounded overflow-hidden bg-muted flex-shrink-0">
                      {show.image?.medium ? <img src={show.image.medium} alt={show.name} className="w-full h-full object-cover" /> : <Tv className="w-6 h-6 text-muted-foreground m-auto" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-foreground truncate">{show.name}</h3>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                        {show.rating.average && <span className="flex items-center gap-1"><Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />{show.rating.average}</span>}
                        {show.premiered && <span>{show.premiered.slice(0, 4)}</span>}
                        {show.status && <span className="capitalize">{show.status}</span>}
                      </div>
                    </div>
                    {show.externals.imdb ? <Play className="w-5 h-5 text-primary flex-shrink-0" /> : <span className="text-xs text-muted-foreground">Sin IMDb</span>}
                  </button>
                ))}
              </div>
            )}
            {debouncedQuery && !searchLoading && results.length === 0 && (
              <div className="absolute top-full left-0 right-0 z-50 mt-2 bg-card border border-border rounded-xl shadow-2xl p-8 text-center">
                <p className="text-muted-foreground">No se encontraron series para "{debouncedQuery}"</p>
              </div>
            )}
          </div>

          {/* ═══ CATALOG ═══ */}
          {!loadingDb && dbSeries.length > 0 && (
            <div className="mb-10">
              {featuredSeries.length > 0 && (
                <div className="mb-8">
                  <h2 className="text-2xl font-heading tracking-wide mb-4 flex items-center gap-2">
                    <Star className="w-5 h-5 text-yellow-400 fill-current" /> Series Destacadas
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {featuredSeries.map(s => <SeriesCard key={s.id} series={s} onPlay={openCatalogSeries} featured />)}
                  </div>
                </div>
              )}
              <h2 className="text-2xl font-heading tracking-wide mb-4 flex items-center gap-2">
                <Tv className="w-5 h-5 text-primary" /> Catálogo de Series
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                {dbSeries.map(s => <SeriesCard key={s.id} series={s} onPlay={openCatalogSeries} />)}
              </div>
            </div>
          )}

          {loadingDb && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 mb-10">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="aspect-[2/3] bg-card border border-border rounded-xl animate-pulse" />
              ))}
            </div>
          )}

          {!loadingDb && dbSeries.length === 0 && !mode && (
            <div className="bg-card border border-border rounded-2xl py-16 text-center mb-10">
              <Film className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
              <h3 className="text-xl font-heading text-muted-foreground mb-2">Sin series en el catálogo</h3>
              <p className="text-muted-foreground text-sm max-w-sm mx-auto">
                Agrega series desde el panel de administración, o usa el buscador para transmitir cualquier serie directamente.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ═══ FULLSCREEN PLAYER ═══ */}
      {playerFullscreen && currentUrl && (
        <div className="fixed inset-0 z-[200] bg-black flex flex-col">
          <div className="flex items-center justify-between px-4 py-2 bg-black/80 border-b border-white/10 flex-shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <Tv className="w-4 h-4 text-primary flex-shrink-0" />
              <span className="text-white font-bold text-sm truncate">
                {currentSeries?.title || searchShow?.name} — S{String(season).padStart(2,"0")}E{String(episode).padStart(2,"0")}
              </span>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button onClick={goToPrev} disabled={isFirstEpisode} className="flex items-center gap-1 bg-white/10 hover:bg-white/20 disabled:opacity-30 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-all">
                <SkipBack className="w-3.5 h-3.5" />
              </button>
              <button onClick={goToNext} disabled={isLastEpisode} className="flex items-center gap-1.5 bg-primary/80 hover:bg-primary disabled:opacity-30 text-black px-3 py-1.5 rounded-lg text-xs font-bold transition-all">
                <SkipForward className="w-3.5 h-3.5" /> Siguiente
              </button>
              <button onClick={() => setPlayerFullscreen(false)} className="flex items-center gap-1.5 bg-white/10 hover:bg-red-600/80 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-all">
                <X className="w-4 h-4" /> Cerrar
              </button>
            </div>
          </div>
          <div className="flex-1 relative">
            <iframe
              key={`fs-s${season}e${episode}-srv${activeServer}`}
              src={currentUrl}
              className="absolute inset-0 w-full h-full"
              frameBorder="0"
              allowFullScreen
              allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
              referrerPolicy="no-referrer"
              title="Fullscreen Player"
            />
            {countdown !== null && (
              <NextEpisodeOverlay
                secondsLeft={countdown}
                onCancel={cancelCountdown}
                onNow={goToNext}
                nextLabel={nextEpisodeLabel}
              />
            )}
          </div>
          <p className="text-center text-white/30 text-xs py-1.5 flex-shrink-0">
            <kbd className="font-mono bg-white/10 px-1.5 py-0.5 rounded text-[10px]">ESC</kbd> cerrar ·
            <kbd className="font-mono bg-white/10 px-1.5 py-0.5 rounded text-[10px] mx-1">N</kbd> siguiente ·
            <kbd className="font-mono bg-white/10 px-1.5 py-0.5 rounded text-[10px]">P</kbd> anterior
          </p>
        </div>
      )}

      {/* Trailer modal */}
      {showTrailer && currentSeries?.yt_trailer_code && (
        <div className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4" onClick={() => setShowTrailer(false)}>
          <div className="relative w-full max-w-4xl aspect-video" onClick={e => e.stopPropagation()}>
            <button onClick={() => setShowTrailer(false)} className="absolute -top-10 right-0 text-white hover:text-primary"><X className="w-8 h-8" /></button>
            <iframe src={`https://www.youtube.com/embed/${currentSeries.yt_trailer_code}?autoplay=1`} allow="autoplay; fullscreen" allowFullScreen className="w-full h-full rounded-xl border border-border" title="Tráiler" />
          </div>
        </div>
      )}
    </PageTransition>
  );
}

// ─── Series Card Component ────────────────────────────────────────────────────
function SeriesCard({ series, onPlay, featured }: { series: LocalSeries; onPlay: (s: LocalSeries) => void; featured?: boolean }) {
  const { text: statusText, cls: statusCls } = statusLabel(series.status);
  if (featured) {
    return (
      <div className="relative bg-card border border-border rounded-2xl overflow-hidden hover:border-primary/40 transition-all group cursor-pointer" onClick={() => onPlay(series)}>
        {series.background_url && (
          <div className="relative h-40 overflow-hidden">
            <img src={series.background_url} alt={series.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
            <div className="absolute inset-0 bg-gradient-to-t from-card via-card/50 to-transparent" />
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="w-14 h-14 bg-primary/90 rounded-full flex items-center justify-center shadow-[0_0_20px_rgba(0,212,255,0.5)]">
                <Play className="w-6 h-6 text-black fill-black ml-0.5" />
              </div>
            </div>
          </div>
        )}
        <div className="p-4 flex gap-3">
          {series.poster_url && (
            <img src={series.poster_url} alt={series.title} className="w-12 object-cover rounded-lg flex-shrink-0 -mt-8 relative z-10 border-2 border-card" style={{ height: "72px" }} />
          )}
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-foreground line-clamp-1">{series.title}</h3>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground mt-1">
              <span className="font-mono">{series.year}{series.end_year ? `–${series.end_year}` : ""}</span>
              {series.rating > 0 && <span className="flex items-center gap-0.5 text-yellow-400"><Star className="w-3 h-3 fill-current" />{series.rating}</span>}
              {series.status && <span className={`px-1.5 py-0.5 rounded border text-[9px] font-bold uppercase ${statusCls}`}>{statusText}</span>}
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
              <Calendar className="w-3 h-3" /><span>{series.total_seasons} temp.</span>
              {series.creators.length > 0 && <><Users className="w-3 h-3" /><span className="truncate">{series.creators[0]}</span></>}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="group cursor-pointer" onClick={() => onPlay(series)}>
      <div className="relative aspect-[2/3] rounded-xl overflow-hidden bg-card border border-border group-hover:border-primary/50 transition-all mb-2">
        {series.poster_url ? (
          <img src={series.poster_url} alt={series.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-card">
            <Tv className="w-8 h-8 text-muted-foreground/40" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
        <div className="absolute bottom-0 left-0 right-0 p-2.5 translate-y-full group-hover:translate-y-0 transition-transform">
          <button className="w-full bg-primary/90 hover:bg-primary text-black font-bold py-2 rounded-lg text-xs flex items-center justify-center gap-1.5">
            <Play className="w-3.5 h-3.5 fill-black" /> Ver Serie
          </button>
        </div>
        {series.rating > 0 && (
          <div className="absolute top-2 right-2 flex items-center gap-0.5 bg-black/70 text-yellow-400 text-xs font-bold px-1.5 py-0.5 rounded backdrop-blur-sm">
            <Star className="w-3 h-3 fill-current" />{series.rating}
          </div>
        )}
        {series.featured && (
          <div className="absolute top-2 left-2 bg-yellow-500/20 border border-yellow-500/40 text-yellow-400 text-[9px] font-bold px-1.5 py-0.5 rounded">★</div>
        )}
      </div>
      <h3 className="font-bold text-foreground text-sm line-clamp-1 group-hover:text-primary transition-colors">{series.title}</h3>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
        <span className="font-mono">{series.year}</span>
        <span className="text-border">·</span>
        <span>{series.total_seasons} temp.</span>
        {series.status && <span className={`ml-auto text-[9px] px-1 py-0.5 rounded border font-bold ${statusCls}`}>{statusText}</span>}
      </div>
    </div>
  );
}
