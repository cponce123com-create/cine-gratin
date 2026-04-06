import { useState, useEffect, useMemo } from "react";
import { LocalMovie } from "@/lib/admin-db";
import { apiGetMovies } from "@/lib/api-client";
import { MovieCard } from "@/components/movie/MovieCard";
import { MovieCardSkeleton } from "@/components/movie/MovieCard";
import { PageTransition } from "@/components/layout/PageTransition";
import { Filter, Film, X, SlidersHorizontal, ChevronDown } from "lucide-react";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { Link } from "wouter";

interface WatchedEntry {
  id: string;
  timestamp: number;
}

const SORTS = [
  { label: "Recientes", value: "date_added" },
  { label: "Mejor Puntuación", value: "rating" },
  { label: "Año (nuevo → viejo)", value: "year_desc" },
  { label: "Año (viejo → nuevo)", value: "year_asc" },
  { label: "Título A–Z", value: "title" },
  { label: "Más Vistas", value: "views" },
];

export default function Browse() {
  const [allMovies, setAllMovies] = useState<LocalMovie[]>([]);
  const [loading, setLoading] = useState(true);
  const [, setWatched] = useLocalStorage<WatchedEntry[]>("cv_recently_watched", []);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [genre, setGenre] = useState("Todos");
  const [year, setYear] = useState("Todos");
  const [minRating, setMinRating] = useState(0);
  const [sortBy, setSortBy] = useState("date_added");
  const [search, setSearch] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("sort") || params.get("sort_by")) setSortBy(params.get("sort") || params.get("sort_by") || "date_added");
    if (params.get("genre")) setGenre(params.get("genre")!);
    if (params.get("year")) setYear(params.get("year")!);
  }, []);

  useEffect(() => {
    apiGetMovies()
      .then(movies => { setAllMovies(movies); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const genres = useMemo(() => {
    const set = new Set<string>();
    allMovies.forEach(m => m.genres?.forEach(g => set.add(g)));
    return ["Todos", ...Array.from(set).sort()];
  }, [allMovies]);

  const years = useMemo(() => {
    const set = new Set<number>();
    allMovies.forEach(m => { if (m.year) set.add(m.year); });
    return ["Todos", ...Array.from(set).sort((a, b) => b - a).map(String)];
  }, [allMovies]);

  const filtered = useMemo(() => {
    let list = [...allMovies];

    if (genre !== "Todos") list = list.filter(m => m.genres?.some(g => g.toLowerCase() === genre.toLowerCase()));
    if (year !== "Todos") list = list.filter(m => String(m.year) === year);
    if (minRating > 0) list = list.filter(m => m.rating >= minRating);

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(m =>
        m.title.toLowerCase().includes(q) ||
        m.genres?.some(g => g.toLowerCase().includes(q)) ||
        String(m.year).includes(q) ||
        m.director?.toLowerCase().includes(q)
      );
    }

    list.sort((a, b) => {
      if (sortBy === "date_added") return new Date(b.date_added || 0).getTime() - new Date(a.date_added || 0).getTime();
      if (sortBy === "rating") return b.rating - a.rating;
      if (sortBy === "year_desc") return b.year - a.year;
      if (sortBy === "year_asc") return a.year - b.year;
      if (sortBy === "title") return a.title.localeCompare(b.title);
      if (sortBy === "views") return (b.views || 0) - (a.views || 0);
      return 0;
    });

    return list;
  }, [allMovies, genre, year, minRating, sortBy, search]);

  const activeFiltersCount = [
    genre !== "Todos",
    year !== "Todos",
    minRating > 0,
    search.trim() !== "",
  ].filter(Boolean).length;

  const clearFilters = () => {
    setGenre("Todos");
    setYear("Todos");
    setMinRating(0);
    setSearch("");
    setSortBy("date_added");
  };

  const handleSaveRecent = (id: string) => {
    setWatched(prev => {
      const filtered = prev.filter(w => w.id !== id);
      return [{ id, timestamp: Date.now() }, ...filtered].slice(0, 10);
    });
  };

  return (
    <PageTransition>
      <div className="min-h-screen pt-24 pb-20 px-4 md:px-8 max-w-[1600px] mx-auto">

        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
          <div>
            <h1 className="text-4xl font-heading tracking-wide flex items-center gap-3">
              <span className="w-1.5 h-8 bg-primary block rounded-full" />
              Explorar Películas
            </h1>
            {!loading && (
              <p className="text-muted-foreground text-sm mt-1 ml-[18px]">
                {filtered.length} de {allMovies.length} películas
                {activeFiltersCount > 0 && <span className="text-primary ml-1">· {activeFiltersCount} filtro{activeFiltersCount !== 1 ? "s" : ""} activo{activeFiltersCount !== 1 ? "s" : ""}</span>}
              </p>
            )}
          </div>

          <button
            onClick={() => setFiltersOpen(o => !o)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-bold transition-all ${
              filtersOpen || activeFiltersCount > 0
                ? "bg-primary/10 border-primary/40 text-primary"
                : "bg-card border-border text-muted-foreground hover:text-foreground hover:border-primary/30"
            }`}
          >
            <SlidersHorizontal className="w-4 h-4" />
            Filtros y Orden
            {activeFiltersCount > 0 && (
              <span className="bg-primary text-primary-foreground text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                {activeFiltersCount}
              </span>
            )}
            <ChevronDown className={`w-4 h-4 transition-transform ${filtersOpen ? "rotate-180" : ""}`} />
          </button>
        </div>

        {/* Filter panel */}
        {filtersOpen && (
          <div className="bg-card border border-border rounded-2xl p-5 mb-6 shadow-xl animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

              {/* Search */}
              <div className="lg:col-span-2">
                <label className="block text-muted-foreground text-xs font-bold uppercase tracking-wider mb-2">Buscar</label>
                <input
                  type="text"
                  placeholder="Título, director, género..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full bg-background border border-border text-sm rounded-lg px-3 py-2.5 focus:border-primary focus:ring-1 focus:ring-primary outline-none placeholder:text-muted-foreground/50"
                />
              </div>

              {/* Ordenar */}
              <div>
                <label className="block text-muted-foreground text-xs font-bold uppercase tracking-wider mb-2">Ordenar por</label>
                <select
                  value={sortBy}
                  onChange={e => setSortBy(e.target.value)}
                  className="w-full bg-background border border-border text-sm rounded-lg px-3 py-2.5 focus:border-primary outline-none"
                >
                  {SORTS.map(s => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>

              {/* Género */}
              <div>
                <label className="block text-muted-foreground text-xs font-bold uppercase tracking-wider mb-2">Género</label>
                <select
                  value={genre}
                  onChange={e => setGenre(e.target.value)}
                  className="w-full bg-background border border-border text-sm rounded-lg px-3 py-2.5 focus:border-primary outline-none"
                >
                  {genres.map(g => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              </div>

              {/* Año */}
              <div>
                <label className="block text-muted-foreground text-xs font-bold uppercase tracking-wider mb-2">Año</label>
                <select
                  value={year}
                  onChange={e => setYear(e.target.value)}
                  className="w-full bg-background border border-border text-sm rounded-lg px-3 py-2.5 focus:border-primary outline-none"
                >
                  {years.map(y => (
                    <option key={y} value={y}>{y === "Todos" ? "Todos los años" : y}</option>
                  ))}
                </select>
              </div>

              {/* Puntuación mínima */}
              <div>
                <label className="block text-muted-foreground text-xs font-bold uppercase tracking-wider mb-2">
                  Puntuación mínima: <span className="text-primary font-mono">{minRating > 0 ? `${minRating}+` : "Cualquiera"}</span>
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={0}
                    max={9}
                    step={1}
                    value={minRating}
                    onChange={e => setMinRating(Number(e.target.value))}
                    className="flex-1 accent-primary h-1.5"
                  />
                  <div className="flex gap-1">
                    {[0, 5, 6, 7, 8, 9].map(r => (
                      <button
                        key={r}
                        onClick={() => setMinRating(r)}
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded transition-all ${
                          minRating === r ? "bg-primary text-primary-foreground" : "bg-background border border-border text-muted-foreground hover:border-primary/50"
                        }`}
                      >
                        {r === 0 ? "★ Todos" : `${r}+`}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Active filter chips + clear */}
            {activeFiltersCount > 0 && (
              <div className="flex flex-wrap items-center gap-2 mt-4 pt-4 border-t border-border">
                <span className="text-muted-foreground text-xs">Filtros activos:</span>
                {genre !== "Todos" && (
                  <button onClick={() => setGenre("Todos")} className="flex items-center gap-1 bg-primary/10 border border-primary/30 text-primary text-xs px-2.5 py-1 rounded-full hover:bg-primary/20 transition-colors">
                    Género: {genre} <X className="w-3 h-3" />
                  </button>
                )}
                {year !== "Todos" && (
                  <button onClick={() => setYear("Todos")} className="flex items-center gap-1 bg-primary/10 border border-primary/30 text-primary text-xs px-2.5 py-1 rounded-full hover:bg-primary/20 transition-colors">
                    Año: {year} <X className="w-3 h-3" />
                  </button>
                )}
                {minRating > 0 && (
                  <button onClick={() => setMinRating(0)} className="flex items-center gap-1 bg-primary/10 border border-primary/30 text-primary text-xs px-2.5 py-1 rounded-full hover:bg-primary/20 transition-colors">
                    Puntuación: {minRating}+ <X className="w-3 h-3" />
                  </button>
                )}
                {search.trim() && (
                  <button onClick={() => setSearch("")} className="flex items-center gap-1 bg-primary/10 border border-primary/30 text-primary text-xs px-2.5 py-1 rounded-full hover:bg-primary/20 transition-colors">
                    "{search}" <X className="w-3 h-3" />
                  </button>
                )}
                <button onClick={clearFilters} className="text-muted-foreground hover:text-foreground text-xs underline ml-1 transition-colors">
                  Limpiar todo
                </button>
              </div>
            )}
          </div>
        )}

        {/* Quick sort bar (always visible) */}
        <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-1 scrollbar-none">
          {SORTS.map(s => (
            <button
              key={s.value}
              onClick={() => setSortBy(s.value)}
              className={`flex-none px-3.5 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider transition-all border ${
                sortBy === s.value
                  ? "bg-primary/15 border-primary/50 text-primary"
                  : "bg-card border-border text-muted-foreground hover:text-foreground hover:border-primary/30"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-6">
          {loading
            ? Array.from({ length: 18 }).map((_, i) => <MovieCardSkeleton key={i} />)
            : filtered.map(movie => (
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
            <h2 className="text-3xl font-heading tracking-widest text-muted-foreground mb-3">Sin Contenido</h2>
            <p className="text-muted-foreground max-w-md mx-auto">
              Agrega películas desde el{" "}
              <Link href="/admin" className="text-primary underline">panel de administración</Link>{" "}
              para que aparezcan aquí.
            </p>
          </div>
        )}

        {!loading && allMovies.length > 0 && filtered.length === 0 && (
          <div className="py-32 text-center flex flex-col items-center justify-center">
            <div className="w-24 h-24 mb-6 rounded-full bg-card border border-border flex items-center justify-center opacity-50">
              <Filter className="w-10 h-10 text-muted-foreground" />
            </div>
            <h2 className="text-3xl font-heading tracking-widest text-muted-foreground mb-2">Sin Resultados</h2>
            <p className="text-muted-foreground max-w-md mx-auto mb-6">No hay películas que coincidan con los filtros aplicados.</p>
            <button onClick={clearFilters} className="bg-primary/10 border border-primary/30 text-primary px-6 py-2.5 rounded-lg font-bold text-sm hover:bg-primary/20 transition-colors">
              Limpiar filtros
            </button>
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <p className="text-center text-muted-foreground text-sm mt-10">
            {filtered.length} película{filtered.length !== 1 ? "s" : ""} encontrada{filtered.length !== 1 ? "s" : ""}
          </p>
        )}
      </div>
    </PageTransition>
  );
}
