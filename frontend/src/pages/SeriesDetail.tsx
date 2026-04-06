import { useState, useMemo } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { getSeriesById } from "@/lib/api";
import { useFetch } from "@/hooks/useFetch";
import type { Season, Episode } from "@/lib/types";

const FALLBACK_BG =
  "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=1400&auto=format&fit=crop";
const FALLBACK_POSTER =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='300' viewBox='0 0 200 300'%3E%3Crect width='200' height='300' fill='%231a1a1a'/%3E%3Ctext x='100' y='150' font-family='sans-serif' font-size='14' fill='%23555' text-anchor='middle' dominant-baseline='middle'%3ESin imagen%3C/text%3E%3C/svg%3E";

export default function SeriesDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: series, loading, error } = useFetch(() => getSeriesById(id!), [id]);

  const [selectedSeason, setSelectedSeason] = useState(0);

  const seasons: Season[] = useMemo(() => series?.seasons ?? [], [series]);
  const currentSeason = seasons[selectedSeason];
  const episodes: Episode[] = currentSeason?.episodes ?? [];

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

  return (
    <div className="min-h-screen bg-brand-dark">
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
              {series.rating !== undefined && (
                <span className="flex items-center gap-1 text-brand-gold font-bold">
                  <span>&#9733;</span>
                  <span>{Number(series.rating).toFixed(1)}</span>
                </span>
              )}
              {series.year && <span className="text-gray-400">{series.year}</span>}
              {seasons.length > 0 && (
                <span className="text-gray-400">
                  {seasons.length} temporada{seasons.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>

            {series.genres && series.genres.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-5">
                {series.genres.map((g) => (
                  <span
                    key={g}
                    className="text-xs bg-brand-surface border border-brand-border rounded-full px-3 py-1 text-gray-300"
                  >
                    {g}
                  </span>
                ))}
              </div>
            )}

            {series.synopsis && (
              <p className="text-gray-300 text-sm sm:text-base leading-relaxed max-w-2xl">
                {series.synopsis}
              </p>
            )}
          </div>
        </div>

        {/* Season selector + Episodes */}
        {seasons.length > 0 && (
          <div className="mt-12">
            {/* Season tabs */}
            <div className="flex items-center gap-3 mb-6 overflow-x-auto pb-1">
              {seasons.map((season, idx) => (
                <button
                  key={season.number}
                  onClick={() => setSelectedSeason(idx)}
                  className={`flex-shrink-0 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                    selectedSeason === idx
                      ? "bg-brand-red text-white"
                      : "bg-brand-surface border border-brand-border text-gray-400 hover:text-white hover:border-gray-500"
                  }`}
                >
                  Temporada {season.number}
                </button>
              ))}
            </div>

            {/* Episode list */}
            {episodes.length === 0 ? (
              <p className="text-gray-500 text-sm">Sin episodios disponibles.</p>
            ) : (
              <div className="space-y-2">
                {episodes.map((ep, idx) => {
                  const firstSource = ep.video_sources?.[0];
                  return (
                    <div
                      key={ep.number ?? idx}
                      className="flex items-center justify-between gap-4 bg-brand-surface border border-brand-border rounded-lg px-4 py-3 hover:border-gray-600 transition-colors group"
                    >
                      <div className="flex items-center gap-4 min-w-0">
                        {/* Episode number */}
                        <span className="text-brand-red font-black text-sm w-8 text-center flex-shrink-0">
                          {ep.number ?? idx + 1}
                        </span>
                        {/* Title */}
                        <div className="min-w-0">
                          <p className="text-gray-200 text-sm font-medium truncate group-hover:text-white transition-colors">
                            {ep.title || `Episodio ${ep.number ?? idx + 1}`}
                          </p>
                          {ep.duration_min && (
                            <p className="text-gray-500 text-xs mt-0.5">{ep.duration_min} min</p>
                          )}
                        </div>
                      </div>

                      {/* Source buttons */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {ep.video_sources && ep.video_sources.length > 0 ? (
                          ep.video_sources.map((src, si) => (
                            <button
                              key={si}
                              onClick={() =>
                                navigate(
                                  `/player?url=${encodeURIComponent(src.url)}&title=${encodeURIComponent(`${series.title} — Ep. ${ep.number ?? idx + 1}`)}&label=${encodeURIComponent(src.label)}`
                                )
                              }
                              className={`flex items-center gap-1.5 text-xs font-semibold py-1.5 px-3 rounded transition-colors ${
                                si === 0
                                  ? "bg-brand-red hover:bg-red-700 text-white"
                                  : "bg-brand-border hover:bg-gray-600 text-gray-300"
                              }`}
                            >
                              <PlayIcon />
                              {(ep.video_sources?.length ?? 0) > 1 ? src.label : "Ver"}
                            </button>
                          ))
                        ) : (
                          <span className="text-xs text-gray-600 italic">No disponible</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {seasons.length === 0 && (
          <div className="mt-12 text-center py-12 border border-brand-border rounded-xl">
            <p className="text-gray-500">No hay temporadas disponibles para esta serie.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function PlayIcon() {
  return (
    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}
