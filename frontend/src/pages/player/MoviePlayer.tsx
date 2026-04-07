import { useState, useEffect } from "react";
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

export default function MoviePlayer() {
  const { imdbId } = useParams<{ imdbId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const title = searchParams.get("title") ?? "Reproduciendo";
  const [activeServer, setActiveServer] = useState(0);

  useEffect(() => {
    if (imdbId) trackMovieView(imdbId).catch(() => {});
  }, [imdbId]);

  const src = SERVERS[activeServer].url(imdbId!);

  return (
    <div className="fixed inset-0 bg-black flex flex-col">
      <Helmet>
        <title>{title} — Cine Gratín</title>
      </Helmet>

      {/* Controls bar — always on top, never overlaps the iframe */}
      <div className="flex-shrink-0 bg-black border-b border-white/10 px-3 pt-3 pb-2.5 space-y-2">
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

        {/* Row 2: servers + utility buttons */}
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

        {/* Row 3: black screen hint — always visible */}
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-white/35">
            ¿Pantalla en negro? Prueba otro servidor arriba.
          </span>
          {activeServer < SERVERS.length - 1 && (
            <button
              onClick={() => setActiveServer((s) => s + 1)}
              className="text-brand-red hover:text-red-400 font-semibold transition-colors flex items-center gap-1"
            >
              Siguiente servidor <ChevronRightIcon />
            </button>
          )}
        </div>
      </div>

      {/* Iframe area — below controls, no overlap */}
      <div className="relative flex-1">
        <iframe
          key={`${src}-${activeServer}`}
          src={src}
          className="absolute inset-0 w-full h-full border-0"
          allowFullScreen
          allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
          referrerPolicy="origin"
          title={title}
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

function ChevronRightIcon() {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
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
