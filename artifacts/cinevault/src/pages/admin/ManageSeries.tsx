import { useState, useEffect } from "react";
import { Tv, Search, Trash2, Edit2, Eye, Star, ChevronLeft, ChevronRight, CheckSquare, Square, AlertTriangle, X } from "lucide-react";
import { apiGetSeries, apiDeleteSeries, apiSaveSeries, type LocalSeries } from "@/lib/api-client";
import { toast } from "sonner";

interface ManageSeriesProps {
  onEdit: (id: string) => void;
}

const PAGE_SIZE = 20;

export function ManageSeries({ onEdit }: ManageSeriesProps) {
  const [series, setSeries] = useState<LocalSeries[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = () => {
    setLoading(true);
    apiGetSeries().then(data => { setSeries(data); setSelected(new Set()); setLoading(false); }).catch(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const filtered = series.filter(s =>
    !search ||
    s.title.toLowerCase().includes(search.toLowerCase()) ||
    s.imdb_id.toLowerCase().includes(search.toLowerCase()) ||
    String(s.year).includes(search)
  );

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleDelete = async (id: string) => {
    setDeleting(true);
    await apiDeleteSeries(id);
    load();
    setDeleteConfirm(null);
    setDeleting(false);
    toast.success("Serie eliminada");
  };

  const handleBulkDelete = async () => {
    setDeleting(true);
    await Promise.all([...selected].map(id => apiDeleteSeries(id)));
    setBulkDeleteConfirm(false);
    load();
    setDeleting(false);
    toast.success(`${selected.size} series eliminadas`);
  };

  const toggleFeatured = async (s: LocalSeries) => {
    await apiSaveSeries({ ...s, featured: !s.featured });
    load();
    toast.success(s.featured ? "Quitada de destacados" : "Marcada como destacada");
  };

  const toggleSelect = (id: string) => {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  const allSelected = paginated.length > 0 && paginated.every(s => selected.has(s.id));
  const toggleSelectAll = () => {
    if (allSelected) setSelected(prev => { const n = new Set(prev); paginated.forEach(s => n.delete(s.id)); return n; });
    else setSelected(prev => { const n = new Set(prev); paginated.forEach(s => n.add(s.id)); return n; });
  };

  const statusBadge = (status: string) => {
    if (status === "Returning Series") return "bg-[#238636]/20 text-[#3fb950] border-[#238636]/30";
    if (status === "Ended") return "bg-[#30363d] text-[#8b949e] border-[#30363d]";
    if (status === "Canceled") return "bg-[#da3633]/10 text-[#f85149] border-[#da3633]/20";
    return "bg-[#21262d] text-[#8b949e] border-[#30363d]";
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#c9d1d9] mb-1">Gestionar Series</h1>
          <p className="text-[#8b949e] text-sm">{series.length} serie{series.length !== 1 ? "s" : ""} en la base de datos</p>
        </div>
        {selected.size > 0 && (
          <div className="flex items-center gap-2">
            <button onClick={() => setSelected(new Set())} className="p-1.5 text-[#8b949e] hover:text-[#c9d1d9]"><X className="w-4 h-4" /></button>
            <button onClick={() => setBulkDeleteConfirm(true)} className="flex items-center gap-2 bg-[#da3633]/10 border border-[#da3633]/30 text-[#f85149] px-4 py-2 rounded-lg text-sm font-bold hover:bg-[#da3633]/20 transition-colors">
              <Trash2 className="w-4 h-4" />
              Eliminar {selected.size}
            </button>
          </div>
        )}
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8b949e]" />
        <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Buscar por título, IMDb ID o año..." className="w-full bg-[#161b22] border border-[#30363d] focus:border-[#238636] text-[#c9d1d9] rounded-lg pl-10 pr-4 py-2.5 text-sm font-mono outline-none placeholder:text-[#484f58]" />
      </div>

      {loading ? (
        <div className="bg-[#161b22] border border-[#30363d] rounded-xl py-16 text-center">
          <div className="w-8 h-8 border-2 border-[#238636] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-[#8b949e] font-mono text-sm">Cargando series...</p>
        </div>
      ) : series.length === 0 ? (
        <div className="bg-[#161b22] border border-[#30363d] rounded-xl py-16 text-center">
          <Tv className="w-12 h-12 text-[#30363d] mx-auto mb-3" />
          <p className="text-[#8b949e] font-mono text-sm">No hay series en la base de datos</p>
          <p className="text-[#484f58] font-mono text-xs mt-1">Usa "Añadir Serie" para empezar</p>
        </div>
      ) : (
        <div className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#30363d] bg-[#0d1117]/50">
                  <th className="px-4 py-3 text-left w-10">
                    <button onClick={toggleSelectAll}>
                      {allSelected ? <CheckSquare className="w-4 h-4 text-[#238636]" /> : <Square className="w-4 h-4 text-[#8b949e]" />}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left w-12 text-[#8b949e] font-mono uppercase text-xs tracking-wider">Póster</th>
                  <th className="px-4 py-3 text-left text-[#8b949e] font-mono uppercase text-xs tracking-wider">Título</th>
                  <th className="px-4 py-3 text-left hidden md:table-cell text-[#8b949e] font-mono uppercase text-xs tracking-wider">IMDb ID</th>
                  <th className="px-4 py-3 text-left hidden lg:table-cell text-[#8b949e] font-mono uppercase text-xs tracking-wider">Estado</th>
                  <th className="px-4 py-3 text-left hidden lg:table-cell text-[#8b949e] font-mono uppercase text-xs tracking-wider">Temporadas</th>
                  <th className="px-4 py-3 text-right text-[#8b949e] font-mono uppercase text-xs tracking-wider">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#21262d]">
                {paginated.map(s => (
                  <tr key={s.id} className={`hover:bg-[#21262d]/50 transition-colors ${selected.has(s.id) ? "bg-[#238636]/5" : ""}`}>
                    <td className="px-4 py-3">
                      <button onClick={() => toggleSelect(s.id)}>
                        {selected.has(s.id) ? <CheckSquare className="w-4 h-4 text-[#238636]" /> : <Square className="w-4 h-4 text-[#8b949e]" />}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      {s.poster_url ? (
                        <img src={s.poster_url} alt={s.title} className="w-8 h-11 object-cover rounded" />
                      ) : (
                        <div className="w-8 h-11 rounded bg-[#21262d] flex items-center justify-center"><Tv className="w-4 h-4 text-[#8b949e]" /></div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-[#c9d1d9] font-medium line-clamp-1 max-w-[200px]">{s.title}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[#8b949e] text-xs font-mono">{s.year}{s.end_year ? `–${s.end_year}` : ""}</span>
                        {s.rating > 0 && <span className="flex items-center gap-0.5 text-xs text-yellow-500 font-mono"><Star className="w-3 h-3 fill-current" />{s.rating}</span>}
                        {s.featured && <span className="text-[10px] bg-[#e3b341]/20 text-[#e3b341] border border-[#e3b341]/30 px-1.5 py-0.5 rounded font-mono">Dest.</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <span className="text-[#58a6ff] font-mono text-xs">{s.imdb_id}</span>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      {s.status && (
                        <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${statusBadge(s.status)}`}>
                          {s.status === "Returning Series" ? "En emisión" : s.status === "Ended" ? "Finalizada" : s.status === "Canceled" ? "Cancelada" : s.status}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <span className="text-[#c9d1d9] font-mono text-xs">{s.total_seasons} temp.</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => toggleFeatured(s)} className={`p-1.5 rounded transition-colors ${s.featured ? "text-[#e3b341] bg-[#e3b341]/10" : "text-[#8b949e] hover:text-[#e3b341] hover:bg-[#e3b341]/10"}`} title={s.featured ? "Quitar destacado" : "Destacar"}>
                          <Star className={`w-4 h-4 ${s.featured ? "fill-current" : ""}`} />
                        </button>
                        <a href={`/series`} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded text-[#8b949e] hover:text-[#58a6ff] hover:bg-[#58a6ff]/10 transition-colors" title="Ver series">
                          <Eye className="w-4 h-4" />
                        </a>
                        <button onClick={() => onEdit(s.id)} className="p-1.5 rounded text-[#8b949e] hover:text-[#3fb950] hover:bg-[#238636]/10 transition-colors" title="Editar">
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button onClick={() => setDeleteConfirm(s.id)} className="p-1.5 rounded text-[#8b949e] hover:text-[#f85149] hover:bg-[#da3633]/10 transition-colors" title="Eliminar">
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
            <div className="px-4 py-3 border-t border-[#30363d] flex items-center justify-between">
              <span className="text-[#8b949e] text-xs font-mono">Página {page} de {totalPages}</span>
              <div className="flex gap-2">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-1.5 rounded border border-[#30363d] text-[#8b949e] hover:text-[#c9d1d9] disabled:opacity-30">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-1.5 rounded border border-[#30363d] text-[#8b949e] hover:text-[#c9d1d9] disabled:opacity-30">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Single delete modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-[#161b22] border border-[#da3633]/30 rounded-xl p-6 max-w-sm w-full">
            <h3 className="text-[#c9d1d9] font-bold text-lg mb-2">¿Eliminar Serie?</h3>
            <p className="text-[#8b949e] text-sm mb-2 font-mono">{series.find(s => s.id === deleteConfirm)?.title}</p>
            <p className="text-[#8b949e] text-sm mb-6">Esta acción es permanente y no se puede deshacer.</p>
            <div className="flex gap-3">
              <button onClick={() => handleDelete(deleteConfirm)} disabled={deleting} className="flex-1 bg-[#da3633] hover:bg-[#b62324] disabled:opacity-50 text-white py-2.5 rounded-lg font-bold text-sm">
                {deleting ? "Eliminando..." : "Eliminar"}
              </button>
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 bg-[#21262d] text-[#c9d1d9] hover:bg-[#30363d] py-2.5 rounded-lg font-bold text-sm">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk delete modal */}
      {bulkDeleteConfirm && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-[#161b22] border border-[#da3633]/30 rounded-xl p-6 max-w-md w-full">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-[#da3633]/10 flex items-center justify-center"><AlertTriangle className="w-5 h-5 text-[#f85149]" /></div>
              <div>
                <h3 className="text-[#c9d1d9] font-bold">Eliminación Masiva</h3>
                <p className="text-[#f85149] text-sm font-mono">{selected.size} series seleccionadas</p>
              </div>
            </div>
            <p className="text-[#8b949e] text-sm mb-5">Esta acción eliminará permanentemente las series seleccionadas.</p>
            <div className="flex gap-3">
              <button onClick={handleBulkDelete} disabled={deleting} className="flex-1 bg-[#da3633] hover:bg-[#b62324] disabled:opacity-50 text-white py-3 rounded-lg font-bold text-sm">
                {deleting ? "Eliminando..." : `Eliminar ${selected.size} series`}
              </button>
              <button onClick={() => setBulkDeleteConfirm(false)} className="flex-1 bg-[#21262d] text-[#c9d1d9] hover:bg-[#30363d] py-3 rounded-lg font-bold text-sm">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
