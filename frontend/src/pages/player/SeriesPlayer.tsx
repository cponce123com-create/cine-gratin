import { useState, useEffect } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";

const MAX_SEASONS = 20;
const MAX_EPISODES = 50;

export default function SeriesPlayer() {
  const { imdbId } = useParams<{ imdbId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const title = searchParams.get("title") ?? "Reproduciendo";
  const initSeason = Math.max(1, parseInt(searchParams.get("season") ?? "1", 10) || 1);
  const initEpisode = Math.max(1, parseInt(searchParams.get("episode") ?? "1", 10) || 1);

  const [season, setSeason] = useState(initSeason);
  const [episode, setEpisode] = useState(initEpisode);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [iframeSrc, setIframeSrc] = useState(
    `https://vidsrc.mov/embed/tv/${imdbId}/${initSeason}/${initEpisode}`
  );
  const [showSelectors, setShowSelectors] = useState(false);

  // Update iframe src when season/episode changes
  useEffect(() => {
    setIframeSrc(`https://vidsrc.mov/embed/tv/${imdbId}/${season}/${episode}`);
  }, [imdbId, season, episode]);

  // Auto-hide controls after 5 s of no interaction
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    if (controlsVisible && !showSelectors) {
      timer = setTimeout(() => setControlsVisible(false), 5000);
    }
    return () => clearTimeout(timer);
  }, [controlsVisible, showSelectors]);

  const seasonOptions = Array.from({ length: MAX_SEASONS }, (_, i) => i + 1);
  const episodeOptions = Array.from({ length: MAX_EPISODES }, (_, i) => i + 1);

  const handleApply = () => {
    setShowSelectors(false);
  };

  return (
    <div
      className="fixed inset-0 bg-black flex flex-col cursor-pointer"
      onClick={() => setControlsVisible(true)}
    >
      {/* Top controls bar */}
      <div
        className={`absolute top-0 inset-x-0 z-20 bg-gradient-to-b from-black/85 via-black/40 to-transparent pb-8 transition-opacity duration-300 ${
          controlsVisible ? "opacity-100" : "opacity-0"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 pt-3 pb-0">
          {/* Back */}
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-white/80 hover:text-white transition-colors text-sm font-medium flex-shrink-0"
          >
            <BackIcon />
            Volver
          </button>

          {/* Title */}
          <h1 className="text-white/90 font-bold text-sm sm:text-base truncate flex-1">
            {title}
            <span className="text-white/50 font-normal ml-2 text-xs">
              T{season} · E{episode}
            </span>
          </h1>

          {/* Selector toggle */}
          <button
            onClick={() => setShowSelectors((v) => !v)}
            className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 border border-white/10 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors flex-shrink-0"
          >
            <ListIcon />
            Episodios
          </button>
        </div>

        {/* Season / episode selector panel */}
        {showSelectors && (
          <div
            className="mx-4 mt-3 bg-black/90 border border-white/10 rounded-xl p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-wrap gap-4 items-end">
              <div>
                <label className="block text-white/50 text-xs font-medium mb-1.5 uppercase tracking-wider">
                  Temporada
                </label>
                <select
                  value={season}
                  onChange={(e) => {
                    setSeason(Number(e.target.value));
                    setEpisode(1);
                  }}
                  className="bg-white/10 border border-white/10 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-white/30"
                >
                  {seasonOptions.map((s) => (
                    <option key={s} value={s} className="bg-gray-900">
                      Temporada {s}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-white/50 text-xs font-medium mb-1.5 uppercase tracking-wider">
                  Episodio
                </label>
                <select
                  value={episode}
                  onChange={(e) => setEpisode(Number(e.target.value))}
                  className="bg-white/10 border border-white/10 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-white/30"
                >
                  {episodeOptions.map((ep) => (
                    <option key={ep} value={ep} className="bg-gray-900">
                      Episodio {ep}
                    </option>
                  ))}
                </select>
              </div>

              <button
                onClick={handleApply}
                className="bg-brand-red hover:bg-red-700 text-white text-sm font-bold px-4 py-2 rounded-lg transition-colors"
              >
                Reproducir
              </button>
            </div>

            {/* Episode quick-navigation arrows */}
            <div className="flex items-center gap-3 mt-4 pt-3 border-t border-white/10">
              <button
                onClick={() => setEpisode((e) => Math.max(1, e - 1))}
                disabled={episode <= 1}
                className="flex items-center gap-1.5 text-white/70 hover:text-white text-xs disabled:opacity-30 transition-colors"
              >
                <ChevronLeftIcon />
                Anterior
              </button>
              <span className="text-white/40 text-xs flex-1 text-center">
                T{season} · E{episode}
              </span>
              <button
                onClick={() => setEpisode((e) => Math.min(MAX_EPISODES, e + 1))}
                disabled={episode >= MAX_EPISODES}
                className="flex items-center gap-1.5 text-white/70 hover:text-white text-xs disabled:opacity-30 transition-colors"
              >
                Siguiente
                <ChevronRightIcon />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Fullscreen iframe */}
      <iframe
        key={iframeSrc}
        src={iframeSrc}
        className="w-full h-full border-0"
        allowFullScreen
        allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
        referrerPolicy="origin"
        title={`${title} T${season}E${episode}`}
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

function ListIcon() {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="8" y1="6" x2="21" y2="6" strokeLinecap="round" />
      <line x1="8" y1="12" x2="21" y2="12" strokeLinecap="round" />
      <line x1="8" y1="18" x2="21" y2="18" strokeLinecap="round" />
      <circle cx="3" cy="6" r="1" fill="currentColor" />
      <circle cx="3" cy="12" r="1" fill="currentColor" />
      <circle cx="3" cy="18" r="1" fill="currentColor" />
    </svg>
  );
}

function ChevronLeftIcon() {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
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
