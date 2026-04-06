import { useState, useEffect, useMemo } from "react";
import {
  Film, Search, Trash2, Edit2, Eye, Star, Trash, ChevronLeft, ChevronRight,
  CheckSquare, Square, AlertTriangle, Filter, X, SortAsc, SortDesc
} from "lucide-react";
import { LocalMovie } from "@/lib/admin-db";
import { apiGetMovies, apiDeleteMovie, apiSaveMovie } from "@/lib/api-client";
import { toast } from "sonner";

interface ManageMoviesProps {
  onEdit: (id: string) => void;
}

const PAGE_SIZE = 25;

type SortKey = "title" | "year" | "rating" | "views" | "date_added";

export function ManageMovies({ onEdit }: ManageMoviesProps) {
  const [movies, setMovies] = useState<LocalMovie[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [genreFilter, setGenreFilter] = useState("Todos");
  const [yearFilter, setYearFilter] = useState("Todos");
  const [sortKey, setSortKey] = useState<SortKey>("date_added");
  const [sortAsc, setSortAsc] = useState(false);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = () => {
    setLoading(true);
    apiGetMovies().then(ms => { setMovies(ms); setSelected(new Set()); setLoading(false); }).catch(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const genres = useMemo(() => {
    const set = new Set<string>();
    movies.forEach(m => m.genres?.forEach(g => set.add(g)));
    return ["Todos", ...Array.from(set).sort()];
  }, [movies]);

  const years = useMemo(() => {
    const set = new Set<number>();
    movies.forEach(m => { if (m.year) set.add(m.year); });
    return ["Todos", ...Array.from(set).sort((a, b) => b - a).map(String)];
  }, [movies]);

  const filtered = useMemo(() => {
    let list = [...movies];
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(m =>
        m.title.toLowerCase().includes(q) ||
        m.imdb_id.toLowerCase().includes(q) ||
        String(m.year).includes(q) ||
        m.director?.toLowerCase().includes(q)
      );
    }
    if (genreFilter !== "Todos") list = list.filter(m => m.genres?.some(g => g.toLowerCase() === genreFilter.toLowerCase()));
    if (yearFilter !== "Todos") list = list.filter(m => String(m.year) === yearFilter);

    list.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "title") cmp = a.title.localeCompare(b.title);
      else if (sortKey === "year") cmp = a.year - b.year;
      else if (sortKey === "rating") cmp = a.rating - b.rating;
      else if (sortKey === "views") cmp = (a.views || 0) - (b.views || 0);
      else cmp = new Date(a.date_added || 0).getTime() - new Date(b.date_added || 0).getTime();
      return sortAsc ? cmp : -cmp;
    });
    return list;
  }, [movies, search, genreFilter, yearFilter, sortKey, sortAsc]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleDelete = async (id: string) => {
    setDeleting(true);
    await apiDeleteMovie(id);
    load();
    setDeleteConfirm(null);
    setDeleting(false);
    toast.success("Película eliminada");
  };

  const handleBulkDelete = async () => {
    setDeleting(true);
    const ids = [...selected];
    await Promise.all(ids.map(id => apiDeleteMovie(id)));
    setBulkDeleteConfirm(false);
    load();
    setDeleting(false);
    toast.success(`${ids.length} película${ids.length !== 1 ? "s" : ""} eliminada${ids.length !== 1 ? "s" : ""}`);
  };

  const toggleFeatured = async (movie: LocalMovie) => {
    await apiSaveMovie({ ...movie, featured: !movie.featured });
    load();
    toast.success(movie.featured ? "Quitada de destacados" : "Marcada como destacada");
  };

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const allOnPageSelected = paginated.length > 0 && paginated.every(m => selected.has(m.id));

  const toggleSelectAllPage = () => {
    if (allOnPageSelected) {
      setSelected(prev => { const n = new Set(prev); paginated.forEach(m => n.delete(m.id)); return n; });
    } else {
      setSelected(prev => { const n = new Set(prev); paginated.forEach(m => n.add(m.id)); return n; });
    }
  };

  const selectAllFiltered = () => setSelected(new Set(filtered.map(m => m.id)));
  const clearSelection = () => setSelected(new Set());

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(a => !a);
    else { setSortKey(key); setSortAsc(false); }
    setPage(1);
  };

  const SortIcon = ({ col }: { col: SortKey }) =>
    sortKey === col
      ? (sortAsc ? <SortAsc className="w-3 h-3 text-[#3fb950]" /> : <SortDesc className="w-3 h-3 text-[#3fb950]" />)
      : <SortAsc className="w-3 h-3 opacity-20" />;

  const activeFilters = [search, genreFilter !== "Todos" && genreFilter, yearFilter !== "Todos" && yearFilter].filter(Boolean).length;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#c9d1d9] mb-1">Gestionar Películas</h1>
          <p className="text-[#8b949e] text-sm">
            {filtered.length} de {movies.length} película{movies.length !== 1 ? "s" : ""}
            {activeFilters > 0 && <span className="text-[#58a6ff] ml-1">· {activeFilters} filtro{activeFilters !== 1 ? "s" : ""}</span>}
          </p>
        </div>

        {selected.size > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-[#8b949e] text-sm font-mono">{selected.size} seleccionadas</span>
            {selected.size < filtered.length && (
              <button
                onClick={selectAllFiltered}
                className="text-[#58a6ff] text-xs hover:underline"
              >
                Seleccionar todas ({filtered.length})
              </button>
            )}
            <button
              onClick={clearSelection}
              className="p-1.5 rounded text-[#8b949e] hover:text-[#c9d1d9] hover:bg-[#21262d] transition-colors"
              title="Limpiar selección"
            >
              <X className="w-4 h-4" />
            </button>
            <button
              onClick={() => setBulkDeleteConfirm(true)}
              className="flex items-center gap-2 bg-[#da3633]/10 border border-[#da3633]/30 text-[#f85149] px-4 py-2 rounded-lg text-sm font-bold hover:bg-[#da3633]/20 transition-colors"
              data-testid="btn-bulk-delete"
            >
              <Trash className="w-4 h-4" />
              Eliminar {selected.size}
            </button>
          </div>
        )}
      </div>

      {/* Search + Filters */}
      <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-4 space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8b949e]" />
            <input
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              placeholder="Buscar por título, ID de IMDb, director o año..."
              className="w-full bg-[#0d1117] border border-[#30363d] focus:border-[#238636] text-[#c9d1d9] rounded-lg pl-10 pr-4 py-2.5 text-sm font-mono outline-none placeholder:text-[#484f58]"
              data-testid="input-search-movies"
            />
          </div>

          <select
            value={genreFilter}
            onChange={e => { setGenreFilter(e.target.value); setPage(1); }}
            className="bg-[#0d1117] border border-[#30363d] focus:border-[#238636] text-[#c9d1d9] rounded-lg px-3 py-2.5 text-sm outline-none"
          >
            {genres.map(g => <option key={g} value={g}>{g === "Todos" ? "Todos los géneros" : g}</option>)}
          </select>

          <select
            value={yearFilter}
            onChange={e => { setYearFilter(e.target.value); setPage(1); }}
            className="bg-[#0d1117] border border-[#30363d] focus:border-[#238636] text-[#c9d1d9] rounded-lg px-3 py-2.5 text-sm outline-none"
          >
            {years.map(y => <option key={y} value={y}>{y === "Todos" ? "Todos los años" : y}</option>)}
          </select>

          {activeFilters > 0 && (
            <button
              onClick={() => { setSearch(""); setGenreFilter("Todos"); setYearFilter("Todos"); setPage(1); }}
              className="flex items-center gap-1.5 bg-[#21262d] border border-[#30363d] text-[#8b949e] hover:text-[#c9d1d9] px-3 py-2 rounded-lg text-sm transition-colors flex-none"
            >
              <X className="w-4 h-4" />
              Limpiar
            </button>
          )}
        </div>

        {/* Select all bar */}
        {filtered.length > 0 && (
          <div className="flex items-center gap-3 text-xs text-[#8b949e] font-mono">
            <Filter className="w-3.5 h-3.5" />
            <span>{filtered.length} resultado{filtered.length !== 1 ? "s" : ""}</span>
            <span className="text-[#30363d]">·</span>
            <button onClick={selectAllFiltered} className="text-[#58a6ff] hover:underline">
              Seleccionar todos ({filtered.length})
            </button>
            {selected.size > 0 && (
              <>
                <span className="text-[#30363d]">·</span>
                <button onClick={clearSelection} className="text-[#8b949e] hover:text-[#c9d1d9] hover:underline">
                  Deseleccionar
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {loading ? (
        <div className="bg-[#161b22] border border-[#30363d] rounded-xl py-16 text-center">
          <div className="w-8 h-8 border-2 border-[#238636] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-[#8b949e] font-mono text-sm">Cargando películas...</p>
        </div>
      ) : movies.length === 0 ? (
        <div className="bg-[#161b22] border border-[#30363d] rounded-xl py-16 text-center">
          <Film className="w-12 h-12 text-[#30363d] mx-auto mb-3" />
          <p className="text-[#8b949e] font-mono text-sm">No hay películas en la base de datos</p>
          <p className="text-[#484f58] font-mono text-xs mt-1">Usa "Agregar Película" o "Importación Masiva" para empezar</p>
        </div>
      ) : (
        <>
          <div className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#30363d] bg-[#0d1117]/50">
                    <th className="px-4 py-3 text-left w-10">
                      <button onClick={toggleSelectAllPage} className="text-[#8b949e] hover:text-[#c9d1d9] transition-colors">
                        {allOnPageSelected
                          ? <CheckSquare className="w-4 h-4 text-[#238636]" />
                          : <Square className="w-4 h-4" />
                        }
                      </button>
                    </th>
                    <th className="px-4 py-3 text-left text-[#8b949e] font-mono uppercase text-xs tracking-wider w-12">Póster</th>
                    <th className="px-4 py-3 text-left w-0">
                      <button onClick={() => handleSort("title")} className="flex items-center gap-1 text-[#8b949e] font-mono uppercase text-xs tracking-wider hover:text-[#c9d1d9]">
                        Título <SortIcon col="title" />
                      </button>
                    </th>
                    <th className="px-4 py-3 text-left hidden md:table-cell">
                      <button onClick={() => handleSort("year")} className="flex items-center gap-1 text-[#8b949e] font-mono uppercase text-xs tracking-wider hover:text-[#c9d1d9]">
                        Año <SortIcon col="year" />
                      </button>
                    </th>
                    <th className="px-4 py-3 text-left hidden md:table-cell text-[#8b949e] font-mono uppercase text-xs tracking-wider">IMDb ID</th>
                    <th className="px-4 py-3 hidden lg:table-cell">
                      <button onClick={() => handleSort("rating")} className="flex items-center gap-1 text-[#8b949e] font-mono uppercase text-xs tracking-wider hover:text-[#c9d1d9]">
                        Rating <SortIcon col="rating" />
                      </button>
                    </th>
                    <th className="px-4 py-3 hidden lg:table-cell">
                      <button onClick={() => handleSort("views")} className="flex items-center gap-1 text-[#8b949e] font-mono uppercase text-xs tracking-wider hover:text-[#c9d1d9]">
                        Vistas <SortIcon col="views" />
                      </button>
                    </th>
                    <th className="px-4 py-3 hidden xl:table-cell">
                      <button onClick={() => handleSort("date_added")} className="flex items-center gap-1 text-[#8b949e] font-mono uppercase text-xs tracking-wider hover:text-[#c9d1d9]">
                        Añadida <SortIcon col="date_added" />
                      </button>
                    </th>
                    <th className="px-4 py-3 text-right text-[#8b949e] font-mono uppercase text-xs tracking-wider">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#21262d]">
                  {paginated.map(movie => (
                    <tr
                      key={movie.id}
                      className={`hover:bg-[#21262d]/50 transition-colors ${selected.has(movie.id) ? "bg-[#238636]/5 border-l-2 border-[#238636]/40" : ""}`}
                    >
                      <td className="px-4 py-3">
                        <button onClick={() => toggleSelect(movie.id)} className="text-[#8b949e] hover:text-[#c9d1d9] transition-colors">
                          {selected.has(movie.id)
                            ? <CheckSquare className="w-4 h-4 text-[#238636]" />
                            : <Square className="w-4 h-4" />
                          }
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        {movie.poster_url ? (
                          <img src={movie.poster_url} alt={movie.title} className="w-8 h-11 object-cover rounded" />
                        ) : (
                          <div className="w-8 h-11 rounded bg-[#21262d] flex items-center justify-center">
                            <Film className="w-4 h-4 text-[#8b949e]" />
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 max-w-[200px]">
                        <p className="text-[#c9d1d9] font-medium truncate">{movie.title}</p>
                        <div className="flex flex-wrap gap-1 mt-0.5">
                          {movie.genres?.slice(0, 2).map(g => (
                            <span key={g} className="text-[9px] text-[#8b949e] bg-[#21262d] px-1.5 py-0.5 rounded font-mono">{g}</span>
                          ))}
                          {movie.featured && (
                            <span className="text-[9px] bg-[#e3b341]/20 text-[#e3b341] px-1.5 py-0.5 rounded font-mono">★ Dest.</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <span className="text-[#8b949e] font-mono text-xs">{movie.year}</span>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <span className="text-[#58a6ff] font-mono text-xs">{movie.imdb_id}</span>
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <span className="flex items-center gap-0.5 text-xs text-yellow-500 font-mono">
                          <Star className="w-3 h-3 fill-current" />{movie.rating}
                        </span>
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <span className="text-[#c9d1d9] font-mono text-xs">{movie.views || 0}</span>
                      </td>
                      <td className="px-4 py-3 hidden xl:table-cell">
                        <span className="text-[#8b949e] font-mono text-xs">
                          {new Date(movie.date_added).toLocaleDateString("es")}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => toggleFeatured(movie)}
                            className={`p-1.5 rounded transition-colors ${
                              movie.featured ? "text-[#e3b341] bg-[#e3b341]/10 hover:bg-[#e3b341]/20" : "text-[#8b949e] hover:text-[#e3b341] hover:bg-[#e3b341]/10"
                            }`}
                            title={movie.featured ? "Quitar destacado" : "Destacar"}
                          >
                            <Star className={`w-4 h-4 ${movie.featured ? "fill-current" : ""}`} />
                          </button>
                          <a
                            href={`/movie/${movie.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 rounded text-[#8b949e] hover:text-[#58a6ff] hover:bg-[#58a6ff]/10 transition-colors"
                            title="Vista previa"
                          >
                            <Eye className="w-4 h-4" />
                          </a>
                          <button
                            onClick={() => onEdit(movie.id)}
                            className="p-1.5 rounded text-[#8b949e] hover:text-[#3fb950] hover:bg-[#238636]/10 transition-colors"
                            title="Editar"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(movie.id)}
                            className="p-1.5 rounded text-[#8b949e] hover:text-[#f85149] hover:bg-[#da3633]/10 transition-colors"
                            title="Eliminar"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="px-4 py-3 border-t border-[#30363d] flex items-center justify-between">
                <span className="text-[#8b949e] text-xs font-mono">
                  Página {page} de {totalPages} · {filtered.length} resultados
                </span>
                <div className="flex gap-1">
                  <button onClick={() => setPage(1)} disabled={page === 1} className="p-1.5 rounded border border-[#30363d] text-[#8b949e] hover:text-[#c9d1d9] disabled:opacity-30 transition-colors text-xs font-mono px-2">1</button>
                  <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-1.5 rounded border border-[#30363d] text-[#8b949e] hover:text-[#c9d1d9] disabled:opacity-30 transition-colors">
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="flex items-center px-3 text-[#c9d1d9] text-xs font-mono border border-[#30363d] rounded bg-[#21262d]">{page}</span>
                  <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-1.5 rounded border border-[#30363d] text-[#8b949e] hover:text-[#c9d1d9] disabled:opacity-30 transition-colors">
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <button onClick={() => setPage(totalPages)} disabled={page === totalPages} className="p-1.5 rounded border border-[#30363d] text-[#8b949e] hover:text-[#c9d1d9] disabled:opacity-30 transition-colors text-xs font-mono px-2">{totalPages}</button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Single delete modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-[#161b22] border border-[#da3633]/30 rounded-xl p-6 max-w-sm w-full shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-[#da3633]/10 flex items-center justify-center flex-shrink-0">
                <Trash2 className="w-5 h-5 text-[#f85149]" />
              </div>
              <div>
                <h3 className="text-[#c9d1d9] font-bold text-base">¿Eliminar película?</h3>
                <p className="text-[#8b949e] text-xs font-mono">{movies.find(m => m.id === deleteConfirm)?.title}</p>
              </div>
            </div>
            <p className="text-[#8b949e] text-sm mb-6">Esta acción eliminará la película permanentemente de la base de datos. No se puede deshacer.</p>
            <div className="flex gap-3">
              <button
                onClick={() => handleDelete(deleteConfirm)}
                disabled={deleting}
                className="flex-1 bg-[#da3633] hover:bg-[#b62324] disabled:opacity-50 text-white py-2.5 rounded-lg font-bold text-sm transition-colors"
                data-testid="btn-confirm-delete"
              >
                {deleting ? "Eliminando..." : "Eliminar"}
              </button>
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 bg-[#21262d] text-[#c9d1d9] hover:bg-[#30363d] py-2.5 rounded-lg font-bold text-sm transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk delete modal */}
      {bulkDeleteConfirm && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-[#161b22] border border-[#da3633]/30 rounded-xl p-6 max-w-md w-full shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-[#da3633]/10 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-6 h-6 text-[#f85149]" />
              </div>
              <div>
                <h3 className="text-[#c9d1d9] font-bold text-lg">Eliminación Masiva</h3>
                <p className="text-[#f85149] text-sm font-mono font-bold">{selected.size} película{selected.size !== 1 ? "s" : ""} seleccionada{selected.size !== 1 ? "s" : ""}</p>
              </div>
            </div>

            <div className="bg-[#da3633]/5 border border-[#da3633]/20 rounded-lg p-3 mb-5">
              <p className="text-[#8b949e] text-sm">
                Esto eliminará permanentemente <strong className="text-[#f85149]">{selected.size} película{selected.size !== 1 ? "s" : ""}</strong> de la base de datos.
                Esta acción <strong className="text-white">no se puede deshacer</strong>.
              </p>
            </div>

            {/* Preview of movies to delete */}
            <div className="max-h-40 overflow-y-auto space-y-1 mb-5 bg-[#0d1117] rounded-lg p-2">
              {[...selected].slice(0, 10).map(id => {
                const m = movies.find(mv => mv.id === id);
                return m ? (
                  <div key={id} className="flex items-center gap-2 text-xs font-mono text-[#8b949e]">
                    <Trash2 className="w-3 h-3 text-[#f85149] flex-shrink-0" />
                    <span className="truncate">{m.title} ({m.year})</span>
                  </div>
                ) : null;
              })}
              {selected.size > 10 && (
                <p className="text-[#484f58] text-xs font-mono pl-5">... y {selected.size - 10} más</p>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleBulkDelete}
                disabled={deleting}
                className="flex-1 bg-[#da3633] hover:bg-[#b62324] disabled:opacity-50 text-white py-3 rounded-lg font-bold text-sm transition-colors"
                data-testid="btn-confirm-bulk-delete"
              >
                {deleting ? "Eliminando..." : `Eliminar ${selected.size} películas`}
              </button>
              <button
                onClick={() => setBulkDeleteConfirm(false)}
                className="flex-1 bg-[#21262d] text-[#c9d1d9] hover:bg-[#30363d] py-3 rounded-lg font-bold text-sm transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
