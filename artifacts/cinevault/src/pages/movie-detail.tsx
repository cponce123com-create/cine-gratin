import { useEffect } from "react";
import { useMovieDetails, useMovieSuggestions } from "@/lib/yts";
import { PageTransition } from "@/components/layout/PageTransition";
import { MovieCard, RecentlyWatchedMovie } from "@/components/movie/MovieCard";
import { MovieCarousel } from "@/components/movie/MovieCarousel";
import { Star, Clock, Calendar, Globe, Download, PlayCircle, Info } from "lucide-react";
import { toast } from "sonner";
import { useLocalStorage } from "@/hooks/use-local-storage";

interface MovieDetailProps {
  params: {
    id: string;
  };
}

export default function MovieDetail({ params }: MovieDetailProps) {
  const { data, loading, error } = useMovieDetails(params.id);
  const { data: suggestionsData } = useMovieSuggestions(params.id);
  const [, setRecentMovies] = useLocalStorage<RecentlyWatchedMovie[]>("cv_recently_watched", []);

  useEffect(() => {
    // Scroll to top when component mounts or ID changes
    window.scrollTo(0, 0);
  }, [params.id]);

  if (loading) {
    return (
      <div className="min-h-screen pt-20 flex items-center justify-center">
        <div className="animate-pulse flex flex-col items-center">
          <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
          <p className="mt-4 font-heading tracking-widest text-muted-foreground text-xl">Loading Data...</p>
        </div>
      </div>
    );
  }

  if (error || !data?.movie) {
    return (
      <div className="min-h-screen pt-32 px-4 text-center">
        <h2 className="text-4xl font-heading text-destructive mb-4">Error Loading Movie</h2>
        <p className="text-muted-foreground">The movie could not be found or there was an error connecting to the database.</p>
      </div>
    );
  }

  const { movie } = data;
  const backdropUrl = `https://yts.mx/assets/images/movies/${movie.slug}/background.jpg`;

  const handleDownload = (quality: string) => {
    toast.success(`Opening ${quality} torrent...`, {
      description: "Ensure you have a BitTorrent client installed.",
      icon: <Download className="w-4 h-4 text-primary" />,
    });
  };

  const handleSaveRecent = (m: RecentlyWatchedMovie) => {
    setRecentMovies(prev => {
      const filtered = prev.filter(item => item.id !== m.id);
      return [m, ...filtered].slice(0, 6);
    });
  };

  return (
    <PageTransition>
      <div className="min-h-screen pb-20">
        {/* Backdrop Header */}
        <div className="relative w-full h-[60vh] min-h-[500px]">
          <div className="absolute inset-0 z-0 overflow-hidden">
            <img 
              src={backdropUrl} 
              alt={movie.title}
              className="w-full h-full object-cover blur-sm scale-105 opacity-60"
              onError={(e) => {
                (e.target as HTMLImageElement).src = movie.background_image_original || movie.background_image;
              }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-transparent"></div>
          </div>

          <div className="relative z-10 max-w-6xl mx-auto px-4 md:px-8 h-full flex items-end pb-12">
            <div className="flex flex-col md:flex-row gap-8 items-end md:items-start w-full">
              {/* Poster */}
              <div className="w-48 md:w-64 flex-shrink-0 shadow-[0_0_30px_rgba(0,0,0,0.8)] rounded-xl overflow-hidden border border-white/10 -mt-32 md:-mt-48 relative group">
                <img 
                  src={movie.large_cover_image || movie.medium_cover_image} 
                  alt={movie.title}
                  className="w-full h-auto object-cover"
                />
              </div>

              {/* Info */}
              <div className="flex-1 w-full pb-4">
                <h1 className="text-4xl md:text-6xl font-heading tracking-wide mb-2 drop-shadow-lg text-white">
                  {movie.title}
                </h1>
                
                <div className="flex flex-wrap items-center gap-4 text-sm text-foreground/80 font-medium mb-6">
                  <span className="flex items-center gap-1 bg-white/10 px-2 py-1 rounded backdrop-blur-md">
                    <Calendar className="w-4 h-4" /> {movie.year}
                  </span>
                  <span className="flex items-center gap-1 bg-white/10 px-2 py-1 rounded backdrop-blur-md text-yellow-400">
                    <Star className="w-4 h-4 fill-current" /> {movie.rating}
                  </span>
                  <span className="flex items-center gap-1 bg-white/10 px-2 py-1 rounded backdrop-blur-md">
                    <Clock className="w-4 h-4" /> {Math.floor(movie.runtime / 60)}h {movie.runtime % 60}m
                  </span>
                  <span className="flex items-center gap-1 bg-white/10 px-2 py-1 rounded backdrop-blur-md uppercase">
                    <Globe className="w-4 h-4" /> {movie.language}
                  </span>
                  {movie.mpa_rating && (
                    <span className="border border-white/20 px-2 py-1 rounded text-xs font-bold">
                      {movie.mpa_rating}
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap gap-2 mb-6">
                  {movie.genres?.map(genre => (
                    <span key={genre} className="bg-primary/20 border border-primary/30 text-primary px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest backdrop-blur-sm">
                      {genre}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-4 md:px-8 grid grid-cols-1 lg:grid-cols-3 gap-10 mt-8">
          {/* Left Column: Synopsis & Cast */}
          <div className="lg:col-span-2 space-y-10">
            <section className="bg-card border border-border p-6 md:p-8 rounded-2xl shadow-xl backdrop-blur-md">
              <h2 className="text-2xl font-heading tracking-wide mb-4 flex items-center gap-2 text-primary">
                <Info className="w-5 h-5" />
                Synopsis
              </h2>
              <p className="text-lg leading-relaxed text-muted-foreground">
                {movie.description_full || movie.summary || "No synopsis available."}
              </p>
            </section>

            {/* Video Player */}
            {movie.imdb_code && (
              <section className="bg-card border border-border p-4 rounded-2xl shadow-xl">
                <h2 className="text-2xl font-heading tracking-wide mb-4 flex items-center gap-2 text-primary px-4 pt-2">
                  <PlayCircle className="w-5 h-5" />
                  Watch Online
                </h2>
                <div className="w-full aspect-video rounded-xl overflow-hidden bg-black relative">
                  <iframe 
                    src={`https://vidsrc.net/embed/movie/${movie.imdb_code}`} 
                    width="100%" 
                    height="100%" 
                    allowFullScreen 
                    frameBorder="0" 
                    className="absolute inset-0"
                  ></iframe>
                </div>
              </section>
            )}

            {/* Cast */}
            {movie.cast && movie.cast.length > 0 && (
              <section>
                <h2 className="text-2xl font-heading tracking-wide mb-6">Top Cast</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {movie.cast.map(actor => (
                    <div key={actor.imdb_code} className="flex items-center gap-4 bg-card/50 border border-border p-3 rounded-xl hover:bg-card transition-colors">
                      <div className="w-12 h-12 rounded-full overflow-hidden bg-muted flex-shrink-0">
                        {actor.url_small_image ? (
                          <img src={actor.url_small_image} alt={actor.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-xl font-heading text-muted-foreground">
                            {actor.name.charAt(0)}
                          </div>
                        )}
                      </div>
                      <div>
                        <h3 className="font-bold text-sm text-foreground line-clamp-1">{actor.name}</h3>
                        <p className="text-xs text-muted-foreground line-clamp-1">{actor.character_name}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>

          {/* Right Column: Downloads */}
          <div className="space-y-6">
            <section className="bg-card border border-border p-6 rounded-2xl shadow-xl sticky top-24">
              <h2 className="text-2xl font-heading tracking-wide mb-6 flex items-center gap-2 text-primary">
                <Download className="w-5 h-5" />
                Downloads
              </h2>
              
              {movie.torrents && movie.torrents.length > 0 ? (
                <div className="space-y-3">
                  {movie.torrents.map((torrent, idx) => (
                    <a
                      key={`${torrent.hash}-${idx}`}
                      href={torrent.url}
                      onClick={() => handleDownload(torrent.quality)}
                      className="group flex items-center justify-between bg-background border border-border p-4 rounded-xl hover:border-primary hover:bg-primary/5 transition-all"
                    >
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-bold text-foreground group-hover:text-primary transition-colors">
                            {torrent.quality}
                          </span>
                          <span className="text-[10px] bg-secondary px-2 py-0.5 rounded text-muted-foreground uppercase font-bold tracking-wider">
                            {torrent.type}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {torrent.size} • S: {torrent.seeds} / P: {torrent.peers}
                        </p>
                      </div>
                      <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center group-hover:bg-primary group-hover:text-primary-foreground transition-colors group-hover:scale-110">
                        <Download className="w-4 h-4" />
                      </div>
                    </a>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-center py-4">No downloads available.</p>
              )}
            </section>
          </div>
        </div>

        {/* Similar Movies */}
        {suggestionsData?.movies && suggestionsData.movies.length > 0 && (
          <div className="max-w-[1600px] mx-auto mt-16 border-t border-border pt-8">
            <MovieCarousel title="Similar Movies">
              {suggestionsData.movies.map(m => (
                <div key={m.id} className="w-[160px] md:w-[200px] lg:w-[240px] flex-none">
                  <MovieCard movie={m} onSaveRecent={handleSaveRecent} />
                </div>
              ))}
            </MovieCarousel>
          </div>
        )}
      </div>
    </PageTransition>
  );
}
