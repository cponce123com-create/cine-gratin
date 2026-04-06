import { useState, useEffect } from "react";
import { Link } from "wouter";
import { useMovieList, Movie, RecentlyWatchedMovie } from "@/lib/yts";
import { MovieCard, MovieCardSkeleton } from "@/components/movie/MovieCard";
import { MovieCarousel } from "@/components/movie/MovieCarousel";
import { PageTransition } from "@/components/layout/PageTransition";
import { Play, Info, Star } from "lucide-react";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { getSettings, getMovies, LocalMovie } from "@/lib/admin-db";

export default function Home() {
  const [recentMovies, setRecentMovies] = useLocalStorage<RecentlyWatchedMovie[]>("cv_recently_watched", []);

  const { data: latestData, loading: latestLoading } = useMovieList({ sort_by: "date_added", limit: 20 });
  const { data: topRatedData, loading: topRatedLoading } = useMovieList({ sort_by: "rating", limit: 20, minimum_rating: 7 });
  const { data: fourKData, loading: fourKLoading } = useMovieList({ quality: "2160p", limit: 20 });

  const [heroMovie, setHeroMovie] = useState<Movie | null>(null);
  const [localMovies, setLocalMovies] = useState<LocalMovie[]>([]);

  // Load local DB movies
  useEffect(() => {
    const settings = getSettings();
    if (settings.show_local_movies) {
      setLocalMovies(getMovies());
    }
  }, []);

  useEffect(() => {
    if (heroMovie) return;

    // Check if admin has set a featured movie
    const settings = getSettings();
    if (settings.featured_movie_id) {
      const featuredLocal = getMovies().find(
        m => m.imdb_id === settings.featured_movie_id || m.id === settings.featured_movie_id
      );
      if (featuredLocal) {
        // Convert local movie to hero-compatible shape
        setHeroMovie({
          id: 0,
          imdb_code: featuredLocal.imdb_id,
          title: featuredLocal.title,
          year: featuredLocal.year,
          rating: featuredLocal.rating,
          runtime: featuredLocal.runtime,
          genres: featuredLocal.genres,
          synopsis: featuredLocal.synopsis,
          summary: featuredLocal.synopsis,
          description_full: featuredLocal.synopsis,
          slug: featuredLocal.slug,
          background_image: featuredLocal.background_url,
          background_image_original: featuredLocal.background_url,
          medium_cover_image: featuredLocal.poster_url,
          large_cover_image: featuredLocal.poster_url,
          small_cover_image: featuredLocal.poster_url,
          language: featuredLocal.language,
          mpa_rating: featuredLocal.mpa_rating,
          yt_trailer_code: featuredLocal.yt_trailer_code,
          torrents: [],
          url: "", title_english: featuredLocal.title, title_long: featuredLocal.title,
          state: "ok", date_uploaded: "", date_uploaded_unix: 0,
        } as unknown as Movie);
        return;
      }
      // Try to find featured in YTS API results
    }

    if (latestData?.movies && latestData.movies.length > 0) {
      // Check for featured movies first
      const featured = localMovies.find(m => m.featured);
      if (featured) return; // handled above via admin fetch
      const randomIdx = Math.floor(Math.random() * Math.min(5, latestData.movies.length));
      setHeroMovie(latestData.movies[randomIdx]);
    }
  }, [latestData, heroMovie, localMovies]);

  const handleSaveRecent = (movie: RecentlyWatchedMovie) => {
    setRecentMovies(prev => {
      const filtered = prev.filter(m => m.id !== movie.id);
      return [{ ...movie, timestamp: Date.now() }, ...filtered].slice(0, 10);
    });
  };

  // Update document title for SEO
  useEffect(() => {
    document.title = "CineVault — Streaming de Películas Premium";
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) {
      metaDesc.setAttribute("content", "Descubre y transmite las últimas películas en HD y 4K. Explora por género, calificación o calidad en CineVault.");
    }
  }, []);

  return (
    <PageTransition>
      <div className="pb-20">
        {/* Hero Section */}
        <section className="relative w-full h-[70vh] min-h-[600px] flex items-end pb-20 pt-32">
          {heroMovie ? (
            <>
              <div className="absolute inset-0 z-0">
                <img
                  src={`https://yts.mx/assets/images/movies/${heroMovie.slug}/background.jpg`}
                  alt={heroMovie.title}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src =
                      heroMovie.background_image_original || heroMovie.background_image;
                  }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-transparent"></div>
                <div className="absolute inset-0 bg-gradient-to-r from-background via-background/60 to-transparent"></div>
              </div>

              <div className="relative z-10 max-w-7xl mx-auto px-6 md:px-10 w-full animate-in fade-in slide-in-from-bottom-8 duration-700">
                <div className="max-w-3xl">
                  {heroMovie.genres && heroMovie.genres.length > 0 && (
                    <div className="flex gap-2 mb-4">
                      {heroMovie.genres.slice(0, 3).map(genre => (
                        <span key={genre} className="bg-primary/20 border border-primary/50 text-primary px-3 py-1 rounded text-xs font-bold uppercase tracking-wider backdrop-blur-sm">
                          {genre}
                        </span>
                      ))}
                    </div>
                  )}

                  <h1 className="text-5xl md:text-7xl font-heading text-white mb-4 leading-none tracking-wide drop-shadow-lg">
                    {heroMovie.title}
                  </h1>

                  <div className="flex items-center gap-4 text-sm text-muted-foreground mb-6 font-medium">
                    <span className="text-white bg-white/10 px-2 py-0.5 rounded backdrop-blur-sm">{heroMovie.year}</span>
                    <span className="flex items-center gap-1 text-yellow-400">
                      <Star className="w-4 h-4 fill-current" />
                      {heroMovie.rating}
                    </span>
                    {heroMovie.runtime > 0 && (
                      <span>{Math.floor(heroMovie.runtime / 60)}h {heroMovie.runtime % 60}m</span>
                    )}
                  </div>

                  <p className="text-lg text-foreground/80 line-clamp-3 mb-8 max-w-2xl leading-relaxed">
                    {heroMovie.synopsis || heroMovie.summary}
                  </p>

                  <div className="flex flex-wrap items-center gap-4">
                    <Link
                      href={`/movie/${heroMovie.id}`}
                      className="bg-primary hover:bg-primary/90 text-primary-foreground px-8 py-3 rounded-lg font-bold uppercase tracking-widest flex items-center gap-2 transition-all hover:scale-105 active:scale-95 shadow-[0_0_20px_rgba(0,212,255,0.4)]"
                      onClick={() =>
                        handleSaveRecent({
                          id: heroMovie.id,
                          slug: heroMovie.slug,
                          title: heroMovie.title,
                          year: heroMovie.year,
                          rating: heroMovie.rating,
                          medium_cover_image: heroMovie.medium_cover_image,
                          timestamp: Date.now(),
                        })
                      }
                    >
                      <Play className="w-5 h-5 fill-current" />
                      Ver Ahora
                    </Link>
                    <Link
                      href={`/movie/${heroMovie.id}`}
                      className="bg-white/10 hover:bg-white/20 text-white border border-white/20 px-8 py-3 rounded-lg font-bold uppercase tracking-widest flex items-center gap-2 backdrop-blur-md transition-all hover:scale-105 active:scale-95"
                    >
                      <Info className="w-5 h-5" />
                      Detalles
                    </Link>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="absolute inset-0 z-0 bg-gradient-to-br from-card to-background animate-pulse"></div>
          )}
        </section>

        <div className="max-w-[1600px] mx-auto space-y-8">
          {/* Recently Watched */}
          {recentMovies.length > 0 && (
            <MovieCarousel title="Seguir Viendo">
              {recentMovies.map(movie => (
                <div key={`recent-${movie.id}`} className="w-[160px] md:w-[200px] lg:w-[240px] flex-none">
                  <MovieCard movie={movie} isRecent />
                </div>
              ))}
            </MovieCarousel>
          )}

          {/* Latest Movies */}
          <MovieCarousel title="Últimas Incorporaciones" viewAllLink="/browse?sort_by=date_added">
            {latestLoading
              ? Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="w-[160px] md:w-[200px] lg:w-[240px] flex-none">
                    <MovieCardSkeleton />
                  </div>
                ))
              : latestData?.movies?.map(movie => (
                  <div key={movie.id} className="w-[160px] md:w-[200px] lg:w-[240px] flex-none">
                    <MovieCard movie={movie} onSaveRecent={handleSaveRecent} />
                  </div>
                ))}
          </MovieCarousel>

          {/* Top Rated */}
          <MovieCarousel title="Aclamadas por la Crítica" viewAllLink="/browse?sort_by=rating&minimum_rating=7">
            {topRatedLoading
              ? Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="w-[160px] md:w-[200px] lg:w-[240px] flex-none">
                    <MovieCardSkeleton />
                  </div>
                ))
              : topRatedData?.movies?.map(movie => (
                  <div key={movie.id} className="w-[160px] md:w-[200px] lg:w-[240px] flex-none">
                    <MovieCard movie={movie} onSaveRecent={handleSaveRecent} />
                  </div>
                ))}
          </MovieCarousel>

          {/* 4K Movies */}
          <MovieCarousel title="Ultra HD 4K" viewAllLink="/browse?quality=2160p">

            {fourKLoading
              ? Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="w-[160px] md:w-[200px] lg:w-[240px] flex-none">
                    <MovieCardSkeleton />
                  </div>
                ))
              : fourKData?.movies?.map(movie => (
                  <div key={movie.id} className="w-[160px] md:w-[200px] lg:w-[240px] flex-none">
                    <MovieCard movie={movie} onSaveRecent={handleSaveRecent} />
                  </div>
                ))}
          </MovieCarousel>
        </div>
      </div>
    </PageTransition>
  );
}
