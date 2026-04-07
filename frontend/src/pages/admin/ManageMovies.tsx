import { useState, useEffect, useMemo } from "react";
import {
  Film, Search, Trash2, Edit2, Eye, Star, ChevronLeft, ChevronRight,
  CheckSquare, Square, X, SortAsc, SortDesc, Wifi, Filter
} from "lucide-react";
import { getMovies, deleteMovie, saveMovie, verifyVidsrc } from "@/lib/api";
import type { Movie } from "@/lib/types";
import { toast } from "sonner";
import AdminLayout from "@/components/admin/AdminLayout";
import EditMediaModal from "@/components/admin/EditMediaModal";

const PAGE_SIZE = 25;

type SortKey = "title" | "year" | "rating" | "views" | "date_added";

export default function ManageMovies() {
  const [movies, setMovies] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [genreFilter, setGenreFilter] = useState("Todos");
  const [yearFilter, setYearFilter] = useState("Todos");
  const [missingFilter, setMissingFilter] = useState("Ninguno");
  const [sortKey, setSortKey] = useState<SortKey>("date_added");
  const [sortAsc, setSortAsc] = useState(false);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string | number>>(new Set());
  const [verifying, setVerifying] = useState(false);
  const [editingItem, setEditingItem] = useState<Movie | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const ms = await getMovies();
      setMovies(ms);
      setSelected(new Set());
    } catch (err) {
      toast.error("Error al cargar películas");
    } finally {
      setLoading(false);
    }
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
        m.imdb_id?.toLowerCase().includes(q) ||
        String(m.year).includes(q)
      );
    }
    if (genreFilter !== "Todos") list = list.filter(m => m.genres?.some(g => g.toLowerCase() === genreFilter.toLowerCase()));
    if (yearFilter !== "Todos") list = list.filter(m => String(m.year) === yearFilter);
    
    if (missingFilter === "Sin póster") list = list.filter(m => !m.poster_url);
    if (missingFilter === "Sin sinopsis") list = list.filter(m => !m.synopsis);
    if (missingFilter === "Sin géneros") list = list.filter(m => !m.genres || m.genres.length === 0);
    if (missingFilter === "Sin año") list = list.filter(m => !m.year);

    list.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "title") cmp = a.title.localeCompare(b.title);
      else if (sortKey === "year") cmp = (a.year || 0) - (b.year || 0);
      else if (sortKey === "rating") cmp = (a.rating || 0) - (b.rating || 0);
      else if (sortKey === "views") cmp = (a.views || 0) - (b.views || 0);
      else cmp = new Date(a.date_added || 0).getTime() - new Date(b.date_added || 0).getTime();
      return sortAsc ? cmp : -cmp;
    });
    return list;
  }, [movies, search, genreFilter, yearFilter, missingFilter, sortKey, sortAsc]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleDelete = async (id: string | number) => {
    if (!confirm("¿Estás seguro de eliminar esta película?")) return;
    try {
      await deleteMovie(id);
      toast.success("Película eliminada");
      load();
    } catch (err) {
      toast.error("Error al eliminar");
    }
  };

  const handleBulkDelete = async () => {
    if (!confirm(`¿Estás seguro de eliminar ${selected.size} películas?`)) return;
    try {
      await Promise.all([...selected].map(id => deleteMovie(id)));
      toast.success(`${selected.size} películas eliminadas`);
      load();
    } catch (err) {
      toast.error("Error en eliminación masiva");
    }
  };

  const toggleFeatured = async (movie: Movie) => {
    try {
      await saveMovie({ id: movie.id, featured: !movie.featured });
      toast.success(movie.featured ? "Quitada de destacados" : "Marcada como destacada");
      load();
    } catch (err) {
      toast.error("Error al actualizar");
    }
  };

  const handleVerifyVidsrc = async () => {
    if (selected.size === 0) return;
    setVerifying(true);
    const selectedMovies = movies.filter(m => selected.has(m.id));
    const imdbIds = selectedMovies.map(m => m.imdb_id).filter((id): id is string => !!id);
    try {
      const results = await verifyVidsrc(imdbIds, "movie");
      const active = results.filter(r => r.available).length;
      toast.success(`Verificación: ${active} activos de ${results.length}`);
    } catch {
      toast.error("Error al verificar disponibilidad");
    }
    setVerifying(false);
  };

  const toggleSelect = (id: string | number) => {
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

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(a => !a);
    else { setSortKey(key); setSortAsc(false); }
    setPage(1);
  };

  return (
    <AdminLayout>
      <div className="space-y-5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-white mb-1">Gestionar Películas</h1>
            <p className="text-gray-500 text-sm">
              {filtered.length} de {movies.length} películas
            </p>
          </div>

          {selected.size > 0 && (
            <div className="flex items-center gap-2">
              <button
                onClick={handleVerifyVidsrc}
                disabled={verifying}
                className="flex items-center gap-2 bg-blue-600/10 border border-blue-600/30 text-blue-400 px-4 py-2 rounded-lg text-sm font-bold hover:bg-blue-600/20 transition-colors disabled:opacity-50"
              >
                <Wifi className={`w-4 h-4 ${verifying ? "animate-pulse" : ""}`} />
                {verifying ? "Verificando..." : "Verificar VidSrc"}
              </button>
              <button
                onClick={handleBulkDelete}
                className="flex items-center gap-2 bg-red-600/10 border border-red-600/30 text-red-400 px-4 py-2 rounded-lg text-sm font-bold hover:bg-red-600/20 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                Eliminar {selected.size}
              </button>
            </div>
          )}
        </div>

        <div className="bg-brand-card border border-brand-border rounded-xl p-4 space-y-3">
          <div className="flex flex-col lg:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
                placeholder="Buscar por título, IMDb ID o año..."
                className="w-full bg-brand-dark border border-brand-border focus:border-brand-red text-white rounded-lg pl-10 pr-4 py-2 text-sm outline-none"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <select
                value={genreFilter}
                onChange={e => { setGenreFilter(e.target.value); setPage(1); }}
                className="bg-brand-dark border border-brand-border text-white rounded-lg px-3 py-2 text-sm outline-none"
              >
                {genres.map(g => <option key={g} value={g}>{g === "Todos" ? "Todos los géneros" : g}</option>)}
              </select>

              <select
                value={yearFilter}
                onChange={e => { setYearFilter(e.target.value); setPage(1); }}
                className="bg-brand-dark border border-brand-border text-white rounded-lg px-3 py-2 text-sm outline-none"
              >
                {years.map(y => <option key={y} value={y}>{y === "Todos" ? "Todos los años" : y}</option>)}
              </select>

              <select
                value={missingFilter}
                onChange={e => { setMissingFilter(e.target.value); setPage(1); }}
                className="bg-brand-dark border border-brand-border text-white rounded-lg px-3 py-2 text-sm outline-none"
              >
                <option value="Ninguno">Sin filtros especiales</option>
                <option value="Sin póster">Sin póster</option>
                <option value="Sin sinopsis">Sin sinopsis</option>
                <option value="Sin géneros">Sin géneros</option>
                <option value="Sin año">Sin año</option>
              </select>
            </div>
          </div>
        </div>

        <div className="bg-brand-card border border-brand-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="border-b border-brand-border bg-brand-dark/50">
                  <th className="px-4 py-3 w-10">
                    <button onClick={toggleSelectAllPage}>
                      {allOnPageSelected ? <CheckSquare className="w-4 h-4 text-brand-red" /> : <Square className="w-4 h-4 text-gray-500" />}
                    </button>
                  </th>
                  <th className="px-4 py-3 w-12 text-gray-500 font-medium uppercase text-xs">Póster</th>
                  <th className="px-4 py-3 text-gray-500 font-medium uppercase text-xs cursor-pointer" onClick={() => handleSort("title")}>
                    Título {sortKey === "title" && (sortAsc ? <SortAsc className="inline w-3 h-3" /> : <SortDesc className="inline w-3 h-3" />)}
                  </th>
                  <th className="px-4 py-3 text-gray-500 font-medium uppercase text-xs cursor-pointer" onClick={() => handleSort("year")}>
                    Año {sortKey === "year" && (sortAsc ? <SortAsc className="inline w-3 h-3" /> : <SortDesc className="inline w-3 h-3" />)}
                  </th>
                  <th className="px-4 py-3 text-gray-500 font-medium uppercase text-xs cursor-pointer" onClick={() => handleSort("rating")}>
                    Rating {sortKey === "rating" && (sortAsc ? <SortAsc className="inline w-3 h-3" /> : <SortDesc className="inline w-3 h-3" />)}
                  </th>
                  <th className="px-4 py-3 text-gray-500 font-medium uppercase text-xs text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-border">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-gray-500">Cargando...</td>
                  </tr>
                ) : paginated.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-gray-500">No se encontraron películas</td>
                  </tr>
                ) : paginated.map(m => (
                  <tr key={m.id} className={`hover:bg-brand-surface/50 transition-colors ${selected.has(m.id) ? "bg-brand-red/5" : ""}`}>
                    <td className="px-4 py-3">
                      <button onClick={() => toggleSelect(m.id)}>
                        {selected.has(m.id) ? <CheckSquare className="w-4 h-4 text-brand-red" /> : <Square className="w-4 h-4 text-gray-500" />}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      {m.poster_url ? (
                        <img src={m.poster_url} alt="" className="w-8 h-11 object-cover rounded bg-brand-dark" />
                      ) : (
                        <div className="w-8 h-11 rounded bg-brand-dark flex items-center justify-center"><Film className="w-4 h-4 text-gray-700" /></div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-white font-medium line-clamp-1">{m.title}</p>
                      <p className="text-gray-500 text-xs font-mono">{m.imdb_id}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-400">{m.year}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 text-brand-gold">
                        <Star className="w-3 h-3 fill-current" />
                        <span className="text-xs font-bold">{m.rating || "N/A"}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => toggleFeatured(m)} className={`p-1.5 rounded transition-colors ${m.featured ? "text-brand-gold bg-brand-gold/10" : "text-gray-500 hover:text-brand-gold hover:bg-brand-gold/10"}`}>
                          <Star className={`w-4 h-4 ${m.featured ? "fill-current" : ""}`} />
                        </button>
                        <a href={`/pelicula/${m.id}`} target="_blank" rel="noreferrer" className="p-1.5 rounded text-gray-500 hover:text-blue-400 hover:bg-blue-400/10">
                          <Eye className="w-4 h-4" />
                        </a>
                        <button onClick={() => setEditingItem(m)} className="p-1.5 rounded text-gray-500 hover:text-green-400 hover:bg-green-400/10">
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDelete(m.id)} className="p-1.5 rounded text-gray-500 hover:text-brand-red hover:bg-brand-red/10">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="px-4 py-3 border-t border-brand-border flex items-center justify-between bg-brand-dark/30">
              <span className="text-gray-500 text-xs">Página {page} de {totalPages}</span>
              <div className="flex gap-2">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-1.5 rounded border border-brand-border text-gray-400 hover:text-white disabled:opacity-30">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-1.5 rounded border border-brand-border text-gray-400 hover:text-white disabled:opacity-30">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {editingItem && (
        <EditMediaModal
          item={editingItem}
          type="movie"
          onClose={() => setEditingItem(null)}
          onSaved={load}
        />
      )}
    </AdminLayout>
  );
}
