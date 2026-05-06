import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Helmet } from "react-helmet-async";
import { getMovie } from "@/lib/api";
import type { CastMember, TmdbVideo, TmdbReview } from "@/lib/types";
import { FALLBACK_BG, FALLBACK_POSTER } from "@/components/detail/constants";
import { CastSection } from "@/components/detail/CastSection";
import { MediaSection, RecommendationsSection } from "@/components/detail/MediaSection";
import { ReviewCard } from "@/components/detail/ReviewCard";

function PlayIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
  );
}

export default function MovieDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: movie, isLoading: loading, error } = useQuery({
    queryKey: ["movie", id],
    queryFn: () => getMovie(id!),
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
  });

  const runtimeMin = movie?.runtime ?? movie?.duration_min ?? null;
  const runtimeLabel = runtimeMin
    ? runtimeMin >= 60 ? `${Math.floor(runtimeMin / 60)}h ${runtimeMin % 60}m` : `${runtimeMin} min`
    : null;

  const firstSource = movie?.video_sources?.[0];
  const ogImage = movie?.background_url || movie?.poster_url || "";
  const allVideos: TmdbVideo[] = movie?.videos ?? [];
  const reviews: TmdbReview[] = movie?.reviews ?? [];
  const castFull: CastMember[] = movie?.cast_full ?? [];

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

  if (error || !movie) {
    return (
      <div className="min-h-screen bg-brand-dark flex items-center justify-center pt-16">
        <div className="text-center">
          <p className="text-red-400 text-lg">No se pudo cargar la película.</p>
          <Link to="/peliculas" className="mt-4 inline-block text-brand-red hover:text-red-400 underline">Volver a películas</Link>
        </div>
      </div>
    );
  }

  const showYear = (movie.year ?? 0) > 0;

  return (
    <div className="min-h-screen bg-brand-dark">
      <Helmet>
        <title>{movie.title}{showYear ? ` (${movie.year})` : ""} — Cine Gratín</title>
        <meta name="description" content={movie.synopsis?.slice(0, 160) ?? ""} />
        <meta property="og:title" content={`${movie.title} — Cine Gratín`} />
        <meta property="og:description" content={movie.synopsis?.slice(0, 200) ?? ""} />
        {ogImage && <meta property="og:image" content={ogImage} />}
        <meta property="og:type" content="video.movie" />
      </Helmet>

      {/* Backdrop */}
      <div className="relative w-full h-[55vh] min-h-[380px] overflow-hidden">
        <img
          src={movie.background_url || movie.poster_url || FALLBACK_BG}
          alt={movie.title}
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
              src={movie.poster_url || FALLBACK_POSTER}
              alt={movie.title}
              className="w-full aspect-[2/3] object-cover rounded-xl shadow-2xl border border-brand-border"
              onError={e => { (e.currentTarget as HTMLImageElement).src = FALLBACK_POSTER; }}
            />
          </div>

          {/* Info */}
          <div className="flex-1 pt-2 sm:pt-12">
            <h1 className="text-2xl sm:text-4xl font-black text-white mb-2 leading-tight">
              {movie.title}
              {showYear && <span className="ml-2 text-lg sm:text-2xl font-normal text-gray-400">({movie.year})</span>}
            </h1>

            <div className="flex flex-wrap items-center gap-3 mb-4">
              {movie.rating !== undefined && Number(movie.rating) > 0 && (
                <span className="flex items-center gap-1 text-brand-gold font-bold">★ {Number(movie.rating).toFixed(1)}</span>
              )}
              {runtimeLabel && <span className="text-gray-400">{runtimeLabel}</span>}
              {movie.mpa_rating && movie.mpa_rating !== "NR" && (
                <span className="text-xs border border-gray-600 text-gray-400 px-1.5 py-0.5 rounded">{movie.mpa_rating}</span>
              )}
            </div>

            {movie.genres && movie.genres.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-5">
                {movie.genres.map(g => (
                  <span key={g} className="text-xs bg-brand-surface border border-brand-border rounded-full px-3 py-1 text-gray-300">{g}</span>
                ))}
              </div>
            )}

            {movie.synopsis && (
              <p className="text-gray-300 text-sm sm:text-base leading-relaxed mb-5 max-w-2xl">{movie.synopsis}</p>
            )}

            {movie.director && (
              <p className="text-gray-400 text-sm mb-5">
                <span className="text-gray-500">Director: </span>{movie.director}
              </p>
            )}

            <div className="flex flex-wrap gap-3">
              {movie.imdb_id ? (
                <button
                  onClick={() => navigate(`/player/movie/${movie.imdb_id}?title=${encodeURIComponent(movie.title)}`)}
                  className="flex items-center gap-2 bg-brand-red hover:bg-red-700 text-white font-bold py-3 px-6 rounded-lg transition-colors"
                >
                  <PlayIcon /> Ver ahora
                </button>
              ) : firstSource ? (
                <button
                  onClick={() => navigate(`/player?url=${encodeURIComponent(firstSource.url)}&title=${encodeURIComponent(movie.title)}&label=${encodeURIComponent(firstSource.label)}`)}
                  className="flex items-center gap-2 bg-brand-red hover:bg-red-700 text-white font-bold py-3 px-6 rounded-lg transition-colors"
                >
                  <PlayIcon /> Ver ahora
                </button>
              ) : null}
            </div>
          </div>
        </div>

        {/* Reparto */}
        <CastSection cast={castFull} />

        {/* Media + Imágenes */}
        <MediaSection
          videos={allVideos}
          mainTrailerKey={movie.yt_trailer_code}
          imdbId={movie.imdb_id}
          mediaType="movie"
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
          currentId={movie.id}
          genres={movie.genres ?? []}
          mediaType="movie"
          title={movie.title}
        />
      </div>
    </div>
  );
}
