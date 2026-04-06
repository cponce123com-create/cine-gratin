import { useState, useEffect, useCallback, useRef } from "react";
import { Link, useLocation } from "wouter";
import { LocalMovie } from "@/lib/admin-db";
import { apiGetMovies, apiGetSettings, apiGetSeries, apiGetTrendingMovies, type LocalSeries } from "@/lib/api-client";
import { MovieCard } from "@/components/movie/MovieCard";
import { MovieCarousel } from "@/components/movie/MovieCarousel";
import { PageTransition } from "@/components/layout/PageTransition";
import { Play, Info, Star, Film, ChevronLeft, ChevronRight, Pause, Tv, Shuffle, X, Calendar, Globe } from "lucide-react";
import { useLocalStorage } from "@/hooks/use-local-storage";

interface WatchedEntry {
  id: string;
  timestamp: number;
}

const SLIDE_INTERVAL = 10000; // 10 seconds

// ─── Series card for home page ────────────────────────────────────────────────
function SeriesCard({ series }: { series: LocalSeries }) {
  const [, setLocation] = useLocation();
  const poster = series.poster_url || "https://placehold.co/400x600/12121a/333333?text=Sin+Poster";
  const statusColors: Record<string, string> = {
    "Returning Series": "bg-green-500/80",
    "Ended": "bg-gray-500/80",
    "Canceled": "bg-red-500/80",
  };
  const statusBadge = statusColors[series.status] ?? "bg-blue-500/80";
  const statusText: Record<string, string> = {
    "Returning Series": "En emisión",
    "Ended": "Finalizada",
    "Canceled": "Cancelada",
  };

  return (
    <button
      onClick={() => setLocation(`/series/${series.id}`)}
      className="group relative block w-full aspect-[2/3] rounded-xl overflow-hidden bg-card border border-border shadow-md transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_0_20px_rgba(0,212,255,0.3)] hover:z-10 text-left"
    >
      <img
        src={poster}
        alt={series.title}
        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
        loading="lazy"
        onError={(e) => { (e.target as HTMLImageElement).src = "https://placehold.co/400x600/12121a/333333?text=Sin+Poster"; }}
      />
      {/* Status badge */}
      {series.status && (
        <div className={`absolute top-2 left-2 text-white text-[9px] font-bold px-1.5 py-0.5 rounded ${statusBadge}`}>
          {statusText[series.status] ?? series.status}
        </div>
      )}
      {/* TV icon badge */}
      <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-sm rounded-md p-1">
        <Tv className="w-3 h-3 text-primary" />
      </div>
      {/* Hover overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-3 gap-1">
        <div className="flex items-center justify-center mb-1">
          <div className="w-10 h-10 rounded-full bg-primary/90 flex items-center justify-center shadow-lg">
            <Play className="w-4 h-4 text-black fill-black ml-0.5" />
          </div>
        </div>
        <p className="text-white font-bold text-xs line-clamp-2 text-center leading-tight">{series.title}</p>
        <div className="flex items-center justify-center gap-2 text-[10px] text-white/70">
          {series.rating > 0 && (
            <span className="flex items-center gap-0.5 text-yellow-400">
              <Star className="w-2.5 h-2.5 fill-current" />{series.rating.toFixed(1)}
            </span>
          )}
          {series.total_seasons > 0 && (
            <span>{series.total_seasons} temp.</span>
          )}
        </div>
      </div>
    </button>
  );
}

export default function Home() {
  const [movies, setMovies] = useState<LocalMovie[]>([]);
  const [series, setSeries] = useState<LocalSeries[]>([]);
  const [trending, setTrending] = useState<LocalMovie[]>([]);
  const [watched, setWatched] = useLocalStorage<WatchedEntry[]>("cv_recently_watched", []);
  const [heroIndex, setHeroIndex] = useState(0);
  const [prevIndex, setPrevIndex] = useState<number | null>(null);
  const [transitioning, setTransitioning] = useState(false);
  const [paused, setPaused] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // "¿Qué veo hoy?" state
  const [randomPick, setRandomPick] = useState<LocalMovie | LocalSeries | null>(null);
  const [randomType, setRandomType] = useState<"movie" | "series">("movie");
  const [, setLocation] = useLocation();

  useEffect(() => {
    apiGetMovies().then(setMovies).catch(() => setMovies([]));
    apiGetSeries().then(setSeries).catch(() => setSeries([]));
    apiGetTrendingMovies().then(setTrending).catch(() => setTrending([]));
    apiGetSettings()
      .then(s => { document.title = `${s.site_name} — Streaming de Películas Premium`; })
      .catch(() => {});
  }, []);

  const pickRandom = () => {
    const allContent: Array<{ item: LocalMovie | LocalSeries; type: "movie" | "series" }> = [
      ...movies.map(m => ({ item: m as LocalMovie | LocalSeries, type: "movie" as const })),
      ...series.map(s => ({ item: s as LocalMovie | LocalSeries, type: "series" as const })),
    ];
    if (allContent.length === 0) return;
    const pick = allContent[Math.floor(Math.random() * allContent.length)];
    setRandomPick(pick.item);
    setRandomType(pick.type);
  };

  // Hero movies: featured first, then top-rated, max 8
  const heroMovies = (() => {
    if (movies.length === 0) return [];
    const featured = movies.filter(m => m.featured);
    const topRated = [...movies]
      .filter(m => !m.featured && m.background_url)
      .sort((a, b) => b.rating - a.rating)
      .slice(0, 8 - featured.length);
    const pool = [...featured, ...topRated].slice(0, 8);
    return pool.length > 0 ? pool : movies.slice(0, 1);
  })();

  const currentHero = heroMovies[heroIndex] ?? null;

  const goTo = useCallback((idx: number) => {
    if (transitioning || idx === heroIndex) return;
    setPrevIndex(heroIndex);
    setTransitioning(true);
    setTimeout(() => {
      setHeroIndex(idx);
      setPrevIndex(null);
      setTransitioning(false);
    }, 600);
  }, [transitioning, heroIndex]);

  const goNext = useCallback(() => {
    if (heroMovies.length <= 1) return;
    goTo((heroIndex + 1) % heroMovies.length);
  }, [heroIndex, heroMovies.length, goTo]);

  const goPrev = useCallback(() => {
    if (heroMovies.length <= 1) return;
    goTo((heroIndex - 1 + heroMovies.length) % heroMovies.length);
  }, [heroIndex, heroMovies.length, goTo]);

  // Auto-advance
  useEffect(() => {
    if (paused || heroMovies.length <= 1) return;
    timerRef.current = setTimeout(goNext, SLIDE_INTERVAL);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [heroIndex, paused, heroMovies.length, goNext]);

  const watchedMovies = watched
    .map(w => movies.find(m => m.id === w.id))
    .filter(Boolean) as LocalMovie[];

  const latestMovies = [...movies].sort(
    (a, b) => new Date(b.date_added || 0).getTime() - new Date(a.date_added || 0).getTime()
  );
  const topRated = [...movies].filter(m => m.rating >= 7).sort((a, b) => b.rating - a.rating);
  const fourK = movies.filter(m => m.torrents?.some(t => t.quality.includes("2160")));

  const handleSaveRecent = (id: string) => {
    setWatched(prev => {
      const f = prev.filter(w => w.id !== id);
      return [{ id, timestamp: Date.now() }, ...f].slice(0, 10);
    });
  };

  return (
    <PageTransition>
      <div className="pb-20">

        {/* === HERO CAROUSEL === */}
        <section
          className="relative w-full h-[75vh] min-h-[600px] overflow-hidden"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
        >
          {heroMovies.length === 0 ? (
            <div className="absolute inset-0 bg-gradient-to-br from-card via-background to-black flex items-center justify-center">
              <div className="text-center z-10 px-4">
                <Film className="w-20 h-20 text-primary/40 mx-auto mb-6" />
                <h2 className="text-3xl font-heading text-muted-foreground mb-3">Aún no hay contenido</h2>
                <p className="text-muted-foreground max-w-md mx-auto">
                  Agrega películas desde el{" "}
                  <Link href="/admin" className="text-primary underline hover:text-primary/80">panel de administración</Link>{" "}
                  para que aparezcan aquí.
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* Slides */}
              {heroMovies.map((movie, i) => {
                const isActive = i === heroIndex;
                const isPrev = i === prevIndex;
                if (!isActive && !isPrev) return null;
                return (
                  <div
                    key={movie.id}
                    className="absolute inset-0 transition-opacity duration-700"
                    style={{ opacity: isActive && !transitioning ? 1 : isActive && transitioning ? 0 : isPrev ? 1 : 0 }}
                  >
                    {/* Background */}
                    {movie.background_url ? (
                      <img
                        src={movie.background_url}
                        alt={movie.title}
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                    ) : (
                      <div className="absolute inset-0 bg-gradient-to-br from-card via-background to-black" />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-background via-background/75 to-black/30" />
                    <div className="absolute inset-0 bg-gradient-to-r from-background via-background/50 to-transparent" />
                  </div>
                );
              })}

              {/* Content of active slide */}
              <div className="absolute inset-0 flex items-end pb-24 pt-32 z-10">
                {currentHero && (
                  <div
                    key={currentHero.id}
                    className="max-w-7xl mx-auto px-6 md:px-10 w-full animate-in fade-in slide-in-from-bottom-6 duration-500"
                  >
                    <div className="max-w-3xl">
                      {currentHero.genres?.length > 0 && (
                        <div className="flex gap-2 mb-4 flex-wrap">
                          {currentHero.genres.slice(0, 3).map(g => (
                            <span key={g} className="bg-primary/20 border border-primary/50 text-primary px-3 py-1 rounded text-xs font-bold uppercase tracking-wider backdrop-blur-sm">
                              {g}
                            </span>
                          ))}
                        </div>
                      )}
                      <h1 className="text-5xl md:text-7xl font-heading text-white mb-4 leading-none tracking-wide drop-shadow-lg line-clamp-2">
                        {currentHero.title}
                      </h1>
                      <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground mb-5 font-medium">
                        <span className="text-white bg-white/10 px-2 py-0.5 rounded backdrop-blur-sm">{currentHero.year}</span>
                        {currentHero.rating > 0 && (
                          <span className="flex items-center gap-1 text-yellow-400 font-bold">
                            <Star className="w-4 h-4 fill-current" />{currentHero.rating}
                          </span>
                        )}
                        {currentHero.runtime > 0 && (
                          <span>{Math.floor(currentHero.runtime / 60)}h {currentHero.runtime % 60}m</span>
                        )}
                        {currentHero.mpa_rating && (
                          <span className="border border-white/30 px-1.5 py-0.5 rounded text-xs font-bold uppercase">{currentHero.mpa_rating}</span>
                        )}
                      </div>
                      {currentHero.synopsis && (
                        <p className="text-base text-foreground/80 line-clamp-3 mb-7 max-w-2xl leading-relaxed">
                          {currentHero.synopsis}
                        </p>
                      )}
                      <div className="flex flex-wrap items-center gap-4">
                        <Link
                          href={`/movie/${currentHero.id}`}
                          onClick={() => handleSaveRecent(currentHero.id)}
                          className="bg-primary hover:bg-primary/90 text-primary-foreground px-8 py-3 rounded-lg font-bold uppercase tracking-widest flex items-center gap-2 transition-all hover:scale-105 active:scale-95 shadow-[0_0_20px_rgba(0,212,255,0.4)]"
                        >
                          <Play className="w-5 h-5 fill-current" />
                          Ver Ahora
                        </Link>
                        <Link
                          href={`/movie/${currentHero.id}`}
                          className="bg-white/10 hover:bg-white/20 text-white border border-white/20 px-8 py-3 rounded-lg font-bold uppercase tracking-widest flex items-center gap-2 backdrop-blur-md transition-all hover:scale-105 active:scale-95"
                        >
                          <Info className="w-5 h-5" />
                          Detalles
                        </Link>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Navigation arrows */}
              {heroMovies.length > 1 && (
                <>
                  <button
                    onClick={goPrev}
                    className="absolute left-4 top-1/2 -translate-y-1/2 z-20 w-11 h-11 rounded-full bg-black/50 hover:bg-black/80 border border-white/10 hover:border-white/30 flex items-center justify-center text-white transition-all hover:scale-110 backdrop-blur-sm"
                    aria-label="Anterior"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <button
                    onClick={goNext}
                    className="absolute right-4 top-1/2 -translate-y-1/2 z-20 w-11 h-11 rounded-full bg-black/50 hover:bg-black/80 border border-white/10 hover:border-white/30 flex items-center justify-center text-white transition-all hover:scale-110 backdrop-blur-sm"
                    aria-label="Siguiente"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </>
              )}

              {/* Dots + progress + pause */}
              {heroMovies.length > 1 && (
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3">
                  {/* Pause button */}
                  <button
                    onClick={() => setPaused(p => !p)}
                    className="w-7 h-7 rounded-full bg-black/50 hover:bg-black/80 border border-white/10 flex items-center justify-center text-white/60 hover:text-white transition-all"
                    title={paused ? "Reanudar" : "Pausar"}
                  >
                    {paused ? <Play className="w-3 h-3 fill-current" /> : <Pause className="w-3 h-3" />}
                  </button>

                  {/* Dots */}
                  {heroMovies.map((m, i) => (
                    <button
                      key={m.id}
                      onClick={() => goTo(i)}
                      className="relative flex items-center justify-center"
                      aria-label={`Ir a ${m.title}`}
                    >
                      <span className={`block rounded-full transition-all duration-300 ${
                        i === heroIndex
                          ? "w-8 h-2.5 bg-primary shadow-[0_0_8px_rgba(0,212,255,0.8)]"
                          : "w-2.5 h-2.5 bg-white/30 hover:bg-white/60"
                      }`} />
                      {/* Progress ring for active dot */}
                      {i === heroIndex && !paused && (
                        <svg
                          className="absolute -inset-1 w-4 h-4 -rotate-90 animate-none hidden"
                          viewBox="0 0 16 16"
                        />
                      )}
                    </button>
                  ))}

                  {/* Counter */}
                  <span className="text-white/40 text-xs font-mono">
                    {heroIndex + 1}/{heroMovies.length}
                  </span>
                </div>
              )}

              {/* Progress bar */}
              {heroMovies.length > 1 && !paused && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/10 z-20">
                  <div
                    key={`${heroIndex}-progress`}
                    className="h-full bg-primary origin-left"
                    style={{
                      animation: `progress-bar ${SLIDE_INTERVAL}ms linear forwards`,
                    }}
                  />
                </div>
              )}

              {/* Thumbnail strip */}
              {heroMovies.length > 1 && (
                <div className="absolute right-4 top-1/2 -translate-y-1/2 z-20 hidden xl:flex flex-col gap-2">
                  {heroMovies.map((m, i) => (
                    <button
                      key={m.id}
                      onClick={() => goTo(i)}
                      className={`relative w-20 h-12 rounded overflow-hidden border-2 transition-all ${
                        i === heroIndex ? "border-primary scale-105 shadow-[0_0_10px_rgba(0,212,255,0.5)]" : "border-white/10 hover:border-white/30 opacity-60 hover:opacity-100"
                      }`}
                    >
                      {m.poster_url ? (
                        <img src={m.poster_url} alt={m.title} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full bg-card flex items-center justify-center">
                          <Film className="w-4 h-4 text-muted-foreground" />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </section>

        {/* === CARRUSELES === */}
        <div className="max-w-[1600px] mx-auto space-y-8 mt-4">
          {watchedMovies.length > 0 && (
            <MovieCarousel title="Seguir Viendo">
              {watchedMovies.map(m => (
                <div key={`recent-${m.id}`} className="w-[160px] md:w-[200px] lg:w-[240px] flex-none">
                  <MovieCard movie={m} isRecent onSaveRecent={() => handleSaveRecent(m.id)} />
                </div>
              ))}
            </MovieCarousel>
          )}

          {/* === "¿Qué veo hoy?" + Trending === */}
          {(movies.length > 0 || series.length > 0) && (
            <div className="flex items-center justify-between mb-2">
              <div />
              <button
                onClick={pickRandom}
                className="flex items-center gap-2 bg-primary/10 hover:bg-primary/20 border border-primary/40 text-primary px-5 py-2.5 rounded-xl font-bold text-sm uppercase tracking-wider transition-all hover:scale-105 active:scale-95 shadow-[0_0_15px_rgba(0,212,255,0.2)]"
              >
                <Shuffle className="w-4 h-4" />
                ¿Qué veo hoy?
              </button>
            </div>
          )}

          {trending.length > 0 && (
            <MovieCarousel title="Tendencias" viewAllLink="/browse?sort=views">
              {trending.map(m => (
                <div key={m.id} className="w-[160px] md:w-[200px] lg:w-[240px] flex-none">
                  <MovieCard movie={m} onSaveRecent={() => handleSaveRecent(m.id)} />
                </div>
              ))}
            </MovieCarousel>
          )}

          {movies.length > 0 && (
            <>
              <MovieCarousel title="Últimas Películas" viewAllLink="/browse">
                {latestMovies.slice(0, 20).map(m => (
                  <div key={m.id} className="w-[160px] md:w-[200px] lg:w-[240px] flex-none">
                    <MovieCard movie={m} onSaveRecent={() => handleSaveRecent(m.id)} />
                  </div>
                ))}
              </MovieCarousel>

              {topRated.length > 0 && (
                <MovieCarousel title="Películas Mejor Calificadas" viewAllLink="/browse?sort=rating">
                  {topRated.slice(0, 20).map(m => (
                    <div key={m.id} className="w-[160px] md:w-[200px] lg:w-[240px] flex-none">
                      <MovieCard movie={m} onSaveRecent={() => handleSaveRecent(m.id)} />
                    </div>
                  ))}
                </MovieCarousel>
              )}

              {fourK.length > 0 && (
                <MovieCarousel title="Ultra HD 4K" viewAllLink="/browse?quality=2160p">
                  {fourK.slice(0, 20).map(m => (
                    <div key={m.id} className="w-[160px] md:w-[200px] lg:w-[240px] flex-none">
                      <MovieCard movie={m} onSaveRecent={() => handleSaveRecent(m.id)} />
                    </div>
                  ))}
                </MovieCarousel>
              )}
            </>
          )}

          {/* === SERIES === */}
          {series.length > 0 && (
            <>
              {series.filter(s => s.featured).length > 0 && (
                <MovieCarousel
                  title="Series Destacadas"
                  viewAllLink="/series"
                  titleIcon={<Tv className="w-5 h-5 text-primary" />}
                >
                  {series.filter(s => s.featured).slice(0, 20).map(s => (
                    <div key={s.id} className="w-[160px] md:w-[200px] lg:w-[240px] flex-none">
                      <SeriesCard series={s} />
                    </div>
                  ))}
                </MovieCarousel>
              )}

              <MovieCarousel
                title="Últimas Series"
                viewAllLink="/series"
                titleIcon={<Tv className="w-5 h-5 text-primary" />}
              >
                {[...series]
                  .sort((a, b) => new Date(b.date_added || 0).getTime() - new Date(a.date_added || 0).getTime())
                  .slice(0, 20)
                  .map(s => (
                    <div key={s.id} className="w-[160px] md:w-[200px] lg:w-[240px] flex-none">
                      <SeriesCard series={s} />
                    </div>
                  ))}
              </MovieCarousel>
            </>
          )}
        </div>
      </div>

      {/* === ¿Qué veo hoy? Modal === */}
      {randomPick && (
        <div
          className="fixed inset-0 z-[150] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setRandomPick(null)}
        >
          <div
            className="relative w-full max-w-lg bg-card border border-border rounded-2xl overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200"
            onClick={e => e.stopPropagation()}
          >
            {/* Backdrop */}
            {(randomPick as LocalMovie).background_url && (
              <div className="absolute inset-0 opacity-10">
                <img src={(randomPick as LocalMovie).background_url} alt="" className="w-full h-full object-cover" />
              </div>
            )}
            <div className="relative z-10 p-6">
              {/* Header */}
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2 text-primary">
                  <Shuffle className="w-5 h-5" />
                  <span className="font-bold text-sm uppercase tracking-wider">Tu Selección Aleatoria</span>
                </div>
                <button onClick={() => setRandomPick(null)} className="text-muted-foreground hover:text-foreground transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Content */}
              <div className="flex gap-4">
                <img
                  src={randomPick.poster_url || "https://placehold.co/200x300/12121a/333?text=Cine"}
                  alt={randomPick.title}
                  className="w-28 h-40 object-cover rounded-xl flex-shrink-0 shadow-lg"
                  onError={e => { (e.target as HTMLImageElement).src = "https://placehold.co/200x300/12121a/333?text=Cine"; }}
                />
                <div className="flex-1 min-w-0">
                  <div className="mb-2">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${randomType === "series" ? "bg-blue-500/20 text-blue-400 border border-blue-500/30" : "bg-primary/20 text-primary border border-primary/30"}`}>
                      {randomType === "series" ? "Serie" : "Película"}
                    </span>
                  </div>
                  <h3 className="text-xl font-heading tracking-wide text-foreground leading-snug mb-2">{randomPick.title}</h3>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground mb-3">
                    {randomPick.year && <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{randomPick.year}</span>}
                    {randomPick.rating > 0 && <span className="flex items-center gap-1 text-yellow-400"><Star className="w-3 h-3 fill-current" />{randomPick.rating.toFixed(1)}</span>}
                    {randomPick.language && <span className="flex items-center gap-1 uppercase"><Globe className="w-3 h-3" />{randomPick.language}</span>}
                    {randomType === "series" && (
                      <span className="flex items-center gap-1"><Tv className="w-3 h-3" />{(randomPick as LocalSeries).total_seasons} temporadas</span>
                    )}
                  </div>
                  {randomPick.synopsis && (
                    <p className="text-muted-foreground text-sm line-clamp-3 leading-relaxed">{randomPick.synopsis}</p>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3 mt-5">
                <button
                  onClick={() => {
                    setRandomPick(null);
                    const path = randomType === "series" ? `/series/${randomPick.id}` : `/movie/${randomPick.id}`;
                    setLocation(path);
                  }}
                  className="flex-1 flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground py-3 rounded-xl font-bold text-sm uppercase tracking-wider transition-all hover:scale-105 active:scale-95"
                >
                  <Play className="w-4 h-4 fill-current" />
                  Ver Ahora
                </button>
                <button
                  onClick={pickRandom}
                  className="flex items-center justify-center gap-2 bg-secondary hover:bg-secondary/80 text-foreground px-4 py-3 rounded-xl font-bold text-sm transition-all"
                  title="Otra sugerencia"
                >
                  <Shuffle className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CSS for progress bar animation */}
      <style>{`
        @keyframes progress-bar {
          from { width: 0%; }
          to { width: 100%; }
        }
      `}</style>
    </PageTransition>
  );
}
