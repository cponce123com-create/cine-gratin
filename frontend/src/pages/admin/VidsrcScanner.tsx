import { useState, useRef, useCallback, useEffect } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { getMovies, getSeries, saveVidsrcResults, cleanupNoVidsrc } from "@/lib/api";
import type { Movie, Series } from "@/lib/types";

type RowStatus = "pending" | "active" | "inactive";
type ScanRow = {
  imdb_id: string;
  title: string;
  type: "movie" | "series";
  status: RowStatus;
};
type Phase = "idle" | "downloading" | "matching" | "done";

export default function VidsrcScanner() {
  const [rows, setRows] = useState<ScanRow[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState({ pagesLoaded: 0, totalPages: 0, matched: 0, total: 0 });
  const [counts, setCounts] = useState({ active: 0, inactive: 0 });
  const [cleaning, setCleaning] = useState(false);
  const [cleanResult, setCleanResult] = useState<{ movies: number; series: number; total: number } | null>(null);
  const [typeFilter, setTypeFilter] = useState<"all" | "movie" | "series">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive" | "pending">("all");
  const stopRef = useRef(false);

  const loadCatalog = useCallback(async () => {
    setLoadingCatalog(true);
    try {
      const [movies, series] = await Promise.all([getMovies(), getSeries()]);
      const items: ScanRow[] = [
        ...movies.filter((m: Movie) => m.imdb_id).map((m: Movie) => ({
          imdb_id: m.imdb_id!, title: m.title, type: "movie" as const, status: "pending" as RowStatus,
        })),
        ...series.filter((s: Series) => s.imdb_id).map((s: Series) => ({
          imdb_id: s.imdb_id!, title: s.title, type: "series" as const, status: "pending" as RowStatus,
        })),
      ];
      setRows(items);
    } finally {
      setLoadingCatalog(false);
    }
  }, []);

  useEffect(() => { loadCatalog(); }, [loadCatalog]);

  // Descarga la lista completa de vidsrc.me en rangos de 50 páginas
  // 3 rangos en paralelo, con reintentos en caso de fallo
  const fetchVidsrcMovSet = async (type: "movie" | "series"): Promise<Set<string>> => {
    const token = localStorage.getItem("cg_admin_token") ?? "";
    const headers: Record<string, string> = token ? { "Authorization": `Bearer ${token}` } : {};
    const available = new Set<string>();
    const RANGE = 50;   // páginas por llamada (más pequeño = menos timeout)
    const PARALLEL = 3; // rangos simultáneos
    const RETRIES = 2;  // reintentos por rango fallido

    const fetchRange = async (from: number, to: number): Promise<string[]> => {
      for (let attempt = 0; attempt <= RETRIES; attempt++) {
        try {
          const res = await fetch(`/api/admin/vidsrc-range?type=${type}&from=${from}&to=${to}`, { headers });
          if (!res.ok) continue;
          const data = await res.json() as { imdb_ids?: string[]; totalPages?: number };
          return data.imdb_ids ?? [];
        } catch { /* reintento */ }
      }
      return [];
    };

    // Primera llamada para obtener totalPages
    let totalPages = RANGE;
    try {
      const res = await fetch(`/api/admin/vidsrc-range?type=${type}&from=1&to=${RANGE}`, { headers });
      if (!res.ok) { console.error(`[vidsrc-range] HTTP ${res.status}`); return available; }
      const data = await res.json() as { totalPages?: number; imdb_ids?: string[] };
      console.log(`[vidsrc-range] type=${type} totalPages=${data.totalPages} ids=${data.imdb_ids?.length}`);
      totalPages = data.totalPages ?? RANGE;
      for (const id of data.imdb_ids ?? []) available.add(id);
      setProgress(p => ({ ...p, pagesLoaded: p.pagesLoaded + Math.min(RANGE, totalPages), totalPages: p.totalPages || totalPages }));
    } catch (e) { console.error("[vidsrc-range] catch:", e); return available; }

    // Resto de rangos en grupos de PARALLEL en paralelo
    const allRanges: [number, number][] = [];
    for (let from = RANGE + 1; from <= totalPages; from += RANGE) {
      allRanges.push([from, Math.min(from + RANGE - 1, totalPages)]);
    }

    for (let i = 0; i < allRanges.length; i += PARALLEL) {
      if (stopRef.current) break;
      const batch = allRanges.slice(i, i + PARALLEL);
      const results = await Promise.all(batch.map(([from, to]) => fetchRange(from, to)));
      for (const ids of results) {
        for (const id of ids) available.add(id);
      }
      const pagesLoaded = batch[batch.length - 1][1]; // última página del batch
      setProgress(p => ({ ...p, pagesLoaded: p.pagesLoaded + batch.reduce((s, [f, t]) => s + (t - f + 1), 0) }));
      void pagesLoaded; // suppress unused warning
    }
    return available;
  };

  const handleCleanup = async () => {
    if (!confirm(`¿Eliminar los ${counts.inactive} títulos sin video? Esta acción no se puede deshacer.`)) return;
    setCleaning(true);
    setCleanResult(null);
    try {
      const res = await cleanupNoVidsrc();
      setCleanResult(res.summary);
      // Remove deleted rows from table
      setRows(prev => prev.filter(r => r.status !== "inactive"));
      setCounts(prev => ({ ...prev, inactive: 0 }));
    } catch {
      alert("Error al eliminar los títulos.");
    } finally {
      setCleaning(false);
    }
  };

  const startScan = async () => {
    stopRef.current = false;
    setPhase("downloading");
    setCounts({ active: 0, inactive: 0 });

    // IMPORTANTE: guardar snapshot del catálogo ANTES de resetear el estado
    // porque dentro del closure async, "rows" no se actualiza con setRows()
    const catalog = rows.map(r => ({ ...r, status: "pending" as RowStatus }));
    setRows(catalog);
    setProgress({ pagesLoaded: 0, totalPages: 0, matched: 0, total: catalog.length });

    try {
      // Descargar listas de vidsrc.me en paralelo
      const [movieSet, tvSet] = await Promise.all([
        fetchVidsrcMovSet("movie"),
        fetchVidsrcMovSet("series"),
      ]);

      if (stopRef.current) { setPhase("idle"); return; }

      setPhase("matching");
      const total = catalog.length;
      let matched = 0, active = 0, inactive = 0;
      const toSave: { imdb_id: string; type: "movie" | "series"; available: boolean }[] = [];

      // Usar catalog (snapshot local) en vez de rows (estado React desactualizado)
      const updatedRows = catalog.map(row => {
        const isAvailable = row.type === "movie"
          ? movieSet.has(row.imdb_id)
          : tvSet.has(row.imdb_id);
        const status: RowStatus = isAvailable ? "active" : "inactive";
        if (isAvailable) active++; else inactive++;
        matched++;
        toSave.push({ imdb_id: row.imdb_id, type: row.type, available: isAvailable });
        return { ...row, status };
      });

      setRows(updatedRows);
      setProgress({ pagesLoaded: 0, totalPages: 0, matched, total });
      setCounts({ active, inactive });

      // Guardar en BD en lotes de 100
      for (let i = 0; i < toSave.length; i += 100) {
        await saveVidsrcResults(toSave.slice(i, i + 100)).catch(() => {});
      }

      setPhase("done");
    } catch {
      setPhase("idle");
    }
  };

  const stopScan = () => { stopRef.current = true; };

  const filtered = rows.filter(r => {
    if (typeFilter !== "all" && r.type !== typeFilter) return false;
    if (statusFilter === "active") return r.status === "active";
    if (statusFilter === "inactive") return r.status === "inactive";
    if (statusFilter === "pending") return r.status === "pending";
    return true;
  });

  const pendingCount = rows.filter(r => r.status === "pending").length;
  const isScanning = phase === "downloading" || phase === "matching";
  const pct = progress.total > 0
    ? Math.round((phase === "matching" ? progress.matched : progress.pagesLoaded * 20) / Math.max(progress.total, 1) * 100)
    : 0;

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-black text-white">Escáner VIDSRC</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            Descarga la lista completa de vidsrc.me y cruza con tu catálogo. Sin iframes — rápido y preciso.
          </p>
        </div>

        {/* Controls card */}
        <div className="bg-brand-card border border-brand-border rounded-2xl p-5">
          <div className="flex flex-wrap gap-3 items-center justify-between">
            <div className="flex flex-wrap gap-3">
              {/* Type filter */}
              <div className="flex rounded-lg overflow-hidden border border-brand-border text-xs font-semibold">
                {(["all","movie","series"] as const).map(f => (
                  <button key={f} onClick={() => setTypeFilter(f)}
                    className={`px-3 py-1.5 transition-colors ${typeFilter === f ? "bg-brand-red text-white" : "bg-brand-surface text-gray-400 hover:text-white"}`}>
                    {f === "all" ? "Todo" : f === "movie" ? "Películas" : "Series"}
                  </button>
                ))}
              </div>
              {/* Status filter */}
              <div className="flex rounded-lg overflow-hidden border border-brand-border text-xs font-semibold">
                {(["all","active","inactive","pending"] as const).map(f => (
                  <button key={f} onClick={() => setStatusFilter(f)}
                    className={`px-3 py-1.5 transition-colors ${statusFilter === f ? "bg-brand-red text-white" : "bg-brand-surface text-gray-400 hover:text-white"}`}>
                    {f === "all" ? `Todos (${rows.length})` : f === "active" ? `✅ Activos (${counts.active})` : f === "inactive" ? `❌ Sin video (${counts.inactive})` : `⏳ Pendientes (${pendingCount})`}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-2">
              {!isScanning ? (
                <button onClick={startScan} disabled={loadingCatalog || rows.length === 0}
                  className="flex items-center gap-2 bg-brand-red hover:bg-red-700 text-white text-sm font-bold px-4 py-2 rounded-lg transition-colors disabled:opacity-50">
                  <PlayIcon /> {phase === "done" ? "Volver a escanear" : `Iniciar escaneo (${rows.length} títulos)`}
                </button>
              ) : (
                <button onClick={stopScan}
                  className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 text-white text-sm font-bold px-4 py-2 rounded-lg transition-colors">
                  <StopIcon /> Detener
                </button>
              )}
            </div>
          </div>

          {/* Progress */}
          {(isScanning || phase === "done") && (
            <div className="mt-4 space-y-2">
              <div className="flex justify-between text-xs text-gray-400">
                <span>
                  {phase === "downloading" && `Descargando lista de vidsrc.me... ${progress.pagesLoaded} páginas descargadas`}
                  {phase === "matching" && `Cruzando catálogo: ${progress.matched} de ${progress.total} títulos`}
                  {phase === "done" && `Completado: ${progress.total} títulos verificados`}
                </span>
                <span className="text-gray-500">
                  {phase === "done" && `${counts.active} activos · ${counts.inactive} sin video`}
                </span>
              </div>
              <div className="w-full bg-brand-border rounded-full h-2">
                <div className={`h-2 rounded-full transition-all duration-500 ${phase === "done" ? "bg-green-500" : "bg-brand-red"}`}
                  style={{ width: phase === "done" ? "100%" : phase === "downloading" ? "33%" : `${Math.min(pct, 99)}%` }} />
              </div>
              {(phase === "matching" || phase === "done") && (
                <div className="flex flex-wrap items-center gap-4 pt-0.5">
                  <span className="text-green-400 text-xs">✅ {counts.active} con video en vidsrc.me</span>
                  <span className="text-red-400 text-xs">❌ {counts.inactive} sin video</span>
                  {phase === "done" && counts.inactive > 0 && (
                    <button
                      onClick={handleCleanup}
                      disabled={cleaning}
                      className="flex items-center gap-1.5 bg-red-900/20 border border-red-800/40 hover:bg-red-900/30 text-red-400 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 ml-auto"
                    >
                      {cleaning ? (
                        <><span className="w-3 h-3 rounded-full border-2 border-red-500 border-t-white animate-spin" /> Eliminando...</>
                      ) : (
                        <><TrashIcon /> Eliminar {counts.inactive} sin video</>
                      )}
                    </button>
                  )}
                </div>
              )}
              {cleanResult && (
                <div className="mt-2 text-xs text-green-400 bg-green-900/15 border border-green-800/30 rounded-lg px-3 py-2">
                  ✅ Eliminados: {cleanResult.movies} películas y {cleanResult.series} series ({cleanResult.total} en total)
                </div>
              )}
            </div>
          )}

          {phase === "idle" && rows.length > 0 && (
            <p className="mt-3 text-xs text-gray-600">
              El escáner descarga la lista pública de vidsrc.me y la cruza con tus {rows.length} títulos. No usa iframes.
            </p>
          )}
        </div>

        {/* Table */}
        <div className="bg-brand-card border border-brand-border rounded-2xl overflow-hidden">
          <div className="px-5 py-3 border-b border-brand-border">
            <span className="text-white font-semibold text-sm">
              {filtered.length} título{filtered.length !== 1 ? "s" : ""} {statusFilter !== "all" ? `(${statusFilter === "active" ? "activos" : statusFilter === "inactive" ? "sin video" : "pendientes"})` : ""}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-brand-border">
                  <th className="text-left px-5 py-3 text-gray-500 font-medium text-xs uppercase tracking-wider">Título</th>
                  <th className="text-center px-4 py-3 text-gray-500 font-medium text-xs uppercase tracking-wider">Tipo</th>
                  <th className="text-center px-4 py-3 text-gray-500 font-medium text-xs uppercase tracking-wider">IMDb</th>
                  <th className="text-center px-5 py-3 text-gray-500 font-medium text-xs uppercase tracking-wider">vidsrc.me</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={4} className="text-center py-16 text-gray-500 text-sm">
                    {loadingCatalog ? "Cargando catálogo..." : phase === "idle" ? "Pulsa «Iniciar escaneo» para comenzar" : "No hay títulos con ese filtro"}
                  </td></tr>
                ) : filtered.map(row => (
                  <tr key={row.imdb_id} className="border-b border-brand-border last:border-0 hover:bg-brand-surface/40 transition-colors">
                    <td className="px-5 py-3 text-gray-200 font-medium truncate max-w-xs">{row.title}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${row.type === "movie" ? "bg-blue-900/40 text-blue-400" : "bg-purple-900/40 text-purple-400"}`}>
                        {row.type === "movie" ? "Película" : "Serie"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <a href={`https://www.imdb.com/title/${row.imdb_id}/`} target="_blank" rel="noreferrer"
                        className="text-gray-500 hover:text-white font-mono text-xs transition-colors">{row.imdb_id}</a>
                    </td>
                    <td className="px-5 py-3 text-center">
                      {row.status === "pending" && <span className="text-gray-600 text-xs">—</span>}
                      {row.status === "active" && (
                        <span className="inline-flex items-center gap-1 bg-green-900/30 text-green-400 text-xs font-semibold px-2.5 py-1 rounded-full border border-green-800/40">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-400" /> Activo
                        </span>
                      )}
                      {row.status === "inactive" && (
                        <span className="inline-flex items-center gap-1 bg-red-900/20 text-red-400 text-xs font-semibold px-2.5 py-1 rounded-full border border-red-800/40">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-400" /> Sin video
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}

function PlayIcon() {
  return <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3" /></svg>;
}
function TrashIcon() {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}
function StopIcon() {
  return <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="3" width="18" height="18" rx="2" /></svg>;
}
