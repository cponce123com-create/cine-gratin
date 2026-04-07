import { useState, useEffect, useRef } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { trackMovieView } from "@/lib/api";

interface Server {
  label: string;
  url: (imdbId: string) => string;
}

const SERVERS: Server[] = [
  { label: "Servidor 1", url: (id) => `https://vidsrc.net/embed/movie/${id}/` },
  { label: "Servidor 2", url: (id) => `https://vidsrc.pro/embed/movie/${id}` },
  { label: "Servidor 3", url: (id) => `https://vidsrc.xyz/embed/movie?imdb=${id}` },
  { label: "Servidor 4", url: (id) => `https://www.2embed.cc/embed/${id}` },
  { label: "Servidor 5", url: (id) => `https://vidsrc.mov/embed/movie/${id}` },
];

const TIMEOUT_MS = 12000;

export default function MoviePlayer() {
  const { imdbId } = useParams<{ imdbId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const title = searchParams.get("title") ?? "Reproduciendo";
  const [activeServer, setActiveServer] = useState(0);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [timedOut, setTimedOut] = useState(false);

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Track view on mount
  useEffect(() => {
    if (imdbId) trackMovieView(imdbId).catch(() => {});
  }, [imdbId]);

  // Reset timeout whenever server changes
  useEffect(() => {
    setTimedOut(false);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setTimedOut(true), TIMEOUT_MS);
    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
  }, [activeServer]);

  const src = SERVERS[activeServer].url(imdbId!);

  const switchToNext = () => {
    if (activeServer < SERVERS.length - 1) setActiveServer((s) => s + 1);
  };

  return (
    <div
      className="fixed inset-0 bg-black flex flex-col cursor-pointer"
      onClick={() => setControlsVisible(true)}
    >
      <Helmet>
        <title>{title} — Cine Gratín</title>
      </Helmet>

      {/* Top controls */}
      <div
        className={`absolute top-0 inset-x-0 z-20 transition-opacity duration-300 ${
          controlsVisible ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-gradient-to-b from-black/90 via-black/60 to-transparent pb-10 px-4 pt-3 space-y-2.5">
          {/* Row 1: back + title */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="flex items-center gap-1.5 text-white/80 hover:text-white transition-colors text-sm font-medium flex-shrink-0"
            >
              <BackIcon /> Volver
            </button>
            <h1 className="text-white/90 font-bold text-sm sm:text-base truncate flex-1 min-w-0">
              {title}
            </h1>
          </div>

          {/* Row 2: server buttons */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {SERVERS.map((srv, idx) => (
              <button
                key={idx}
                onClick={() => setActiveServer(idx)}
                className={`text-[11px] font-semibold px-2.5 py-1 rounded-md border transition-all ${
                  activeServer === idx
                    ? "bg-brand-red border-red-700 text-white shadow-sm"
                    : "bg-white/5 border-white/10 text-white/50 hover:bg-white/10 hover:text-white/80 hover:border-white/20"
                }`}
              >
                {srv.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Timeout overlay */}
      {timedOut && (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="bg-brand-card border border-brand-border rounded-2xl p-8 max-w-sm text-center shadow-2xl">
            <div className="text-4xl mb-4">⚠️</div>
            <p className="text-white font-semibold text-base mb-2">
              Este servidor no respondió.
            </p>
            <p className="text-gray-400 text-sm mb-6">
              Prueba con otro servidor para ver este contenido.
            </p>
            {activeServer < SERVERS.length - 1 ? (
              <button
                onClick={switchToNext}
                className="w-full bg-brand-red hover:bg-red-700 text-white font-bold py-2.5 rounded-lg transition-colors"
              >
                Probar {SERVERS[activeServer + 1].label}
              </button>
            ) : (
              <p className="text-gray-500 text-sm">No hay más servidores disponibles.</p>
            )}
            <button
              onClick={() => setTimedOut(false)}
              className="mt-3 text-gray-500 hover:text-white text-xs transition-colors"
            >
              Seguir esperando
            </button>
          </div>
        </div>
      )}

      {/* Fullscreen iframe */}
      <iframe
        key={src}
        src={src}
        className="w-full h-full border-0"
        allowFullScreen
        allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
        referrerPolicy="origin"
        title={title}
        onLoad={() => {
          if (timeoutRef.current) clearTimeout(timeoutRef.current);
          setTimedOut(false);
        }}
      />
    </div>
  );
}

function BackIcon() {
  return (
    <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M19 12H5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
