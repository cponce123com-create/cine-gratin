import { useParams, useNavigate, Link } from "react-router-dom";
import { getMovie } from "@/lib/api";
import { useFetch } from "@/hooks/useFetch";
import { useMemo } from "react";

const FALLBACK_BG =
  "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=1400&auto=format&fit=crop";
const FALLBACK_POSTER =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='300' viewBox='0 0 200 300'%3E%3Crect width='200' height='300' fill='%231a1a1a'/%3E%3Ctext x='100' y='150' font-family='sans-serif' font-size='14' fill='%23555' text-anchor='middle' dominant-baseline='middle'%3ESin imagen%3C/text%3E%3C/svg%3E";

function isYouTube(url: string) {
  return url.includes("youtube.com") || url.includes("youtu.be");
}

function toEmbedUrl(url: string) {
  if (url.includes("/embed/")) return url;
  const watchMatch = url.match(/[?&]v=([^&]+)/);
  if (watchMatch) return `https://www.youtube.com/embed/${watchMatch[1]}`;
  const shortMatch = url.match(/youtu\.be\/([^?]+)/);
  if (shortMatch) return `https://www.youtube.com/embed/${shortMatch[1]}`;
  return url;
}

export default function MovieDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: movie, loading, error } = useFetch(() => getMovie(id!), [id]);

  const embedUrl = useMemo(() => {
    if (!movie?.trailer_url) return null;
    return toEmbedUrl(movie.trailer_url);
  }, [movie?.trailer_url]);

  const firstSource = movie?.video_sources?.[0];

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
          <p className="text-red-400 text-lg">No se pudo cargar la pelicula.</p>
          <Link to="/peliculas" className="mt-4 inline-block text-brand-red hover:text-red-400 underline">
            Volver a peliculas
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
          src={movie.background_url || movie.poster_url || FALLBACK_BG}
          alt={movie.title}
          className="w-full h-full object-cover object-top"
          onError={(e) => { (e.currentTarget as HTMLImageElement).src = FALLBACK_BG; }}
        />
        <div className="absolute inset-0 hero-gradient" />
        <div className="absolute inset-x-0 bottom-0 h-40 hero-gradient-bottom" />

        {/* Back button */}
        <button
          onClick={() => navigate(-1)}
          className="absolute top-20 left-6 flex items-center gap-2 text-gray-300 hover:text-white text-sm transition-colors"
        >
          <span>&#8592;</span>
          <span>Volver</span>
        </button>
      </div>

      {/* Detail content */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 -mt-24 relative z-10 pb-16">
        <div className="flex flex-col sm:flex-row gap-8">
          {/* Poster */}
          <div className="flex-shrink-0 w-36 sm:w-48 md:w-56">
            <img
              src={movie.poster_url || FALLBACK_POSTER}
              alt={movie.title}
              className="w-full aspect-[2/3] object-cover rounded-xl shadow-2xl border border-brand-border"
              onError={(e) => { (e.currentTarget as HTMLImageElement).src = FALLBACK_POSTER; }}
            />
          </div>

          {/* Info */}
          <div className="flex-1 pt-2 sm:pt-12">
            <h1 className="text-2xl sm:text-4xl font-black text-white mb-3 leading-tight">
              {movie.title}
            </h1>

            {/* Meta */}
            <div className="flex flex-wrap items-center gap-3 mb-4">
              {movie.rating !== undefined && (
                <span className="flex items-center gap-1 text-brand-gold font-bold">
                  <span>&#9733;</span>
                  <span>{Number(movie.rating).toFixed(1)}</span>
                </span>
              )}
              {movie.year && <span className="text-gray-400">{movie.year}</span>}
              {movie.duration_min && (
                <span className="text-gray-400">{movie.duration_min} min</span>
              )}
            </div>

            {/* Genres */}
            {movie.genres && movie.genres.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-5">
                {movie.genres.map((g) => (
                  <span
                    key={g}
                    className="text-xs bg-brand-surface border border-brand-border rounded-full px-3 py-1 text-gray-300"
                  >
                    {g}
                  </span>
                ))}
              </div>
            )}

            {/* Synopsis */}
            {movie.synopsis && (
              <p className="text-gray-300 text-sm sm:text-base leading-relaxed mb-6 max-w-2xl">
                {movie.synopsis}
              </p>
            )}

            {/* Action buttons */}
            <div className="flex flex-wrap gap-3">
              {firstSource && (
                <button
                  onClick={() =>
                    navigate(
                      `/player?url=${encodeURIComponent(firstSource.url)}&title=${encodeURIComponent(movie.title)}&label=${encodeURIComponent(firstSource.label)}`
                    )
                  }
                  className="flex items-center gap-2 bg-brand-red hover:bg-red-700 text-white font-bold py-3 px-6 rounded-lg transition-colors"
                >
                  <PlayIcon />
                  Ver ahora
                </button>
              )}

              {movie.video_sources && movie.video_sources.length > 1 && (
                <div className="flex flex-wrap gap-2">
                  {movie.video_sources.slice(1).map((src, i) => (
                    <button
                      key={i}
                      onClick={() =>
                        navigate(
                          `/player?url=${encodeURIComponent(src.url)}&title=${encodeURIComponent(movie.title)}&label=${encodeURIComponent(src.label)}`
                        )
                      }
                      className="text-sm bg-brand-surface border border-brand-border hover:border-gray-500 text-gray-300 hover:text-white font-medium py-3 px-4 rounded-lg transition-colors"
                    >
                      {src.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* YouTube Trailer */}
        {embedUrl && (
          <div className="mt-12">
            <h2 className="text-xl font-bold text-white mb-4">Trailer</h2>
            <div className="relative aspect-video w-full max-w-3xl rounded-xl overflow-hidden bg-brand-surface shadow-2xl">
              {isYouTube(embedUrl) ? (
                <iframe
                  src={embedUrl}
                  title={`Trailer de ${movie.title}`}
                  className="absolute inset-0 w-full h-full"
                  allowFullScreen
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                />
              ) : (
                <video
                  src={embedUrl}
                  controls
                  className="absolute inset-0 w-full h-full"
                />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function PlayIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}
