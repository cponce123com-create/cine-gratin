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
  const [timedOut, setTimedOut] = useState(false);

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (imdbId) trackMovieView(imdbId).catch(() => {});
  }, [imdbId]);

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
    <div className="fixed inset-0 bg-black flex flex-col">
      <Helmet>
        <title>{title} — Cine Gratín</title>
      </Helmet>

      {/* Controls bar — always on top, never overlaps the iframe */}
      <div className="flex-shrink-0 bg-gradient-to-b from-black/95 to-black/70 px-3 pt-3 pb-2.5 space-y-2">
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

        {/* Row 2: servers + fullscreen */}
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
          <div className="ml-auto flex items-center gap-1.5">
            <button
              onClick={() => document.documentElement.requestFullscreen?.()}
              title="Pantalla completa"
              className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-md border bg-white/5 border-white/10 text-white/60 hover:bg-white/15 hover:text-white hover:border-white/25 transition-all"
            >
              <FullscreenIcon />
              <span className="hidden sm:inline">Pantalla completa</span>
            </button>
            <button
              onClick={() => window.open(src, "_blank")}
              title="Abrir en nueva pestaña"
              className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-md border bg-white/5 border-white/10 text-white/60 hover:bg-white/15 hover:text-white hover:border-white/25 transition-all"
            >
              <ExternalLinkIcon />
              <span className="hidden sm:inline">Abrir enlace</span>
            </button>
          </div>
        </div>
      </div>

      {/* Iframe area — below controls, no overlap */}
      <div className="relative flex-1">
        {/* Timeout overlay */}
        {timedOut && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/80 backdrop-blur-sm">
            <div className="bg-gray-900 border border-gray-700 rounded-2xl p-8 max-w-sm text-center shadow-2xl mx-4">
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

        <iframe
          key={src}
          src={src}
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
      </div>
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

function FullscreenIcon() {
  return (
    <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M8 3H5a2 2 0 0 0-2 2v3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M21 8V5a2 2 0 0 0-2-2h-3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 16v3a2 2 0 0 0 2 2h3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16 21h3a2 2 0 0 0 2-2v-3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ExternalLinkIcon() {
  return (
    <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points="15 3 21 3 21 9" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="10" y1="14" x2="21" y2="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
