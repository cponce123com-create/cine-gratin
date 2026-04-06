import { useParams, useSearchParams, useNavigate } from "react-router-dom";

export default function MoviePlayer() {
  const { imdbId } = useParams<{ imdbId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const title = searchParams.get("title") ?? "Reproduciendo";
  const src = `https://vidsrc.mov/embed/movie/${imdbId}`;

  return (
    <div className="fixed inset-0 bg-black flex flex-col">
      {/* Top controls bar */}
      <div className="flex-shrink-0 flex items-center gap-4 px-4 py-3 bg-gradient-to-b from-black/80 to-transparent absolute top-0 inset-x-0 z-20 pointer-events-none">
        <button
          onClick={() => navigate(-1)}
          className="pointer-events-auto flex items-center gap-2 text-white/80 hover:text-white transition-colors text-sm font-medium"
        >
          <BackIcon />
          Volver
        </button>
        <h1 className="text-white/90 font-bold text-sm sm:text-base truncate">
          {title}
        </h1>
      </div>

      {/* Fullscreen iframe */}
      <iframe
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
