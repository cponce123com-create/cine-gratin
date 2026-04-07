import { useState, useEffect, useRef } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, Maximize2, ExternalLink } from "lucide-react";

const TIMEOUT_MS = 12000;

const SERVERS = [
  { label: "Servidor 1", buildUrl: (type: string, id: string, s?: number, e?: number) =>
    type === "movie"
      ? `https://vidsrc.net/embed/movie/${id}/`
      : `https://vidsrc.net/embed/tv/${id}/${s}/${e}/` },
  { label: "Servidor 2", buildUrl: (type: string, id: string, s?: number, e?: number) =>
    type === "movie"
      ? `https://vidsrc.pro/embed/movie/${id}`
      : `https://vidsrc.pro/embed/tv/${id}/${s}/${e}` },
  { label: "Servidor 3", buildUrl: (type: string, id: string, s?: number, e?: number) =>
    type === "movie"
      ? `https://vidsrc.xyz/embed/movie?imdb=${id}`
      : `https://vidsrc.xyz/embed/tv?imdb=${id}&season=${s}&episode=${e}` },
  { label: "Servidor 4", buildUrl: (type: string, id: string, s?: number, e?: number) =>
    type === "movie"
      ? `https://www.2embed.cc/embed/${id}`
      : `https://www.2embed.cc/embedtv/${id}&s=${s}&e=${e}` },
];

