import { useState, useMemo } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Helmet } from "react-helmet-async";
import { getSeriesById } from "@/lib/api";
import type { SeasonData } from "@/lib/types";

const FALLBACK_BG =
  "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=1400&auto=format&fit=crop";
const FALLBACK_POSTER =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='300' viewBox='0 0 200 300'%3E%3Crect width='200' height='300' fill='%231a1a1a'/%3E%3Ctext x='100' y='150' font-family='sans-serif' font-size='14' fill='%23555' text-anchor='middle' dominant-baseline='middle'%3ESin imagen%3C/text%3E%3C/svg%3E";

function parseSeasons(raw: unknown): SeasonData[] {
  if (!raw) return [];
  if (typeof raw === "string") {
    try { return JSON.parse(raw) as SeasonData[]; } catch { return []; }
  }
  return Array.isArray(raw) ? (raw as SeasonData[]) : [];
}

export default function SeriesDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: series, isLoading: loading, error } = useQuery({
    queryKey: ["series", id],
    queryFn: () => getSeriesById(id!),
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
  });

  const [selectedSeasonIdx, setSelectedSeasonIdx] = useState(0);

  const seasonsData: SeasonData[] = useMemo(
    () => parseSeasons(series?.seasons_data),
    [series?.seasons_data]
  );

  const currentSeason = seasonsData[selectedSeasonIdx] ?? null;
  const episodeCount = currentSeason?.episodes ?? 0;
  const episodes = useMemo(
    () => Array.from({ length: episodeCount }, (_, i) => i + 1),
    [episodeCount]
  );

  const trailerKey = series?.yt_trailer_code ?? null;
  const ogImage = series?.background_url || series?.poster_url || "";

  if (loading) {
    return (
      <div className="min-h-screen bg-brand-dark flex items-center justify-center pt-16">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 rounded-full border-2 border-brand-red border-t-transparent animate-spin" />
          <p className="text-gray-400 text-sm">Cargando...</p>
        </div>
      </div>
    );
  }

  if (error || !series) {
    return (
      <div className="min-h-screen bg-brand-dark flex items-center justify-center pt-16">
        <div className="text-center">
          <p className="text-red-400 text-lg">No se pudo cargar la serie.</p>
          <Link to="/series" className="mt-4 inline-block text-brand-red hover:text-red-400 underline">
            Volver a series
          </Link>
        </div>
      </div>
    );
  }

  const statusLabel =
    series.status === "Ended"
      ? "Finalizada"
      : series.status === "Returning Series"
      ? "En emisión"
      : series.status || null;

  return (
    <div className="min-h-screen bg-brand-dark">
      <Helmet>
        <title>{series.title}{series.year ? ` (${series.year})` : ""} — Cine Gratín</title>
        <meta name="description" content={series.synopsis?.slice(0, 160) ?? ""} />
        <meta property="og:title" content={`${series.title} — Cine Gratín`} />
        <meta property="og:description" content={series.synopsis?.slice(0, 200) ?? ""} />
        {ogImage && <meta property="og:image" content={ogImage} />}
        <meta property="og:type" content="video.tv_show" />
      </Helmet>

      {/* Backdrop hero */}
      <div className="relative w-full h-[55vh] min-h-[380px] overflow-hidden">
        <img
          src={series.background_url || series.poster_url || FALLBACK_BG}
          alt={series.title}
          className="w-full h-full object-cover object-top"
          onError={(e) => { (e.currentTarget as HTMLImageElement).src = FALLBACK_BG; }}
        />
        <div className="absolute inset-0 hero-gradient" />
        <div className="absolute inset-x-0 bottom-0 h-40 hero-gradient-bottom" />
        <button
          onClick={() => navigate(-1)}
          className="absolute top-20 left-6 flex items-center gap-2 text-gray-300 hover:text-white text-sm transition-colors"
        >
          <span>&#8592;</span>
          <span>Volver</span>
        </button>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 -mt-24 relative z-10 pb-16">
        <div className="flex flex-col sm:flex-row gap-8">
          {/* Poster */}
          <div className="flex-shrink-0 w-36 sm:w-48 md:w-56">
            <img
              src={series.poster_url || FALLBACK_POSTER}
              alt={series.title}
              className="w-full aspect-[2/3] object-cover rounded-xl shadow-2xl border border-brand-border"
              onError={(e) => { (e.currentTarget as HTMLImageElement).src = FALLBACK_POSTER; }}
            />
          </div>

          {/* Info */}
          <div className="flex-1 pt-2 sm:pt-12">
            <h1 className="text-2xl sm:text-4xl font-black text-white mb-3 leading-tight">
              {series.title}
            </h1>

            <div className="flex flex-wrap items-center gap-3 mb-4">
              {series.rating !== undefined && Number(series.rating) > 0 && (
                <span className="flex items-center gap-1 text-brand-gold font-bold">
                  <span>&#9733;</span>
                  <span>{Number(series.rating).toFixed(1)}</span>
                </span>
              )}
              {series.year && (
                <span className="text-gray-400">
                  {series.year}
                  {series.end_year && series.end_year !== series.year ? `–${series.end_year}` : ""}
                </span>
              )}
              {seasonsData.length > 0 && (
                <span className="text-gray-400">
                  {seasonsData.length} temporada{seasonsData.length !== 1 ? "s" : ""}
                </span>
              )}
              {series.total_seasons && seasonsData.length === 0 && (
                <span className="text-gray-400">
                  {series.total_seasons} temporada{series.total_seasons !== 1 ? "s" : ""}
                </span>
              )}
              {statusLabel && (
                <span
                  className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${
                    statusLabel === "En emisión"
                      ? "bg-green-900/30 text-green-400 border-green-800/50"
                      : "bg-gray-800 text-gray-400 border-gray-700"
                  }`}
                >
                  {statusLabel}
                </span>
              )}
            </div>

            {series.genres && series.genres.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-5">
                {series.genres.map((g) => (
                  <span key={g} className="text-xs bg-brand-surface border border-brand-border rounded-full px-3 py-1 text-gray-300">
                    {g}
                  </span>
                ))}
              </div>
            )}

            {series.synopsis && (
              <p className="text-gray-300 text-sm sm:text-base leading-relaxed max-w-2xl mb-5">
                {series.synopsis}
              </p>
            )}

            {series.creators && series.creators.length > 0 && (
              <p className="text-gray-400 text-sm mb-2">
                <span className="text-gray-500">Creadores: </span>
                {series.creators.join(", ")}
              </p>
            )}
            {series.cast_list && series.cast_list.length > 0 && (
              <p className="text-gray-400 text-sm mb-5">
                <span className="text-gray-500">Elenco: </span>
                {series.cast_list.slice(0, 6).join(", ")}
                {series.cast_list.length > 6 && (
                  <span className="text-gray-600"> y {series.cast_list.length - 6} más</span>
                )}
              </p>
            )}

            {series.imdb_id && (
              <button
                onClick={() => navigate(`/player/series/${series.imdb_id}?season=1&episode=1&title=${encodeURIComponent(series.title)}`)}
                className="flex items-center gap-2 bg-brand-red hover:bg-red-700 text-white font-bold py-3 px-6 rounded-lg transition-colors"
              >
                <PlayIcon /> Ver ahora
              </button>
            )}
          </div>
        </div>

        {/* Season selector + Episodes */}
        {seasonsData.length > 0 && (
          <div className="mt-12">
            <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-1">
              {seasonsData.map((season, idx) => (
                <button
                  key={season.season}
                  onClick={() => setSelectedSeasonIdx(idx)}
                  className={`flex-shrink-0 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                    selectedSeasonIdx === idx
                      ? "bg-brand-red text-white"
                      : "bg-brand-surface border border-brand-border text-gray-400 hover:text-white hover:border-gray-500"
                  }`}
                >
                  T{season.season}
                  <span className="ml-1.5 text-xs opacity-60">{season.episodes}ep</span>
                </button>
              ))}
            </div>

            {episodes.length === 0 ? (
              <p className="text-gray-500 text-sm">Sin episodios disponibles.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {episodes.map((epNum) => (
                  <button
                    key={epNum}
                    onClick={() => {
                      if (series.imdb_id) {
                        navigate(`/player/series/${series.imdb_id}?season=${currentSeason.season}&episode=${epNum}&title=${encodeURIComponent(series.title)}`);
                      }
                    }}
                    className="flex items-center gap-3 bg-brand-surface border border-brand-border rounded-lg px-4 py-3 hover:border-brand-red hover:bg-brand-surface/80 transition-all group text-left"
                  >
                    <span className="text-brand-red font-black text-sm w-7 text-center flex-shrink-0">
                      {epNum}
                    </span>
                    <span className="text-gray-300 text-sm group-hover:text-white transition-colors truncate">
                      Episodio {epNum}
                    </span>
                    <span className="ml-auto flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <PlayIcon />
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {seasonsData.length === 0 && (
          <div className="mt-12 text-center py-12 border border-brand-border rounded-xl">
            <p className="text-gray-500">No hay información de temporadas disponible.</p>
            {series.imdb_id && (
              <button
                onClick={() => navigate(`/player/series/${series.imdb_id}?season=1&episode=1&title=${encodeURIComponent(series.title)}`)}
                className="mt-4 flex items-center gap-2 bg-brand-red hover:bg-red-700 text-white font-bold py-2 px-5 rounded-lg transition-colors mx-auto"
              >
                <PlayIcon /> Ver T1 E1
              </button>
            )}
          </div>
        )}

        {/* YouTube Trailer */}
        {trailerKey && (
          <div className="mt-12">
            <h2 className="text-xl font-bold text-white mb-4">Tráiler</h2>
            <div className="relative aspect-video w-full max-w-3xl rounded-xl overflow-hidden bg-brand-surface shadow-2xl">
              <iframe
                src={`https://www.youtube.com/embed/${trailerKey}`}
                title={`Tráiler de ${series.title}`}
                className="absolute inset-0 w-full h-full"
                allowFullScreen
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function PlayIcon() {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}
