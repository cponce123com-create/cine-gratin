import { useState } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";

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
  const [controlsVisible, setControlsVisible] = useState(true);

  const src = SERVERS[activeServer].url(imdbId!);

  return (
    <div
      className="fixed inset-0 bg-black flex flex-col cursor-pointer"
      onClick={() => setControlsVisible((v) => !v)}
    >
      {/* Top controls bar */}
      <div
        className={`absolute top-0 inset-x-0 z-20 transition-opacity duration-300 ${
          controlsVisible ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Gradient background */}
        <div className="bg-gradient-to-b from-black/90 via-black/60 to-transparent pb-10 px-4 pt-3">
          {/* Row 1: back + title */}
          <div className="flex items-center gap-3 mb-3">
            <button
              onClick={() => navigate(-1)}
              className="flex items-center gap-1.5 text-white/80 hover:text-white transition-colors text-sm font-medium flex-shrink-0"
            >
              <BackIcon />
              Volver
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

      {/* Fullscreen iframe — key forces reload on server switch */}
      <iframe
        key={src}
        src={src}
        className="w-full h-full border-0"
        allowFullScreen
        allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
        referrerPolicy="origin"
        title={title}
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
