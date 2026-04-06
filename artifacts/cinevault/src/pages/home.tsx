import { useState, useEffect } from "react";
import { Link } from "wouter";
import { LocalMovie } from "@/lib/admin-db";
import { apiGetMovies, apiGetSettings } from "@/lib/api-client";
import { MovieCard } from "@/components/movie/MovieCard";
import { MovieCarousel } from "@/components/movie/MovieCarousel";
import { PageTransition } from "@/components/layout/PageTransition";
import { Play, Info, Star, Film } from "lucide-react";
import { useLocalStorage } from "@/hooks/use-local-storage";

interface WatchedEntry {
  id: string;
  timestamp: number;
}

export default function Home() {
  const [movies, setMovies] = useState<LocalMovie[]>([]);
  const [watched, setWatched] = useLocalStorage<WatchedEntry[]>("cv_recently_watched", []);

  useEffect(() => {
    apiGetMovies().then(setMovies).catch(() => setMovies([]));
    apiGetSettings()
      .then(s => { document.title = `${s.site_name} — Streaming de Películas Premium`; })
      .catch(() => {});
  }, []);

  const heroMovie =
    movies.find((m) => m.featured) || (movies.length > 0 ? movies[0] : null);

  const watchedMovies = watched
    .map((w) => movies.find((m) => m.id === w.id))
    .filter(Boolean) as LocalMovie[];

  const latestMovies = [...movies].sort(
    (a, b) =>
      new Date(b.date_added || 0).getTime() -
      new Date(a.date_added || 0).getTime()
  );
  const topRated = [...movies]
    .filter((m) => m.rating >= 7)
    .sort((a, b) => b.rating - a.rating);
  const fourK = movies.filter((m) =>
    m.torrents?.some((t) => t.quality.includes("2160"))
  );

  const handleSaveRecent = (id: string) => {
    setWatched((prev) => {
      const filtered = prev.filter((w) => w.id !== id);
      return [{ id, timestamp: Date.now() }, ...filtered].slice(0, 10);
    });
  };

  return (
    <PageTransition>
      <div className="pb-20">
        {/* === HERO === */}
        <section className="relative w-full h-[70vh] min-h-[600px] flex items-end pb-20 pt-32">
          {heroMovie ? (
            <>
              <div className="absolute inset-0 z-0">
                {heroMovie.background_url ? (
                  <img
                    src={heroMovie.background_url}
                    alt={heroMovie.title}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-card via-background to-black" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-transparent" />
                <div className="absolute inset-0 bg-gradient-to-r from-background via-background/60 to-transparent" />
              </div>

              <div className="relative z-10 max-w-7xl mx-auto px-6 md:px-10 w-full animate-in fade-in slide-in-from-bottom-8 duration-700">
                <div className="max-w-3xl">
                  {heroMovie.genres?.length > 0 && (
                    <div className="flex gap-2 mb-4">
                      {heroMovie.genres.slice(0, 3).map((g) => (
                        <span
                          key={g}
                          className="bg-primary/20 border border-primary/50 text-primary px-3 py-1 rounded text-xs font-bold uppercase tracking-wider backdrop-blur-sm"
                        >
                          {g}
                        </span>
                      ))}
                    </div>
                  )}
                  <h1 className="text-5xl md:text-7xl font-heading text-white mb-4 leading-none tracking-wide drop-shadow-lg">
                    {heroMovie.title}
                  </h1>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground mb-6 font-medium">
                    <span className="text-white bg-white/10 px-2 py-0.5 rounded backdrop-blur-sm">
                      {heroMovie.year}
                    </span>
                    {heroMovie.rating > 0 && (
                      <span className="flex items-center gap-1 text-yellow-400">
                        <Star className="w-4 h-4 fill-current" />
                        {heroMovie.rating}
                      </span>
                    )}
                    {heroMovie.runtime > 0 && (
                      <span>
                        {Math.floor(heroMovie.runtime / 60)}h{" "}
                        {heroMovie.runtime % 60}m
                      </span>
                    )}
                    {heroMovie.mpa_rating && (
                      <span className="border border-white/30 px-1.5 py-0.5 rounded text-xs font-bold uppercase">
                        {heroMovie.mpa_rating}
                      </span>
                    )}
                  </div>
                  {heroMovie.synopsis && (
                    <p className="text-lg text-foreground/80 line-clamp-3 mb-8 max-w-2xl leading-relaxed">
                      {heroMovie.synopsis}
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-4">
                    <Link
                      href={`/movie/${heroMovie.id}`}
                      onClick={() => handleSaveRecent(heroMovie.id)}
                      className="bg-primary hover:bg-primary/90 text-primary-foreground px-8 py-3 rounded-lg font-bold uppercase tracking-widest flex items-center gap-2 transition-all hover:scale-105 active:scale-95 shadow-[0_0_20px_rgba(0,212,255,0.4)]"
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
            <div className="absolute inset-0 bg-gradient-to-br from-card via-background to-black flex items-center justify-center">
              <div className="text-center z-10 px-4">
                <Film className="w-20 h-20 text-primary/40 mx-auto mb-6" />
                <h2 className="text-3xl font-heading text-muted-foreground mb-3">
                  Aún no hay contenido
                </h2>
                <p className="text-muted-foreground max-w-md mx-auto">
                  Agrega películas desde el{" "}
                  <Link href="/admin" className="text-primary underline hover:text-primary/80">
                    panel de administración
                  </Link>{" "}
                  para que aparezcan aquí.
                </p>
              </div>
            </div>
          )}
        </section>

        {/* === CARRUSELES === */}
        <div className="max-w-[1600px] mx-auto space-y-8">
          {watchedMovies.length > 0 && (
            <MovieCarousel title="Seguir Viendo">
              {watchedMovies.map((m) => (
                <div
                  key={`recent-${m.id}`}
                  className="w-[160px] md:w-[200px] lg:w-[240px] flex-none"
                >
                  <MovieCard
                    movie={m}
                    isRecent
                    onSaveRecent={() => handleSaveRecent(m.id)}
                  />
                </div>
              ))}
            </MovieCarousel>
          )}

          {movies.length > 0 && (
            <>
              <MovieCarousel
                title="Últimas Incorporaciones"
                viewAllLink="/browse"
              >
                {latestMovies.slice(0, 20).map((m) => (
                  <div
                    key={m.id}
                    className="w-[160px] md:w-[200px] lg:w-[240px] flex-none"
                  >
                    <MovieCard
                      movie={m}
                      onSaveRecent={() => handleSaveRecent(m.id)}
                    />
                  </div>
                ))}
              </MovieCarousel>

              {topRated.length > 0 && (
                <MovieCarousel
                  title="Mejor Calificadas"
                  viewAllLink="/browse?sort=rating"
                >
                  {topRated.slice(0, 20).map((m) => (
                    <div
                      key={m.id}
                      className="w-[160px] md:w-[200px] lg:w-[240px] flex-none"
                    >
                      <MovieCard
                        movie={m}
                        onSaveRecent={() => handleSaveRecent(m.id)}
                      />
                    </div>
                  ))}
                </MovieCarousel>
              )}

              {fourK.length > 0 && (
                <MovieCarousel title="Ultra HD 4K" viewAllLink="/browse?quality=2160p">
                  {fourK.slice(0, 20).map((m) => (
                    <div
                      key={m.id}
                      className="w-[160px] md:w-[200px] lg:w-[240px] flex-none"
                    >
                      <MovieCard
                        movie={m}
                        onSaveRecent={() => handleSaveRecent(m.id)}
                      />
                    </div>
                  ))}
                </MovieCarousel>
              )}
            </>
          )}
        </div>
      </div>
    </PageTransition>
  );
}
