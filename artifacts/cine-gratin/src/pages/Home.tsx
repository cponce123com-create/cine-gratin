import { useFeaturedMovies, useMovies, useSeriesList, useSagas } from "@/hooks/useApi";
import { MediaCard } from "@/components/ui/MediaCard";
import { SagaCard } from "@/components/ui/SagaCard";
import { Link } from "wouter";
import { Play, Info, Layers } from "lucide-react";

function CardSkeleton({ count = 8 }: { count?: number }) {
  return <>{Array.from({ length: count }).map((_, i) => (
    <div key={i} className="flex-none w-40 md:w-48 lg:w-56 aspect-[2/3] rounded-lg bg-muted animate-pulse" />
  ))}</>;
}

function SagaSkeleton({ count = 6 }: { count?: number }) {
  return <>{Array.from({ length: count }).map((_, i) => (
    <div key={i} className="flex-none w-44 md:w-52 lg:w-60 aspect-[2/3] rounded-xl bg-muted animate-pulse" />
  ))}</>;
}

export default function Home() {
  const { data: featured, isLoading: heroLoading } = useFeaturedMovies();
  const { data: movies, isLoading: moviesLoading } = useMovies(1, 20);
  const { data: series, isLoading: seriesLoading } = useSeriesList(1, 20);
  const { data: sagas, isLoading: sagasLoading } = useSagas();

  const featuredMovie = featured?.[0] ?? movies?.find((m) => m.featured) ?? movies?.[0];
  const popularMovies = movies?.filter((m) => m.id !== featuredMovie?.id).slice(0, 12) ?? [];
  const popularSeries = series?.slice(0, 12) ?? [];

  return (
    <div className="pb-20">

      {/* HERO */}
      {heroLoading && moviesLoading ? (
        <div className="relative h-[85vh] w-full bg-muted animate-pulse" />
      ) : featuredMovie ? (
        <div className="relative h-[85vh] w-full bg-black">
          <div className="absolute inset-0">
            <img src={featuredMovie.background_url || featuredMovie.poster_url} alt={featuredMovie.title}
              className="w-full h-full object-cover opacity-60" />
            <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-r from-background via-background/60 to-transparent" />
          </div>
          <div className="absolute bottom-0 left-0 w-full p-8 md:p-16 lg:p-24">
            <div className="max-w-2xl space-y-4 animate-in fade-in slide-in-from-bottom-8 duration-1000">
              <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold text-white drop-shadow-lg leading-tight">
                {featuredMovie.title}
              </h1>
              <div className="flex items-center gap-3 text-sm md:text-base font-medium text-gray-300">
                <span className="text-primary font-bold">{featuredMovie.rating}/10</span>
                <span>•</span><span>{featuredMovie.year}</span>
              </div>
              <p className="text-gray-300 text-lg line-clamp-3 md:line-clamp-4 max-w-xl drop-shadow-md">
                {featuredMovie.synopsis}
              </p>
              <div className="flex flex-wrap items-center gap-4 pt-4">
                <Link href={`/player?url=${encodeURIComponent(featuredMovie.video_sources[0]?.url ?? "")}&title=${encodeURIComponent(featuredMovie.title)}`}
                  className="inline-flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground px-8 py-3 rounded-md font-bold text-lg transition-colors">
                  <Play fill="currentColor" className="w-5 h-5" /> Ver ahora
                </Link>
                <Link href={`/pelicula/${featuredMovie.id}`}
                  className="inline-flex items-center gap-2 bg-white/20 hover:bg-white/30 text-white backdrop-blur-sm px-8 py-3 rounded-md font-semibold text-lg transition-colors">
                  <Info className="w-5 h-5" /> Más info
                </Link>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* FILAS */}
      <div className="container mx-auto px-4 md:px-8 mt-12 space-y-16">

        {/* Películas Populares */}
        <section>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <span className="w-1.5 h-6 bg-primary rounded-full inline-block" />
              Películas Populares
            </h2>
            <Link href="/peliculas" className="text-primary hover:underline text-sm font-medium">Ver todas</Link>
          </div>
          <div className="flex gap-4 overflow-x-auto pb-4 snap-x snap-mandatory hide-scrollbar">
            {moviesLoading ? (
              <CardSkeleton count={8} />
            ) : popularMovies.length === 0 ? (
              <div className="w-full py-12 text-center border-2 border-dashed rounded-xl border-muted">
                <p className="text-muted-foreground">Sin contenido disponible por el momento.</p>
              </div>
            ) : (
              popularMovies.map((movie) => (
                <div key={movie.id} className="flex-none w-40 md:w-48 lg:w-56 snap-start">
                  <MediaCard id={movie.id} title={movie.title} posterUrl={movie.poster_url} year={movie.year} type="movie" />
                </div>
              ))
            )}
          </div>
        </section>

        {/* Series Destacadas */}
        <section>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <span className="w-1.5 h-6 bg-primary rounded-full inline-block" />
              Series Destacadas
            </h2>
            <Link href="/series" className="text-primary hover:underline text-sm font-medium">Ver todas</Link>
          </div>
          <div className="flex gap-4 overflow-x-auto pb-4 snap-x snap-mandatory hide-scrollbar">
            {seriesLoading ? (
              <CardSkeleton count={8} />
            ) : popularSeries.length === 0 ? (
              <div className="w-full py-12 text-center border-2 border-dashed rounded-xl border-muted">
                <p className="text-muted-foreground">Sin contenido disponible por el momento.</p>
              </div>
            ) : (
              popularSeries.map((s) => (
                <div key={s.id} className="flex-none w-40 md:w-48 lg:w-56 snap-start">
                  <MediaCard id={s.id} title={s.title} posterUrl={s.poster_url} year={s.year} type="series" />
                </div>
              ))
            )}
          </div>
        </section>

        {/* Sagas */}
        {(sagasLoading || (sagas && sagas.length > 0)) && (
          <section>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
                <span className="w-1.5 h-6 bg-primary rounded-full inline-block" />
                <Layers className="w-5 h-5 text-primary" />
                Sagas
              </h2>
              <Link href="/sagas" className="text-primary hover:underline text-sm font-medium">Ver todas</Link>
            </div>
            <div className="flex gap-4 overflow-x-auto pb-4 snap-x snap-mandatory hide-scrollbar">
              {sagasLoading ? <SagaSkeleton count={6} /> : sagas!.map((saga) => (
                <SagaCard
                  key={saga.collection_id}
                  collectionId={saga.collection_id}
                  name={saga.collection_name}
                  coverUrl={saga.cover_url}
                  itemCount={saga.item_count}
                />
              ))}
            </div>
          </section>
        )}

      </div>
    </div>
  );
}