export default function Player() {
  const searchParams = new URLSearchParams(window.location.search);

  const url = searchParams.get("url") || "";
  const title = searchParams.get("title") || "Reproduciendo";
  const imdbId = searchParams.get("imdb") || "";
  const mediaType = searchParams.get("type") || "movie";
  const initSeason = parseInt(searchParams.get("season") || "1", 10);
  const initEpisode = parseInt(searchParams.get("episode") || "1", 10);
  const totalEpisodes = parseInt(searchParams.get("total_eps") || "1", 10);

  const [activeServer, setActiveServer] = useState(0);
  const [season, setSeason] = useState(initSeason);
  const [episode, setEpisode] = useState(initEpisode);
  const [timedOut, setTimedOut] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setTimedOut(false);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setTimedOut(true), TIMEOUT_MS);
    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
  }, [activeServer, season, episode]);

  const isYouTube = url.includes("youtube.com") || url.includes("youtu.be");

  const iframeSrc = isYouTube
    ? url.replace("watch?v=", "embed/") + "?autoplay=1&rel=0"
    : imdbId
    ? SERVERS[activeServer].buildUrl(mediaType, imdbId, season, episode)
    : url;

  const handleBack = () => {
    window.history.back();
  };

  const handlePrev = () => {
    if (episode > 1) setEpisode((e) => e - 1);
  };

  const handleNext = () => {
    if (episode < totalEpisodes) setEpisode((e) => e + 1);
  };

  return (
    <div className="fixed inset-0 bg-black flex flex-col z-50">
      {/* Controls bar — always visible, sits above iframe */}
      <div className="flex-shrink-0 bg-gradient-to-b from-black/95 to-black/60 px-3 pt-3 pb-2 space-y-2">
        {/* Row 1: back + title */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleBack}
            className="flex items-center gap-1.5 text-white/80 hover:text-white transition-colors text-sm font-medium flex-shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
            Volver
          </button>
          <h2 className="text-white/90 font-semibold text-sm truncate flex-1 min-w-0">
            {title}
            {mediaType === "series" && imdbId && (
              <span className="text-white/50 font-normal ml-2 text-xs">
                T{season} · E{episode}
              </span>
            )}
          </h2>
          <button
            onClick={() => window.open(iframeSrc, "_blank")}
            title="Abrir en nueva pestaña"
            className="flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded border bg-white/5 border-white/10 text-white/60 hover:bg-white/15 hover:text-white transition-all flex-shrink-0"
          >
            <ExternalLink className="w-3 h-3" />
            <span className="hidden sm:inline">Abrir</span>
          </button>
          <button
            onClick={() => document.documentElement.requestFullscreen?.()}
            title="Pantalla completa"
            className="flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded border bg-white/5 border-white/10 text-white/60 hover:bg-white/15 hover:text-white transition-all flex-shrink-0"
          >
            <Maximize2 className="w-3 h-3" />
            <span className="hidden sm:inline">Pantalla completa</span>
          </button>
        </div>

        {/* Row 2: servers + episode nav */}
        {!isYouTube && imdbId && (
          <div className="flex items-center gap-1.5 flex-wrap">
            {SERVERS.map((srv, idx) => (
              <button
                key={idx}
                onClick={() => setActiveServer(idx)}
                className={`text-[11px] font-semibold px-2.5 py-1 rounded border transition-all ${
                  activeServer === idx
                    ? "bg-primary border-primary/80 text-white shadow-sm"
                    : "bg-white/5 border-white/10 text-white/50 hover:bg-white/10 hover:text-white/80"
                }`}
              >
                {srv.label}
              </button>
            ))}

            {mediaType === "series" && totalEpisodes > 1 && (
              <div className="ml-auto flex items-center gap-1.5">
                <button
                  onClick={handlePrev}
                  disabled={episode <= 1}
                  className="flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded border bg-white/5 border-white/10 text-white/60 hover:bg-white/15 hover:text-white disabled:opacity-30 transition-all"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  Anterior
                </button>
                <span className="text-white/40 text-xs">E{episode}/{totalEpisodes}</span>
                <button
                  onClick={handleNext}
                  disabled={episode >= totalEpisodes}
                  className="flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded border bg-white/5 border-white/10 text-white/60 hover:bg-white/15 hover:text-white disabled:opacity-30 transition-all"
                >
                  Siguiente
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Player area — iframe always, no pointer-event conflicts */}
      <div className="flex-1 relative bg-black">
        {!imdbId && !url ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <p className="text-white/60 text-lg mb-4">No se proporcionó contenido para reproducir.</p>
              <button onClick={handleBack} className="text-primary hover:underline text-sm">Volver</button>
            </div>
          </div>
        ) : (
          <>
            {/* Timeout overlay */}
            {timedOut && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/85 backdrop-blur-sm">
                <div className="bg-gray-900 border border-gray-700 rounded-2xl p-8 max-w-sm text-center shadow-2xl mx-4">
                  <div className="text-4xl mb-4">⚠️</div>
                  <p className="text-white font-semibold text-base mb-2">
                    Este servidor no respondió.
                  </p>
                  <p className="text-gray-400 text-sm mb-6">
                    Prueba con otro servidor o abre el enlace directamente.
                  </p>
                  {activeServer < SERVERS.length - 1 && (
                    <button
                      onClick={() => setActiveServer((s) => s + 1)}
                      className="w-full bg-primary hover:bg-primary/80 text-white font-bold py-2.5 rounded-lg transition-colors mb-3"
                    >
                      Probar {SERVERS[activeServer + 1].label}
                    </button>
                  )}
                  <button
                    onClick={() => window.open(iframeSrc, "_blank")}
                    className="w-full bg-white/10 hover:bg-white/20 text-white font-medium py-2.5 rounded-lg transition-colors mb-3"
                  >
                    Abrir en nueva pestaña
                  </button>
                  <button
                    onClick={() => setTimedOut(false)}
                    className="text-gray-500 hover:text-white text-xs transition-colors"
                  >
                    Seguir esperando
                  </button>
                </div>
              </div>
            )}
            <iframe
              key={`${iframeSrc}-${activeServer}-${episode}`}
              src={iframeSrc}
              className="absolute inset-0 w-full h-full border-0"
              allowFullScreen
              allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
              referrerPolicy="origin"
              title={title}
              onLoad={() => {
                if (timeoutRef.current) clearTimeout(timeoutRef.current);
                setTimedOut(false);
              }}
            />
          </>
        )}
      </div>
    </div>
  );
}
