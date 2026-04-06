import { useState, useEffect, useMemo } from "react";
import { getMovies, LocalMovie } from "@/lib/admin-db";
import { MovieCard } from "@/components/movie/MovieCard";
import { MovieCardSkeleton } from "@/components/movie/MovieCard";
import { PageTransition } from "@/components/layout/PageTransition";
import { Filter, Film } from "lucide-react";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { Link } from "wouter";

interface WatchedEntry {
  id: string;
  timestamp: number;
}

const RATINGS = [
  { label: "Cualquier puntuación", value: "0" },
  { label: "5+ puntuación", value: "5" },
  { label: "6+ puntuación", value: "6" },
  { label: "7+ puntuación", value: "7" },
  { label: "8+ puntuación", value: "8" },
  { label: "9+ puntuación", value: "9" },
];

const SORTS = [
  { label: "Recientes", value: "date_added" },
  { label: "Puntuación", value: "rating" },
  { label: "Año", value: "year" },
  { label: "Título", value: "title" },
];

export default function Browse() {
  const [allMovies, setAllMovies] = useState<LocalMovie[]>([]);
  const [loading, setLoading] = useState(true);
  const [, setWatched] = useLocalStorage<WatchedEntry[]>("cv_recently_watched", []);

  const [genre, setGenre] = useState("Todos");
  const [minimumRating, setMinimumRating] = useState("0");
  const [sortBy, setSortBy] = useState("date_added");
  const [search, setSearch] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("sort")) setSortBy(params.get("sort")!);
    if (params.get("sort_by")) setSortBy(params.get("sort_by")!);
    if (params.get("genre")) setGenre(params.get("genre")!);
  }, []);

  useEffect(() => {
    const movies = getMovies();
    setAllMovies(movies);
    setLoading(false);
  }, []);

  const genres = useMemo(() => {
    const set = new Set<string>();
    allMovies.forEach((m) => m.genres?.forEach((g) => set.add(g)));
    return ["Todos", ...Array.from(set).sort()];
  }, [allMovies]);

  const filtered = useMemo(() => {
    let list = [...allMovies];

    if (genre !== "Todos") {
      list = list.filter((m) =>
        m.genres?.some((g) => g.toLowerCase() === genre.toLowerCase())
      );
    }

    if (minimumRating !== "0") {
      list = list.filter((m) => m.rating >= Number(minimumRating));
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (m) =>
          m.title.toLowerCase().includes(q) ||
          m.genres?.some((g) => g.toLowerCase().includes(q)) ||
          String(m.year).includes(q)
      );
    }

    list.sort((a, b) => {
      if (sortBy === "date_added")
        return (
          new Date(b.date_added || 0).getTime() -
          new Date(a.date_added || 0).getTime()
        );
      if (sortBy === "rating") return b.rating - a.rating;
      if (sortBy === "year") return b.year - a.year;
      if (sortBy === "title") return a.title.localeCompare(b.title);
      return 0;
    });

    return list;
  }, [allMovies, genre, minimumRating, sortBy, search]);

  const handleSaveRecent = (id: string) => {
    setWatched((prev) => {
      const filtered = prev.filter((w) => w.id !== id);
      return [{ id, timestamp: Date.now() }, ...filtered].slice(0, 10);
    });
  };

  return (
    <PageTransition>
      <div className="min-h-screen pt-24 pb-20 px-4 md:px-8 max-w-[1600px] mx-auto">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <h1 className="text-4xl font-heading tracking-wide flex items-center gap-3">
            <span className="w-1.5 h-8 bg-primary block rounded-full" />
            Explorar Películas
          </h1>

          <div className="w-full md:w-auto bg-card border border-border p-3 rounded-xl shadow-lg flex flex-wrap gap-3 items-center">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Filter className="w-4 h-4" />
              <span className="text-sm font-bold uppercase tracking-wider hidden lg:inline">
                Filtros
              </span>
            </div>

            <input
              type="text"
              placeholder="Buscar por título..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-background border border-border text-sm rounded-lg px-3 py-1.5 focus:border-primary focus:ring-1 focus:ring-primary outline-none w-40"
            />

            <select
              value={genre}
              onChange={(e) => setGenre(e.target.value)}
              className="bg-background border border-border text-sm rounded-lg px-3 py-1.5 focus:border-primary outline-none"
            >
              {genres.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>

            <select
              value={minimumRating}
              onChange={(e) => setMinimumRating(e.target.value)}
              className="bg-background border border-border text-sm rounded-lg px-3 py-1.5 focus:border-primary outline-none"
            >
              {RATINGS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="bg-background border border-border text-sm rounded-lg px-3 py-1.5 focus:border-primary outline-none"
            >
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  Ordenar: {s.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Películas */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-6">
          {loading
            ? Array.from({ length: 12 }).map((_, i) => (
                <MovieCardSkeleton key={i} />
              ))
            : filtered.map((movie) => (
                <MovieCard
                  key={movie.id}
                  movie={movie}
                  onSaveRecent={() => handleSaveRecent(movie.id)}
                />
              ))}
        </div>

        {/* Empty states */}
        {!loading && allMovies.length === 0 && (
          <div className="py-32 text-center flex flex-col items-center justify-center">
            <Film className="w-16 h-16 text-muted-foreground/30 mb-6" />
            <h2 className="text-3xl font-heading tracking-widest text-muted-foreground mb-3">
              Sin Contenido
            </h2>
            <p className="text-muted-foreground max-w-md mx-auto">
              Agrega películas desde el{" "}
              <Link href="/admin" className="text-primary underline">
                panel de administración
              </Link>{" "}
              para que aparezcan aquí.
            </p>
          </div>
        )}

        {!loading && allMovies.length > 0 && filtered.length === 0 && (
          <div className="py-32 text-center flex flex-col items-center justify-center">
            <div className="w-24 h-24 mb-6 rounded-full bg-card border border-border flex items-center justify-center opacity-50">
              <Filter className="w-10 h-10 text-muted-foreground" />
            </div>
            <h2 className="text-3xl font-heading tracking-widest text-muted-foreground mb-2">
              No se Encontraron Películas
            </h2>
            <p className="text-muted-foreground max-w-md mx-auto">
              Intenta ajustar los filtros para encontrar lo que buscas.
            </p>
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <p className="text-center text-muted-foreground text-sm mt-10">
            {filtered.length} película{filtered.length !== 1 ? "s" : ""}{" "}
            encontrada{filtered.length !== 1 ? "s" : ""}
          </p>
        )}
      </div>
    </PageTransition>
  );
}
