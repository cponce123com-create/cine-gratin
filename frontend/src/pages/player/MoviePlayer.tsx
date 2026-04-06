import { useState } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";

interface Server {
  label: string;
  url: (imdbId: string) => string;
}

const SERVERS: Server[] = [
  {
    label: "Servidor 1",
    url: (id) => `https://vidsrc.net/embed/movie/${id}/`,
  },
  {
    label: "Servidor 2",
    url: (id) => `https://vidsrc.mov/embed/movie/${id}`,
  },
];

export default function MoviePlayer() {
  const { imdbId } = useParams<{ imdbId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const title = searchParams.get("title") ?? "Reproduciendo";
  const [activeServer, setActiveServer] = useState(0);

  const src = SERVERS[activeServer].url(imdbId!);

  return (
    <div className="fixed inset-0 bg-black flex flex-col">
      {/* Top controls bar */}
      <div className="flex-shrink-0 absolute top-0 inset-x-0 z-20 bg-gradient-to-b from-black/85 via-black/40 to-transparent pb-8 pointer-events-none">
        <div className="flex items-center gap-3 px-4 pt-3">
          {/* Back button */}
          <button
            onClick={() => navigate(-1)}
            className="pointer-events-auto flex items-center gap-2 text-white/80 hover:text-white transition-colors text-sm font-medium flex-shrink-0"
          >
            <BackIcon />
            Volver
          </button>

          {/* Title */}
          <h1 className="text-white/90 font-bold text-sm sm:text-base truncate flex-1 pointer-events-none">
            {title}
          </h1>

          {/* Server buttons */}
          <div className="pointer-events-auto flex items-center gap-1.5 flex-shrink-0">
            {SERVERS.map((srv, idx) => (
              <button
                key={idx}
                onClick={() => setActiveServer(idx)}
                className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${
                  activeServer === idx
                    ? "bg-white/15 border-white/25 text-white"
                    : "bg-transparent border-white/10 text-white/50 hover:text-white/80 hover:border-white/20"
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
