import { useState, useEffect } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { getSeriesById, trackSeriesView } from "@/lib/api";
import { useContinueWatching } from "@/hooks/useContinueWatching";
import type { SeasonData } from "@/lib/types";

interface Server {
  label: string;
  url: (imdbId: string, season: number, episode: number) => string;
}

const SERVERS: Server[] = [
  { label: "Servidor 1", url: (id, s, e) => `https://vidsrc.xyz/embed/tv?imdb=${id}&season=${s}&episode=${e}` },
  { label: "Servidor 2", url: (id, s, e) => `https://vidsrc.to/embed/tv/${id}/${s}/${e}` },
  { label: "Servidor 3", url: (id, s, e) => `https://www.2embed.cc/embedtv/${id}&s=${s}&e=${e}` },
  { label: "Servidor 4", url: (id, s, e) => `https://multiembed.mov/?video_id=${id}&tmdb=1&s=${s}&e=${e}` },
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

  const rawTitle = searchParams.get("title");
  const title = rawTitle && rawTitle.trim() ? rawTitle.trim() : "Serie";
  const initSeason = Math.max(1, parseInt(searchParams.get("season") ?? "1", 10) || 1);
  const initEpisode = Math.max(1, parseInt(searchParams.get("episode") ?? "1", 10) || 1);

  const [season, setSeason] = useState(initSeason);
  const [episode, setEpisode] = useState(initEpisode);
  const [activeServer, setActiveServer] = useState(0);
  const [showSelectors, setShowSelectors] = useState(false);

  const [totalSeasons, setTotalSeasons] = useState<number | null>(null);
  const [seasonsData, setSeasonsData] = useState<SeasonData[]>([]);
  const { saveItem } = useContinueWatching();

  useEffect(() => {
    if (imdbId) trackSeriesView(imdbId).catch(() => {});
  }, [imdbId]);

  useEffect(() => {
    if (!imdbId) return;
    getSeriesById(imdbId)
      .then((s) => {
        const parsed = parseSeasons(s.seasons_data);
        setSeasonsData(parsed);
        setTotalSeasons(s.total_seasons ?? parsed.length ?? 1);
        
        // Save to continue watching
        saveItem({
          id: s.id,
          imdbId: imdbId,
          title: s.title,
          type: "series",
          poster_url: s.poster_url,
          season,
          episode,
        });
      })
      .catch(() => {
        setTotalSeasons(10);
        // Fallback save
        saveItem({
          id: imdbId,
          imdbId: imdbId,
          title: title,
          type: "series",
          season,
          episode,
        });
      });
  }, [imdbId, season, episode, title]);

  const resolvedTotalSeasons = totalSeasons ?? 1;
  const episodesInSeason = seasonsData.find((s) => s.season === season)?.episodes ?? 30;
  const iframeSrc = SERVERS[activeServer].url(imdbId!, season, episode);

  const seasonOptions = Array.from({ length: resolvedTotalSeasons }, (_, i) => i + 1);
  const episodeOptions = Array.from({ length: episodesInSeason }, (_, i) => i + 1);

  const handleSeasonChange = (s: number) => { setSeason(s); setEpisode(1); };

  const handlePrev = () => {
    if (episode > 1) { setEpisode((e) => e - 1); return; }
    if (season > 1) {
      const prev = season - 1;
      const prevEps = seasonsData.find((s) => s.season === prev)?.episodes ?? 1;
      setSeason(prev); setEpisode(prevEps);
    }
  };

  const handleNext = () => {
    if (episode < episodesInSeason) { setEpisode((e) => e + 1); return; }
    if (season < resolvedTotalSeasons) { setSeason((s) => s + 1); setEpisode(1); }
  };

  const isFirst = season === 1 && episode <= 1;
  const isLast = season >= resolvedTotalSeasons && episode >= episodesInSeason;

  return (
    <div className="fixed inset-0 bg-black flex flex-col">
      <Helmet>
        <title>{title && title.trim() ? `${title} T${season}E${episode} — Cine Gratín` : `Cine Gratín - T${season}E${episode}`}</title>
      </Helmet>

      {/* Controls bar — always on top, never overlaps the iframe */}
      <div className="flex-shrink-0 bg-black border-b border-white/10 px-3 pt-3 pb-2.5 space-y-2">
        {/* Row 1: back + title + episodes toggle */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-1.5 text-white/80 hover:text-white transition-colors text-sm font-medium flex-shrink-0"
          >
            <BackIcon /> Volver
          </button>
          <h1 className="text-white/90 font-bold text-sm sm:text-base truncate flex-1 min-w-0">
            {title}
            <span className="text-white/50 font-normal ml-2 text-xs">T{season} · E{episode}</span>
          </h1>
          <button
            onClick={() => setShowSelectors((v) => !v)}
            className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 border border-white/10 text-white text-[11px] font-semibold px-2.5 py-1 rounded-md transition-colors flex-shrink-0"
          >
            <ListIcon /> Episodios
          </button>
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
              onClick={() => window.open(iframeSrc, "_blank")}
              title="Abrir en nueva pestaña"
              className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-md border bg-white/5 border-white/10 text-white/60 hover:bg-white/15 hover:text-white hover:border-white/25 transition-all"
            >
              <ExternalLinkIcon />
              <span className="hidden sm:inline">Abrir enlace</span>
            </button>
          </div>
        </div>



        {/* Episode selector panel */}
        {showSelectors && (
          <div className="bg-black/90 border border-white/10 rounded-xl p-4">
            <div className="flex flex-wrap gap-4 items-end">
              <div>
                <label className="block text-white/50 text-xs font-medium mb-1.5 uppercase tracking-wider">
                  Temporada
                  {totalSeasons === null && <span className="ml-1 text-white/30 normal-case tracking-normal">cargando...</span>}
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
                    <option key={ep} value={ep} className="bg-gray-900">Episodio {ep}</option>
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

            <div className="flex items-center gap-3 mt-4 pt-3 border-t border-white/10">
              <button
                onClick={handlePrev}
                disabled={isFirst}
                className="flex items-center gap-1.5 text-white/70 hover:text-white text-xs disabled:opacity-30 transition-colors"
              >
                <ChevronLeftIcon /> Anterior
              </button>
              <span className="text-white/40 text-xs flex-1 text-center">
                T{season} · E{episode} / {episodesInSeason}
              </span>
              <button
                onClick={handleNext}
                disabled={isLast}
                className="flex items-center gap-1.5 text-white/70 hover:text-white text-xs disabled:opacity-30 transition-colors"
              >
                Siguiente <ChevronRightIcon />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Iframe area — below controls, no overlap */}
      <div className="relative flex-1">
        <iframe
          key={`${iframeSrc}-${activeServer}-${season}-${episode}`}
          src={iframeSrc}
          className="absolute inset-0 w-full h-full border-0"
          allowFullScreen
          allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
          referrerPolicy="origin"
          title={`${title} T${season}E${episode}`}
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
