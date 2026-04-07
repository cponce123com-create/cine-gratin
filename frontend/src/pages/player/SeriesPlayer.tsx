import { useState, useEffect } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { getSeriesById } from "@/lib/api";
import type { SeasonData } from "@/lib/types";

interface Server {
  label: string;
  url: (imdbId: string, season: number, episode: number) => string;
}

const SERVERS: Server[] = [
  {
    label: "Servidor 1",
    url: (id, s, e) => `https://vidsrc.net/embed/tv/${id}/${s}/${e}/`,
  },
  {
    label: "Servidor 2",
    url: (id, s, e) => `https://vidsrc.mov/embed/tv/${id}/${s}/${e}`,
  },
];

function parseSeasons(raw: unknown): SeasonData[] {
  if (!raw) return [];
  if (typeof raw === "string") {
    try { return JSON.parse(raw) as SeasonData[]; } catch { return []; }
  }
  return Array.isArray(raw) ? (raw as SeasonData[]) : [];
}

export default function SeriesPlayer() {
  const { imdbId } = useParams<{ imdbId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const title = searchParams.get("title") ?? "Reproduciendo";
  const initSeason = Math.max(1, parseInt(searchParams.get("season") ?? "1", 10) || 1);
  const initEpisode = Math.max(1, parseInt(searchParams.get("episode") ?? "1", 10) || 1);

  const [season, setSeason] = useState(initSeason);
  const [episode, setEpisode] = useState(initEpisode);
  const [activeServer, setActiveServer] = useState(0);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [showSelectors, setShowSelectors] = useState(false);

  // Real season/episode counts from the API
  const [totalSeasons, setTotalSeasons] = useState<number | null>(null);
  const [seasonsData, setSeasonsData] = useState<SeasonData[]>([]);

  useEffect(() => {
    if (!imdbId) return;
    getSeriesById(imdbId)
      .then((s) => {
        const parsed = parseSeasons(s.seasons_data);
        setSeasonsData(parsed);
        setTotalSeasons(s.total_seasons ?? parsed.length ?? 1);
      })
      .catch(() => {
        setTotalSeasons(10);
      });
  }, [imdbId]);

  const resolvedTotalSeasons = totalSeasons ?? 1;

  // How many episodes in the currently selected season
  const episodesInSeason = (() => {
    const found = seasonsData.find((s) => s.season === season);
    return found ? found.episodes : 30;
  })();

  const iframeSrc = SERVERS[activeServer].url(imdbId!, season, episode);

  // Auto-hide controls after 5 s (paused while selectors panel is open)
  useEffect(() => {
    if (!controlsVisible || showSelectors) return;
    const timer = setTimeout(() => setControlsVisible(false), 5000);
    return () => clearTimeout(timer);
  }, [controlsVisible, showSelectors]);

  const seasonOptions = Array.from({ length: resolvedTotalSeasons }, (_, i) => i + 1);
  const episodeOptions = Array.from({ length: episodesInSeason }, (_, i) => i + 1);

  const handleSeasonChange = (newSeason: number) => {
    setSeason(newSeason);
    setEpisode(1);
  };

  const handlePrevEpisode = () => {
    if (episode > 1) {
      setEpisode((e) => e - 1);
    } else if (season > 1) {
      const prevSeason = season - 1;
      const prevSeasonData = seasonsData.find((s) => s.season === prevSeason);
      const lastEp = prevSeasonData ? prevSeasonData.episodes : 1;
      setSeason(prevSeason);
      setEpisode(lastEp);
    }
  };

  const handleNextEpisode = () => {
    if (episode < episodesInSeason) {
      setEpisode((e) => e + 1);
    } else if (season < resolvedTotalSeasons) {
      setSeason((s) => s + 1);
      setEpisode(1);
    }
  };

  const isFirst = season === 1 && episode <= 1;
  const isLast = season >= resolvedTotalSeasons && episode >= episodesInSeason;

  return (
    <div
      className="fixed inset-0 bg-black flex flex-col cursor-pointer"
      onClick={() => setControlsVisible(true)}
    >
      {/* Top controls bar */}
      <div
        className={`absolute top-0 inset-x-0 z-20 bg-gradient-to-b from-black/85 via-black/40 to-transparent pb-8 transition-opacity duration-300 ${
          controlsVisible ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 pt-3 flex-wrap">
          {/* Back */}
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-white/80 hover:text-white transition-colors text-sm font-medium flex-shrink-0"
          >
            <BackIcon />
            Volver
          </button>

          {/* Title */}
          <h1 className="text-white/90 font-bold text-sm sm:text-base truncate flex-1 min-w-0">
            {title}
            <span className="text-white/50 font-normal ml-2 text-xs">
              T{season} · E{episode}
            </span>
          </h1>

          {/* Server buttons */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
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

          {/* Episodes panel toggle */}
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
                  {totalSeasons === null && (
                    <span className="ml-1 text-white/30 normal-case tracking-normal">cargando...</span>
                  )}
                </label>
                <select
                  value={season}
                  onChange={(e) => handleSeasonChange(Number(e.target.value))}
                  className="bg-white/10 border border-white/10 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-white/30"
                >
                  {seasonOptions.map((s) => {
                    const sd = seasonsData.find((d) => d.season === s);
                    return (
                      <option key={s} value={s} className="bg-gray-900">
                        {sd?.name && sd.name !== `Season ${s}` ? sd.name : `Temporada ${s}`}
                        {sd ? ` (${sd.episodes} eps)` : ""}
                      </option>
                    );
                  })}
                </select>
              </div>

              <div>
                <label className="block text-white/50 text-xs font-medium mb-1.5 uppercase tracking-wider">
                  Episodio
                </label>
                <select
                  value={Math.min(episode, episodesInSeason)}
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
                onClick={() => setShowSelectors(false)}
                className="bg-brand-red hover:bg-red-700 text-white text-sm font-bold px-4 py-2 rounded-lg transition-colors"
              >
                Reproducir
              </button>
            </div>

            {/* Prev / next episode quick nav */}
            <div className="flex items-center gap-3 mt-4 pt-3 border-t border-white/10">
              <button
                onClick={handlePrevEpisode}
                disabled={isFirst}
                className="flex items-center gap-1.5 text-white/70 hover:text-white text-xs disabled:opacity-30 transition-colors"
              >
                <ChevronLeftIcon />
                Anterior
              </button>
              <span className="text-white/40 text-xs flex-1 text-center">
                T{season} · E{episode} / {episodesInSeason}
              </span>
              <button
                onClick={handleNextEpisode}
                disabled={isLast}
                className="flex items-center gap-1.5 text-white/70 hover:text-white text-xs disabled:opacity-30 transition-colors"
              >
                Siguiente
                <ChevronRightIcon />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Fullscreen iframe — key forces reload when any dependency changes */}
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
