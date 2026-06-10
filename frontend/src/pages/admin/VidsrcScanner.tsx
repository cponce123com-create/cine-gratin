import { useState, useRef, useCallback, useEffect } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { getMovies, getSeries, cleanupNoVidsrc } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { BASE_URL } from "@/lib/api";
import type { Movie, Series } from "@/lib/types";

type RowStatus = "pending" | "active" | "inactive";
type ScanRow = {
  imdb_id: string;
  title: string;
  type: "movie" | "series";
  status: RowStatus;
};
type Phase = "idle" | "downloading" | "matching" | "saving" | "done";

interface PageProgress {
  type: "movie" | "series";
  pagesLoaded: number;
  totalPages: number;
}

interface MatchProgress {
  matched: number;
  total: number;
}

interface DonePayload {
  active: number;
  inactive: number;
  total: number;
  moviesActive: number;
  moviesInactive: number;
  seriesActive: number;
  seriesInactive: number;
}

export default function VidsrcScanner() {
  const [rows, setRows] = useState<ScanRow[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState({
    pagesLoaded: { movie: 0, series: 0 },
    totalPages: { movie: 0, series: 0 },
    matched: 0,
    total: 0,
  });
  const [counts, setCounts] = useState({
    active: 0,
    inactive: 0,
    moviesActive: 0,
    moviesInactive: 0,
    seriesActive: 0,
    seriesInactive: 0,
  });
  const [cleaning, setCleaning] = useState(false);
  const [cleanResult, setCleanResult] = useState<{ movies: number; series: number; total: number } | null>(
    null,
  );
  const [typeFilter, setTypeFilter] = useState<"all" | "movie" | "series">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive" | "pending">("all");
  const [error, setError] = useState("");
  const eventSourceRef = useRef<EventSource | null>(null);

  // Load catalog on mount
  useEffect(() => {
    (async () => {
      try {
        const [movies, series] = await Promise.all([getMovies(), getSeries()]);
        const items: ScanRow[] = [
          ...movies
            .filter((m: Movie) => m.imdb_id)
            .map((m: Movie) => ({
              imdb_id: m.imdb_id!,
              title: m.title,
              type: "movie" as const,
              status: (m.vidsrc_status === "active" ? "active" : "pending") as RowStatus,
            })),
          ...series
            .filter((s: Series) => s.imdb_id)
            .map((s: Series) => ({
              imdb_id: s.imdb_id!,
              title: s.title,
              type: "series" as const,
              status: (s.vidsrc_status === "active" ? "active" : "pending") as RowStatus,
            })),
        ];
        setRows(items);
      } catch {
        // ignore
      } finally {
        setLoadingCatalog(false);
      }
    })();
  }, []);

  const cleanup = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  }, []);

  const startScan = useCallback(() => {
    cleanup();
    setError("");
    setPhase("downloading");
    setCounts({
      active: 0,
      inactive: 0,
      moviesActive: 0,
      moviesInactive: 0,
      seriesActive: 0,
      seriesInactive: 0,
    });
    setProgress({
      pagesLoaded: { movie: 0, series: 0 },
      totalPages: { movie: 0, series: 0 },
      matched: 0,
      total: 0,
    });

    const token = getToken();
    const url = `${BASE_URL}/api/admin/vidsrc-scan-stream${token ? `?token=${encodeURIComponent(token)}` : ""}`;
    const es = new EventSource(url);
    eventSourceRef.current = es;

    es.addEventListener("start", (e: MessageEvent) => {
      const data = JSON.parse(e.data) as { totalItems: number };
      setProgress((prev) => ({ ...prev, total: data.totalItems }));
    });

    es.addEventListener("phase", (e: MessageEvent) => {
      const data = JSON.parse(e.data) as { phase: Phase };
      setPhase(data.phase);
    });

    es.addEventListener("page_progress", (e: MessageEvent) => {
      const data = JSON.parse(e.data) as PageProgress;
      setProgress((prev) => ({
        ...prev,
        pagesLoaded: { ...prev.pagesLoaded, [data.type]: data.pagesLoaded },
        totalPages: { ...prev.totalPages, [data.type]: data.totalPages },
      }));
    });

    es.addEventListener("match_progress", (e: MessageEvent) => {
      const data = JSON.parse(e.data) as MatchProgress;
      setProgress((prev) => ({ ...prev, matched: data.matched, total: data.total }));
    });

    es.addEventListener("done", (e: MessageEvent) => {
      const data = JSON.parse(e.data) as DonePayload;
      setCounts({
        active: data.active,
        inactive: data.inactive,
        moviesActive: data.moviesActive,
        moviesInactive: data.moviesInactive,
        seriesActive: data.seriesActive,
        seriesInactive: data.seriesInactive,
      });
      setProgress((prev) => ({ ...prev, matched: data.total, total: data.total }));
      setPhase("done");
      es.close();
      eventSourceRef.current = null;

      // Reload catalog from API to get updated vidsrc_status
      (async () => {
        try {
          const [movies, series] = await Promise.all([getMovies(), getSeries()]);
          const updatedItems: ScanRow[] = [
            ...movies
              .filter((m: Movie) => m.imdb_id)
              .map((m: Movie) => ({
                imdb_id: m.imdb_id!,
                title: m.title,
                type: "movie" as const,
                status: (m.vidsrc_status === "active" ? "active" : "inactive") as RowStatus,
              })),
            ...series
              .filter((s: Series) => s.imdb_id)
              .map((s: Series) => ({
                imdb_id: s.imdb_id!,
                title: s.title,
                type: "series" as const,
                status: (s.vidsrc_status === "active" ? "active" : "inactive") as RowStatus,
              })),
          ];
          setRows(updatedItems);
        } catch {
          /* keep previous rows */
        }
      })();
    });

    es.addEventListener("error", (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data) as { message: string };
        setError(data.message);
      } catch {
        setError("Error en la conexión SSE");
      }
      setPhase("idle");
      es.close();
      eventSourceRef.current = null;
    });

    es.onerror = () => {
      setPhase((prev) => {
        if (prev === "done") return prev;
        setError("Error de conexión con el servidor");
        return "idle";
      });
      es.close();
      eventSourceRef.current = null;
    };
  }, [cleanup]);

  const stopScan = useCallback(() => {
    cleanup();
    setPhase("idle");
  }, [cleanup]);

  // Cleanup on unmount
  useEffect(() => cleanup, [cleanup]);

  const handleCleanup = async () => {
    if (!confirm(`¿Eliminar los ${counts.inactive} títulos sin video? Esta acción no se puede deshacer.`))
      return;
    setCleaning(true);
    setCleanResult(null);
    try {
      const res = await cleanupNoVidsrc();
      setCleanResult(res.summary);
      setRows((prev) => prev.filter((r) => r.status !== "inactive"));
      setCounts((prev) => ({ ...prev, inactive: 0, moviesInactive: 0, seriesInactive: 0 }));
    } catch {
      alert("Error al eliminar los títulos.");
    } finally {
      setCleaning(false);
    }
  };

  const filtered = rows.filter((r) => {
    if (typeFilter !== "all" && r.type !== typeFilter) return false;
    if (statusFilter === "active") return r.status === "active";
    if (statusFilter === "inactive") return r.status === "inactive";
    if (statusFilter === "pending") return r.status === "pending";
    return true;
  });

  const pendingCount = rows.filter((r) => r.status === "pending").length;
  const isScanning = phase === "downloading" || phase === "matching" || phase === "saving";

  const phaseLabel = () => {
    switch (phase) {
      case "downloading":
        const moviePages = progress.pagesLoaded.movie;
        const seriesPages = progress.pagesLoaded.series;
        const movieTotal = progress.totalPages.movie;
        const seriesTotal = progress.totalPages.series;
        if (movieTotal > 0 && seriesTotal === 0)
          return `Descargando películas: ${moviePages}/${movieTotal} páginas`;
        if (seriesTotal > 0 && movieTotal === 0)
          return `Descargando series: ${seriesPages}/${seriesTotal} páginas`;
        if (movieTotal > 0 && seriesTotal > 0)
          return `Descargando: películas ${moviePages}/${movieTotal} · series ${seriesPages}/${seriesTotal}`;
        return "Descargando listas de vidsrc.me...";
      case "matching":
        return `Cruzando catálogo: ${progress.matched} de ${progress.total} títulos`;
      case "saving":
        return "Guardando resultados en la base de datos...";
      case "done":
        return `Completado: ${counts.active} activos · ${counts.inactive} sin video`;
      default:
        return "";
    }
  };

  const downloadPct = () => {
    const totalPages = progress.totalPages.movie + progress.totalPages.series;
    if (totalPages === 0) return 0;
    const loadedPages = progress.pagesLoaded.movie + progress.pagesLoaded.series;
    return Math.round((loadedPages / totalPages) * 55);
  };

  const matchPct = () => {
    if (progress.total === 0) return 0;
    return 55 + Math.round((progress.matched / progress.total) * 40);
  };

  const progressPct = isScanning
    ? phase === "downloading"
      ? Math.max(downloadPct(), 1)
      : Math.min(matchPct(), 95)
    : phase === "done"
      ? 100
      : 0;

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-black text-white">Escáner VIDSRC</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            Descarga la lista completa de vidsrc.me en paralelo y cruza con tu catálogo de {rows.length}{" "}
            títulos. Sin iframes — rápido y preciso.
          </p>
        </div>

        {/* Controls card */}
        <div className="bg-brand-card border border-brand-border rounded-2xl p-5">
          <div className="flex flex-wrap gap-3 items-center justify-between">
            <div className="flex flex-wrap gap-3">
              {/* Type filter */}
              <div className="flex rounded-lg overflow-hidden border border-brand-border text-xs font-semibold">
                {(["all", "movie", "series"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setTypeFilter(f)}
                    className={`px-3 py-1.5 transition-colors ${typeFilter === f ? "bg-brand-red text-white" : "bg-brand-surface text-gray-400 hover:text-white"}`}
                  >
                    {f === "all" ? "Todo" : f === "movie" ? "Películas" : "Series"}
                  </button>
                ))}
              </div>
              {/* Status filter */}
              <div className="flex rounded-lg overflow-hidden border border-brand-border text-xs font-semibold">
                {(["all", "active", "inactive", "pending"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setStatusFilter(f)}
                    className={`px-3 py-1.5 transition-colors ${statusFilter === f ? "bg-brand-red text-white" : "bg-brand-surface text-gray-400 hover:text-white"}`}
                  >
                    {f === "all"
                      ? `Todos (${rows.length})`
                      : f === "active"
                        ? `✅ Activos (${counts.active})`
                        : f === "inactive"
                          ? `❌ Sin video (${counts.inactive})`
                          : `⏳ Pendientes (${pendingCount})`}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-2">
              {!isScanning ? (
                <button
                  onClick={startScan}
                  disabled={loadingCatalog || rows.length === 0}
                  className="flex items-center gap-2 bg-brand-red hover:bg-red-700 text-white text-sm font-bold px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
                >
                  <PlayIcon />{" "}
                  {phase === "done" ? "Volver a escanear" : `Iniciar escaneo (${rows.length} títulos)`}
                </button>
              ) : (
                <button
                  onClick={stopScan}
                  className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 text-white text-sm font-bold px-4 py-2 rounded-lg transition-colors"
                >
                  <StopIcon /> Detener
                </button>
              )}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="mt-4 flex items-center gap-2 bg-red-900/20 border border-red-800/40 rounded-lg px-4 py-3 text-red-400 text-sm">
              <span>⚠️</span> {error}
            </div>
          )}

          {/* Progress */}
          {(isScanning || phase === "done") && !error && (
            <div className="mt-4 space-y-2">
              <div className="flex justify-between text-xs text-gray-400">
                <span>{phaseLabel()}</span>
                {phase === "done" && (
                  <span className="text-gray-500">
                    {counts.moviesActive + (counts.seriesActive ?? 0)} activos ·{" "}
                    {counts.moviesInactive + (counts.seriesInactive ?? 0)} sin video
                  </span>
                )}
              </div>
              <div className="w-full bg-brand-border rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all duration-500 ${phase === "done" ? "bg-green-500" : phase === "saving" ? "bg-yellow-500" : "bg-brand-red"}`}
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              {(phase === "matching" || phase === "saving" || phase === "done") && (
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
                        <>
                          <span className="w-3 h-3 rounded-full border-2 border-red-500 border-t-white animate-spin" />{" "}
                          Eliminando...
                        </>
                      ) : (
                        <>
                          <TrashIcon /> Eliminar {counts.inactive} sin video
                        </>
                      )}
                    </button>
                  )}
                </div>
              )}
              {cleanResult && (
                <div className="mt-2 text-xs text-green-400 bg-green-900/15 border border-green-800/30 rounded-lg px-3 py-2">
                  ✅ Eliminados: {cleanResult.movies} películas y {cleanResult.series} series (
                  {cleanResult.total} en total)
                </div>
              )}
            </div>
          )}

          {phase === "idle" && rows.length > 0 && !error && (
            <p className="mt-3 text-xs text-gray-600">
              El escáner descarga la lista pública de vidsrc.me y la cruza con tus {rows.length} títulos.
              Descarga en paralelo — mucho más rápido que antes.
            </p>
          )}
        </div>

        {/* Table */}
        <div className="bg-brand-card border border-brand-border rounded-2xl overflow-hidden">
          <div className="px-5 py-3 border-b border-brand-border">
            <span className="text-white font-semibold text-sm">
              {filtered.length} título{filtered.length !== 1 ? "s" : ""}{" "}
              {statusFilter !== "all"
                ? `(${statusFilter === "active" ? "activos" : statusFilter === "inactive" ? "sin video" : "pendientes"})`
                : ""}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-brand-border">
                  <th className="text-left px-5 py-3 text-gray-500 font-medium text-xs uppercase tracking-wider">
                    Título
                  </th>
                  <th className="text-center px-4 py-3 text-gray-500 font-medium text-xs uppercase tracking-wider">
                    Tipo
                  </th>
                  <th className="text-center px-4 py-3 text-gray-500 font-medium text-xs uppercase tracking-wider">
                    IMDb
                  </th>
                  <th className="text-center px-5 py-3 text-gray-500 font-medium text-xs uppercase tracking-wider">
                    vidsrc.me
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="text-center py-16 text-gray-500 text-sm">
                      {loadingCatalog
                        ? "Cargando catálogo..."
                        : phase === "idle"
                          ? "Pulsa «Iniciar escaneo» para comenzar"
                          : "No hay títulos con ese filtro"}
                    </td>
                  </tr>
                ) : (
                  filtered.map((row) => (
                    <tr
                      key={row.imdb_id}
                      className="border-b border-brand-border last:border-0 hover:bg-brand-surface/40 transition-colors"
                    >
                      <td className="px-5 py-3 text-gray-200 font-medium truncate max-w-xs">{row.title}</td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${row.type === "movie" ? "bg-blue-900/40 text-blue-400" : "bg-purple-900/40 text-purple-400"}`}
                        >
                          {row.type === "movie" ? "Película" : "Serie"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <a
                          href={`https://www.imdb.com/title/${row.imdb_id}/`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-gray-500 hover:text-white font-mono text-xs transition-colors"
                        >
                          {row.imdb_id}
                        </a>
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
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}

function PlayIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  );
}
function TrashIcon() {
  return (
    <svg
      className="w-3.5 h-3.5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}
function StopIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
      <rect x="3" y="3" width="18" height="18" rx="2" />
    </svg>
  );
}
