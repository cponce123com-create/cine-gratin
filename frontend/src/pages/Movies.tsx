import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Helmet } from "react-helmet-async";
import { getMovies } from "@/lib/api";
import GenreFilter from "@/components/GenreFilter";
import { SkeletonGrid } from "@/components/SkeletonCard";

const FALLBACK_POSTER =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='300' viewBox='0 0 200 300'%3E%3Crect width='200' height='300' fill='%231a1a1a'/%3E%3Ctext x='100' y='150' font-family='sans-serif' font-size='14' fill='%23555' text-anchor='middle' dominant-baseline='middle'%3ESin imagen%3C/text%3E%3C/svg%3E";

export default function Movies() {
  const { data: movies, isLoading: loading, error } = useQuery({
    queryKey: ["movies"],
    queryFn: getMovies,
    staleTime: 5 * 60 * 1000,
  });

  const [search, setSearch] = useState("");
  const [genre, setGenre] = useState("Todos");

  const genres = useMemo(() => {
    const set = new Set<string>();
    (movies ?? []).forEach((m) => m.genres?.forEach((g) => set.add(g)));
    return Array.from(set).sort();
  }, [movies]);

  const filtered = useMemo(() => {
    let list = movies ?? [];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((m) => m.title.toLowerCase().includes(q));
    }
    if (genre !== "Todos") {
      list = list.filter((m) => m.genres?.includes(genre));
    }
    return list;
  }, [movies, search, genre]);

  return (
    <div className="min-h-screen bg-brand-dark pt-20 pb-16">
      <Helmet>
        <title>Películas — Cine Gratín</title>
      </Helmet>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-black text-white mb-2">Películas</h1>
          <p className="text-gray-400 text-sm">
            {movies ? `${filtered.length} de ${movies.length} películas` : "Cargando..."}
          </p>
        </div>

        <div className="mb-8 space-y-4">
          <div className="relative max-w-md">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar película..."
              className="w-full bg-brand-surface border border-brand-border rounded-lg px-4 py-2.5 pl-10 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-gray-500 transition-colors"
            />
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
              <SearchIcon />
            </span>
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
              >
                &times;
              </button>
            )}
          </div>
          <GenreFilter genres={genres} selected={genre} onSelect={setGenre} />
        </div>

        {loading && <SkeletonGrid />}

        {error && (
          <div className="text-center py-20">
            <p className="text-red-400 text-lg">No se pudieron cargar las películas.</p>
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div className="text-center py-20">
            <p className="text-gray-400 text-lg">No hay películas que coincidan.</p>
            <button
              onClick={() => { setSearch(""); setGenre("Todos"); }}
              className="mt-4 text-brand-red hover:text-red-400 text-sm underline"
            >
              Limpiar filtros
            </button>
          </div>
        )}

        {!loading && !error && filtered.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {filtered.map((movie) => (
              <Link key={movie.id} to={`/pelicula/${movie.id}`} className="group block">
                <div className="aspect-[2/3] w-full rounded-lg overflow-hidden bg-brand-surface card-hover">
                  <img
                    src={movie.poster_url || FALLBACK_POSTER}
                    alt={movie.title}
                    loading="lazy"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).src = FALLBACK_POSTER; }}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="mt-2">
                  <p className="text-xs text-gray-300 font-medium truncate group-hover:text-white transition-colors">
                    {movie.title}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {movie.year && <span className="text-xs text-gray-500">{movie.year}</span>}
                    {movie.rating !== undefined && (
                      <span className="text-xs text-brand-gold">&#9733; {Number(movie.rating).toFixed(1)}</span>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SearchIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  );
}
