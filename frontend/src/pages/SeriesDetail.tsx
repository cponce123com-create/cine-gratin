import { useState, useMemo } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Helmet } from "react-helmet-async";
import { getSeriesById } from "@/lib/api";
import type { SeasonData, CastMember, TmdbVideo, TmdbReview } from "@/lib/types";
import { FALLBACK_BG, FALLBACK_POSTER } from "@/components/detail/constants";
import { CastSection } from "@/components/detail/CastSection";
import { MediaSection, RecommendationsSection } from "@/components/detail/MediaSection";
import { ReviewCard } from "@/components/detail/ReviewCard";

function PlayIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
  );
}

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

  const firstSource = series?.video_sources?.[0];
  const ogImage = series?.background_url || series?.poster_url || "";
  const allVideos: TmdbVideo[] = series?.videos ?? [];
  const reviews: TmdbReview[] = series?.reviews ?? [];
  const castFull: CastMember[] = series?.cast_full ?? [];
  const seasonsData = useMemo(() => parseSeasons(series?.seasons_data), [series?.seasons_data]);
  const showYear = (series?.year ?? 0) > 0;

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
          <Link to="/series" className="mt-4 inline-block text-brand-red hover:text-red-400 underline">Volver a series</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-brand-dark">
      <Helmet>
        <title>{series.title}{showYear ? ` (${series.year})` : ""} — Cine Gratín</title>
        <meta name="description" content={series.synopsis?.slice(0, 160) ?? ""} />
        <meta property="og:title" content={`${series.title} — Cine Gratín`} />
        <meta property="og:description" content={series.synopsis?.slice(0, 200) ?? ""} />
        {ogImage && <meta property="og:image" content={ogImage} />}
        <meta property="og:type" content="video.tv_show" />
      </Helmet>

      {/* Backdrop */}
      <div className="relative w-full h-[55vh] min-h-[380px] overflow-hidden">
        <img
          src={series.background_url || series.poster_url || FALLBACK_BG}
          alt={series.title}
          className="w-full h-full object-cover object-top"
          onError={e => { (e.currentTarget as HTMLImageElement).src = FALLBACK_BG; }}
        />
        <div className="absolute inset-0 hero-gradient" />
        <div className="absolute inset-x-0 bottom-0 h-40 hero-gradient-bottom" />
        <button
          onClick={() => navigate(-1)}
          className="absolute top-20 left-6 flex items-center gap-2 text-gray-300 hover:text-white text-sm transition-colors"
        >
          ← Volver
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
              onError={e => { (e.currentTarget as HTMLImageElement).src = FALLBACK_POSTER; }}
            />
          </div>

          {/* Info */}
          <div className="flex-1 pt-2 sm:pt-12">
            <h1 className="text-2xl sm:text-4xl font-black text-white mb-2 leading-tight">
              {series.title}
              {showYear && <span className="ml-2 text-lg sm:text-2xl font-normal text-gray-400">({series.year})</span>}
            </h1>

            <div className="flex flex-wrap items-center gap-3 mb-4">
              {series.rating !== undefined && Number(series.rating) > 0 && (
                <span className="flex items-center gap-1 text-brand-gold font-bold">★ {Number(series.rating).toFixed(1)}</span>
              )}
              {series.mpa_rating && series.mpa_rating !== "NR" && (
                <span className="text-xs border border-gray-600 text-gray-400 px-1.5 py-0.5 rounded">{series.mpa_rating}</span>
              )}
              {seasonsData.length > 0 && (
                <span className="text-gray-400">{seasonsData.length} temporada{seasonsData.length !== 1 ? "s" : ""}</span>
              )}
            </div>

            {series.genres && series.genres.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-5">
                {series.genres.map(g => (
                  <span key={g} className="text-xs bg-brand-surface border border-brand-border rounded-full px-3 py-1 text-gray-300">{g}</span>
                ))}
              </div>
            )}

            {series.synopsis && (
              <p className="text-gray-300 text-sm sm:text-base leading-relaxed mb-5 max-w-2xl">{series.synopsis}</p>
            )}

            <div className="flex flex-wrap gap-3">
              {series.imdb_id ? (
                <button
                  onClick={() => navigate(`/player/series/${series.imdb_id}?title=${encodeURIComponent(series.title)}`)}
                  className="flex items-center gap-2 bg-brand-red hover:bg-red-700 text-white font-bold py-3 px-6 rounded-lg transition-colors"
                >
                  <PlayIcon /> Ver ahora
                </button>
              ) : firstSource ? (
                <button
                  onClick={() => navigate(`/player?url=${encodeURIComponent(firstSource.url)}&title=${encodeURIComponent(series.title)}&label=${encodeURIComponent(firstSource.label)}`)}
                  className="flex items-center gap-2 bg-brand-red hover:bg-red-700 text-white font-bold py-3 px-6 rounded-lg transition-colors"
                >
                  <PlayIcon /> Ver ahora
                </button>
              ) : null}
            </div>
          </div>
        </div>

        {/* Temporadas */}
        {seasonsData.length > 0 && (
          <div className="mt-12">
            <h2 className="text-xl font-bold text-white mb-4">Temporadas</h2>
            <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
              {seasonsData.map(season => (
                <div key={season.season_number} className="flex-shrink-0 w-36 group">
                  <div className="aspect-[2/3] rounded-xl overflow-hidden bg-brand-surface border border-brand-border">
                    {season.poster_url ? (
                      <img src={season.poster_url} alt={season.name} className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center text-gray-500 text-sm font-bold">
                        <span>{season.season_number}</span>
                      </div>
                    )}
                  </div>
                  <p className="mt-1.5 text-xs font-semibold text-gray-200 truncate">{season.name}</p>
                  {season.episode_count && (
                    <p className="text-[10px] text-gray-500">{season.episode_count} episodios</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Reparto */}
        <CastSection cast={castFull} />

        {/* Media + Imágenes */}
        <MediaSection
          videos={allVideos}
          mainTrailerKey={series.yt_trailer_code}
          imdbId={series.imdb_id}
          mediaType="series"
        />

        {/* Reseñas */}
        {reviews.length > 0 && (
          <div className="mt-12">
            <h2 className="text-xl font-bold text-white mb-4">
              Reseñas <span className="ml-2 text-sm font-normal text-gray-500">{reviews.length}</span>
            </h2>
            <div className="flex flex-col gap-4">
              {reviews.map((r, i) => <ReviewCard key={i} review={r} />)}
            </div>
          </div>
        )}

        {/* Recomendaciones desde la BD propia */}
        <RecommendationsSection
          currentId={series.id}
          genres={series.genres ?? []}
          mediaType="series"
          title={series.title}
        />
      </div>
    </div>
  );
}
