import { useState, useEffect } from "react";
import { useMovieList } from "@/lib/yts";
import { MovieCard, MovieCardSkeleton, RecentlyWatchedMovie } from "@/components/movie/MovieCard";
import { PageTransition } from "@/components/layout/PageTransition";
import { Filter } from "lucide-react";
import { useLocalStorage } from "@/hooks/use-local-storage";

const GENRES = ["All", "Action", "Adventure", "Animation", "Comedy", "Crime", "Documentary", "Drama", "Family", "Fantasy", "History", "Horror", "Music", "Mystery", "Romance", "Sci-Fi", "Thriller", "War", "Western"];
const GENRES_ES: Record<string, string> = {
  All: "Todos", Action: "Acción", Adventure: "Aventura", Animation: "Animación",
  Comedy: "Comedia", Crime: "Crimen", Documentary: "Documental", Drama: "Drama",
  Family: "Familia", Fantasy: "Fantasía", History: "Historia", Horror: "Terror",
  Music: "Música", Mystery: "Misterio", Romance: "Romance", "Sci-Fi": "Ciencia Ficción",
  Thriller: "Suspenso", War: "Guerra", Western: "Western",
};
const QUALITIES = ["All", "720p", "1080p", "2160p", "3D"];
const RATINGS = [{ label: "Cualquiera", value: "0" }, { label: "5+", value: "5" }, { label: "6+", value: "6" }, { label: "7+", value: "7" }, { label: "8+", value: "8" }, { label: "9+", value: "9" }];
const SORTS = [
  { label: "Recientes", value: "date_added" },
  { label: "Puntuación", value: "rating" },
  { label: "Año", value: "year" },
  { label: "Título", value: "title" },
  { label: "Descargas", value: "download_count" },
  { label: "Me Gusta", value: "like_count" }
];

export default function Browse() {
  const [genre, setGenre] = useState("All");
  const [quality, setQuality] = useState("All");
  const [minimumRating, setMinimumRating] = useState("0");
  const [sortBy, setSortBy] = useState("date_added");
  const [page, setPage] = useState(1);
  
  const [allMovies, setAllMovies] = useState<any[]>([]);
  const [, setRecentMovies] = useLocalStorage<RecentlyWatchedMovie[]>("cv_recently_watched", []);

  // Parse URL search params for initial state if needed
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('genre')) setGenre(params.get('genre')!);
    if (params.get('quality')) setQuality(params.get('quality')!);
    if (params.get('minimum_rating')) setMinimumRating(params.get('minimum_rating')!);
    if (params.get('sort_by')) setSortBy(params.get('sort_by')!);
  }, []);

  const queryParams = {
    genre: genre === "All" ? "" : genre.toLowerCase(),
    quality: quality === "All" ? "" : quality,
    minimum_rating: minimumRating,
    sort_by: sortBy,
    limit: 20,
    page
  };

  const { data, loading, error } = useMovieList(queryParams);

  useEffect(() => {
    // Reset movies when filters change, but not when page changes
    setAllMovies([]);
    setPage(1);
  }, [genre, quality, minimumRating, sortBy]);

  useEffect(() => {
    if (data?.movies) {
      if (page === 1) {
        setAllMovies(data.movies);
      } else {
        setAllMovies(prev => [...prev, ...data.movies]);
      }
    }
  }, [data, page]);

  const handleSaveRecent = (movie: RecentlyWatchedMovie) => {
    setRecentMovies(prev => {
      const filtered = prev.filter(m => m.id !== movie.id);
      return [movie, ...filtered].slice(0, 6);
    });
  };

  const hasMore = data ? (data.movie_count > page * 20) : false;

  return (
    <PageTransition>
      <div className="min-h-screen pt-24 pb-20 px-4 md:px-8 max-w-[1600px] mx-auto">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <h1 className="text-4xl font-heading tracking-wide flex items-center gap-3">
            <span className="w-1.5 h-8 bg-primary block rounded-full"></span>
            Explorar Películas
          </h1>
          
          <div className="w-full md:w-auto bg-card border border-border p-3 rounded-xl shadow-lg flex flex-wrap gap-4 items-center">
            <div className="flex items-center gap-2 text-muted-foreground mr-2">
              <Filter className="w-4 h-4" />
              <span className="text-sm font-bold uppercase tracking-wider hidden lg:inline">Filtros</span>
            </div>
            
            <select 
              value={genre} 
              onChange={(e) => setGenre(e.target.value)}
              className="bg-background border border-border text-sm rounded-lg px-3 py-1.5 focus:border-primary focus:ring-1 focus:ring-primary outline-none"
            >
              {GENRES.map(g => <option key={g} value={g}>{GENRES_ES[g] ?? g}</option>)}
            </select>
            
            <select 
              value={quality} 
              onChange={(e) => setQuality(e.target.value)}
              className="bg-background border border-border text-sm rounded-lg px-3 py-1.5 focus:border-primary focus:ring-1 focus:ring-primary outline-none"
            >
              {QUALITIES.map(q => <option key={q} value={q}>{q === "All" ? "Todos" : q}</option>)}
            </select>
            
            <select 
              value={minimumRating} 
              onChange={(e) => setMinimumRating(e.target.value)}
              className="bg-background border border-border text-sm rounded-lg px-3 py-1.5 focus:border-primary focus:ring-1 focus:ring-primary outline-none"
            >
              {RATINGS.map(r => <option key={r.label} value={r.value}>{r.label === "Cualquiera" ? "Cualquier puntuación" : `${r.label} puntuación`}</option>)}
            </select>
            
            <select 
              value={sortBy} 
              onChange={(e) => setSortBy(e.target.value)}
              className="bg-background border border-border text-sm rounded-lg px-3 py-1.5 focus:border-primary focus:ring-1 focus:ring-primary outline-none"
            >
              {SORTS.map(s => <option key={s.label} value={s.value}>Ordenar: {s.label}</option>)}
            </select>
          </div>
        </div>

        {error && (
          <div className="py-20 text-center">
            <h2 className="text-2xl font-heading text-destructive mb-2">Error al Cargar Películas</h2>
            <p className="text-muted-foreground">{error.message}</p>
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-6">
          {allMovies.map((movie) => (
            <MovieCard key={`${movie.id}-${page}`} movie={movie} onSaveRecent={handleSaveRecent} />
          ))}
          
          {loading && Array.from({ length: page === 1 ? 12 : 6 }).map((_, i) => (
            <MovieCardSkeleton key={`skel-${i}`} />
          ))}
        </div>

        {!loading && allMovies.length === 0 && !error && (
          <div className="py-32 text-center flex flex-col items-center justify-center">
            <div className="w-24 h-24 mb-6 rounded-full bg-card border border-border flex items-center justify-center opacity-50">
              <Filter className="w-10 h-10 text-muted-foreground" />
            </div>
            <h2 className="text-3xl font-heading tracking-widest text-muted-foreground mb-2">No se Encontraron Películas</h2>
            <p className="text-muted-foreground max-w-md mx-auto">
              Intenta ajustar los filtros para encontrar lo que buscas.
            </p>
          </div>
        )}

        {hasMore && !loading && (
          <div className="mt-12 text-center">
            <button
              onClick={() => setPage(p => p + 1)}
              className="bg-card hover:bg-secondary border border-border text-foreground px-8 py-3 rounded-lg font-bold uppercase tracking-widest transition-all hover:border-primary hover:text-primary active:scale-95"
            >
              Cargar Más
            </button>
          </div>
        )}
      </div>
    </PageTransition>
  );
}
