import { useState, useEffect } from "react";
import { Link } from "wouter";
import { useMovieList, Movie } from "@/lib/yts";
import { MovieCard, MovieCardSkeleton, RecentlyWatchedMovie } from "@/components/movie/MovieCard";
import { MovieCarousel } from "@/components/movie/MovieCarousel";
import { PageTransition } from "@/components/layout/PageTransition";
import { Play, Info, Star } from "lucide-react";
import { useLocalStorage } from "@/hooks/use-local-storage";

export default function Home() {
  const [recentMovies, setRecentMovies] = useLocalStorage<RecentlyWatchedMovie[]>("cv_recently_watched", []);
  
  // Fetch latest for hero
  const { data: latestData, loading: latestLoading } = useMovieList({ sort_by: "date_added", limit: 20 });
  const { data: topRatedData, loading: topRatedLoading } = useMovieList({ sort_by: "rating", limit: 20, minimum_rating: 7 });
  const { data: fourKData, loading: fourKLoading } = useMovieList({ quality: "2160p", limit: 20 });

  const [heroMovie, setHeroMovie] = useState<Movie | null>(null);

  useEffect(() => {
    if (latestData?.movies && latestData.movies.length > 0 && !heroMovie) {
      // Pick a random movie from latest 5 for the hero
      const randomIdx = Math.floor(Math.random() * Math.min(5, latestData.movies.length));
      setHeroMovie(latestData.movies[randomIdx]);
    }
  }, [latestData, heroMovie]);

  const handleSaveRecent = (movie: RecentlyWatchedMovie) => {
    setRecentMovies(prev => {
      const filtered = prev.filter(m => m.id !== movie.id);
      return [movie, ...filtered].slice(0, 6);
    });
  };

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
                    (e.target as HTMLImageElement).src = heroMovie.background_image_original || heroMovie.background_image;
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
                      onClick={() => handleSaveRecent({
                        id: heroMovie.id,
                        slug: heroMovie.slug,
                        title: heroMovie.title,
                        year: heroMovie.year,
                        rating: heroMovie.rating,
                        medium_cover_image: heroMovie.medium_cover_image
                      })}
                    >
                      <Play className="w-5 h-5 fill-current" />
                      Watch Now
                    </Link>
                    <Link 
                      href={`/movie/${heroMovie.id}`}
                      className="bg-white/10 hover:bg-white/20 text-white border border-white/20 px-8 py-3 rounded-lg font-bold uppercase tracking-widest flex items-center gap-2 backdrop-blur-md transition-all hover:scale-105 active:scale-95"
                    >
                      <Info className="w-5 h-5" />
                      Details
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
            <MovieCarousel title="Recently Watched">
              {recentMovies.map(movie => (
                <div key={`recent-${movie.id}`} className="w-[160px] md:w-[200px] lg:w-[240px] flex-none">
                  <MovieCard movie={movie} />
                </div>
              ))}
            </MovieCarousel>
          )}

          {/* Latest Movies */}
          <MovieCarousel title="Latest Additions" viewAllLink="/browse?sort_by=date_added">
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
                ))
            }
          </MovieCarousel>

          {/* Top Rated */}
          <MovieCarousel title="Critically Acclaimed" viewAllLink="/browse?sort_by=rating&minimum_rating=7">
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
                ))
            }
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
                ))
            }
          </MovieCarousel>
        </div>
      </div>
    </PageTransition>
  );
}
