import { useState, useEffect, useCallback } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import StatsCard from "@/components/admin/StatsCard";
import TopContentList from "@/components/admin/TopContentList";
import TrendsChart from "@/components/admin/TrendsChart";
import {
  getAutoImportStatus,
  toggleAutoImport,
  runAutoImport,
  getAdminStats,
  cleanupMissingImages,
  cleanupNoVidsrc,
  getMovies,
  getSeries,
  verifyVidsrc,
} from "@/lib/api";
import type { AutoImportStatus, AutoImportLog, RunImportResult, AdminStats } from "@/lib/types";

function formatDate(iso: string) {
  try {
    return new Intl.DateTimeFormat("es", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export default function AdminDashboard() {
  const [status, setStatus] = useState<AutoImportStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [statusError, setStatusError] = useState("");

  const [stats, setStats] = useState<AdminStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState("");

  const [toggling, setToggling] = useState(false);
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<RunImportResult | null>(null);
  const [runError, setRunError] = useState("");
  const [cleaning, setCleaning] = useState(false);

  type VidsrcPhase = "idle" | "fetching" | "verifying" | "done" | "cleaning";
  const [vidsrcPhase, setVidsrcPhase] = useState<VidsrcPhase>("idle");
  const [vidsrcCleaning, setVidsrcCleaning] = useState(false);
  const [vidsrcProgress, setVidsrcProgress] = useState({ checked: 0, total: 0 });
  const [vidsrcCounts, setVidsrcCounts] = useState({ active: 0, inactive: 0 });
  const [vidsrcCleanResult, setVidsrcCleanResult] = useState<{ movies: number; series: number; total: number } | null>(null);

  const loadStatus = useCallback(async () => {
    setStatusLoading(true);
    setStatusError("");
    try {
      const data = await getAutoImportStatus();
      setStatus(data);
    } catch (err: unknown) {
      setStatusError(err instanceof Error ? err.message : "Error al cargar estado.");
    } finally {
      setStatusLoading(false);
    }
  }, []);

  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    setStatsError("");
    try {
      const data = await getAdminStats();
      setStats(data);
    } catch (err: unknown) {
      setStatsError(err instanceof Error ? err.message : "Error al cargar estadísticas.");
    } finally {
      setStatsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
    loadStats();
  }, [loadStatus, loadStats]);

  const handleToggle = async () => {
    if (!status) return;
    setToggling(true);
    try {
      const newEnabled = !status.enabled;
      await toggleAutoImport(newEnabled);
      setStatus((prev) => (prev ? { ...prev, enabled: newEnabled } : prev));
    } catch {
      // silently fail — user can refresh
    } finally {
      setToggling(false);
    }
  };

  const handleRun = async () => {
    setRunning(true);
    setRunResult(null);
    setRunError("");
    try {
      const result = await runAutoImport();
      setRunResult(result);
      await loadStatus();
      await loadStats();
    } catch (err: unknown) {
      setRunError(err instanceof Error ? err.message : "Error al importar.");
    } finally {
      setRunning(false);
    }
  };

  const handleCleanup = async () => {
    if (!confirm("¿Estás seguro de eliminar todas las películas y series que no tengan póster? Esta acción no se puede deshacer.")) return;
    setCleaning(true);
    try {
      const res = await cleanupMissingImages("all");
      alert(`Limpieza completada: Se eliminaron ${res.summary.movies} películas y ${res.summary.series} series sin imagen.`);
      await loadStats();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Error al realizar la limpieza.");
    } finally {
      setCleaning(false);
    }
  };

  const handleVerifyVidsrc = async () => {
    setVidsrcPhase("fetching");
    setVidsrcProgress({ checked: 0, total: 0 });
    setVidsrcCounts({ active: 0, inactive: 0 });
    setVidsrcCleanResult(null);
    try {
      const [movies, series] = await Promise.all([getMovies(), getSeries()]);
      const movieIds = movies.filter((m) => m.imdb_id).map((m) => m.imdb_id!);
      const seriesIds = series.filter((s) => s.imdb_id).map((s) => s.imdb_id!);
      const total = movieIds.length + seriesIds.length;
      setVidsrcProgress({ checked: 0, total });
      setVidsrcPhase("verifying");

      let active = 0, inactive = 0, checked = 0;
      const BATCH = 50;

      for (let i = 0; i < movieIds.length; i += BATCH) {
        const results = await verifyVidsrc(movieIds.slice(i, i + BATCH), "movie");
        results.forEach((r) => { if (r.available) active++; else inactive++; checked++; });
        setVidsrcProgress({ checked, total });
        setVidsrcCounts({ active, inactive });
      }
      for (let i = 0; i < seriesIds.length; i += BATCH) {
        const results = await verifyVidsrc(seriesIds.slice(i, i + BATCH), "series");
        results.forEach((r) => { if (r.available) active++; else inactive++; checked++; });
        setVidsrcProgress({ checked, total });
        setVidsrcCounts({ active, inactive });
      }
      setVidsrcPhase("done");
    } catch (err: unknown) {
      setVidsrcPhase("idle");
      alert(err instanceof Error ? err.message : "Error al verificar VIDSRC.");
    }
  };

  const handleCleanupVidsrc = async () => {
    if (!confirm(`¿Eliminar ${vidsrcCounts.inactive} título(s) sin video en VIDSRC? Esta acción no se puede deshacer.`)) return;
    setVidsrcPhase("cleaning");
    setVidsrcCleaning(true);
    try {
      const res = await cleanupNoVidsrc();
      setVidsrcCleanResult(res.summary);
      setVidsrcCounts({ active: 0, inactive: 0 });
      setVidsrcPhase("idle");
      await loadStats();
    } catch (err: unknown) {
      setVidsrcPhase("done");
      alert(err instanceof Error ? err.message : "Error al eliminar.");
    } finally {
      setVidsrcCleaning(false);
    }
  };

  const logs: AutoImportLog[] = status?.logs ?? [];

  return (
    <AdminLayout>
      <div className="space-y-8">
        {/* Page header */}
        <div>
          <h1 className="text-2xl font-black text-white">Dashboard</h1>
          <p className="text-gray-500 text-sm mt-0.5">Panel de administración de Cine Gratín</p>
        </div>

        {/* Global statistics cards */}
        {statsError && (
          <div className="flex items-center gap-2 bg-red-900/20 border border-red-800/40 rounded-lg px-4 py-3 text-red-400 text-sm">
            {statsError}
          </div>
        )}

        {statsLoading ? (
          <div className="flex items-center gap-3 text-gray-500 text-sm">
            <span className="w-4 h-4 rounded-full border-2 border-gray-600 border-t-gray-300 animate-spin flex-shrink-0" />
            Cargando estadísticas...
          </div>
        ) : stats ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <StatsCard
              title="Total de películas"
              value={stats.global.movies}
              color="blue"
              icon="🎬"
            />
            <StatsCard
              title="Total de series"
              value={stats.global.series}
              color="purple"
              icon="📺"
            />
            <StatsCard
              title="Total de vistas"
              value={stats.global.totalViews}
              color="red"
              icon="👁️"
            />
          </div>
        ) : null}

        {/* Trends chart */}
        {stats && (
          <TrendsChart data={stats.trends} />
        )}

        {/* Top 10 content */}
        {stats && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <TopContentList
              title="Top 10 Películas más vistas"
              items={stats.top10.movies}
              type="movies"
            />
            <TopContentList
              title="Top 10 Series más vistas"
              items={stats.top10.series}
              type="series"
            />
          </div>
        )}

        {/* VIDSRC verification card */}
        <div className="bg-brand-card border border-brand-border rounded-2xl p-6">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <h2 className="text-white font-bold text-base mb-1">Verificar disponibilidad en VIDSRC</h2>
              <p className="text-gray-500 text-sm">
                Comprueba si cada título tiene video disponible en VIDSRC. Los títulos sin video pueden eliminarse automáticamente.
              </p>
            </div>
          </div>

          {/* Progress bar while verifying */}
          {(vidsrcPhase === "verifying" || vidsrcPhase === "fetching") && (
            <div className="mb-4">
              <div className="flex items-center justify-between text-xs text-gray-400 mb-1.5">
                <span>
                  {vidsrcPhase === "fetching" ? "Cargando catálogo..." : `Verificando ${vidsrcProgress.checked} de ${vidsrcProgress.total}...`}
                </span>
                {vidsrcPhase === "verifying" && vidsrcProgress.total > 0 && (
                  <span>{Math.round((vidsrcProgress.checked / vidsrcProgress.total) * 100)}%</span>
                )}
              </div>
              <div className="w-full bg-brand-border rounded-full h-1.5">
                <div
                  className="bg-brand-red h-1.5 rounded-full transition-all duration-300"
                  style={{ width: vidsrcPhase === "fetching" ? "5%" : `${vidsrcProgress.total > 0 ? (vidsrcProgress.checked / vidsrcProgress.total) * 100 : 0}%` }}
                />
              </div>
              {vidsrcPhase === "verifying" && (
                <div className="flex gap-4 mt-2 text-xs">
                  <span className="text-green-400">{vidsrcCounts.active} activos</span>
                  <span className="text-red-400">{vidsrcCounts.inactive} inactivos</span>
                </div>
              )}
            </div>
          )}

          {/* Results after verification */}
          {vidsrcPhase === "done" && (
            <div className="mb-4 flex flex-wrap gap-4 bg-brand-surface border border-brand-border rounded-xl px-5 py-4">
              <div className="text-center">
                <p className="text-2xl font-black text-green-400">{vidsrcCounts.active}</p>
                <p className="text-xs text-gray-400 mt-0.5">con video</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-black text-red-400">{vidsrcCounts.inactive}</p>
                <p className="text-xs text-gray-400 mt-0.5">sin video</p>
              </div>
            </div>
          )}

          {/* Cleanup result */}
          {vidsrcCleanResult && (
            <div className="mb-4 bg-green-900/15 border border-green-800/30 rounded-xl px-5 py-4 text-sm text-green-400">
              Eliminados: {vidsrcCleanResult.movies} películas y {vidsrcCleanResult.series} series ({vidsrcCleanResult.total} en total).
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            <button
              onClick={handleVerifyVidsrc}
              disabled={vidsrcPhase !== "idle" && vidsrcPhase !== "done"}
              className="flex items-center gap-2 bg-brand-surface border border-brand-border hover:border-gray-500 text-gray-200 hover:text-white text-sm font-semibold py-2 px-4 rounded-lg transition-colors disabled:opacity-50"
            >
              {vidsrcPhase === "fetching" || vidsrcPhase === "verifying" ? (
                <>
                  <span className="w-3.5 h-3.5 rounded-full border-2 border-gray-500 border-t-white animate-spin" />
                  Verificando...
                </>
              ) : (
                <>
                  <WifiIcon />
                  {vidsrcPhase === "done" ? "Verificar de nuevo" : "Verificar catálogo"}
                </>
              )}
            </button>

            {vidsrcPhase === "done" && vidsrcCounts.inactive > 0 && (
              <button
                onClick={handleCleanupVidsrc}
                disabled={vidsrcCleaning}
                className="flex items-center gap-2 bg-red-900/20 border border-red-800/40 hover:bg-red-900/30 text-red-400 text-sm font-semibold py-2 px-4 rounded-lg transition-colors disabled:opacity-50"
              >
                <TrashIcon />
                Eliminar {vidsrcCounts.inactive} sin video
              </button>
            )}
          </div>
        </div>

        {/* Cleanup tool card */}
        <div className="bg-brand-card border border-brand-border rounded-2xl p-6">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <h2 className="text-white font-bold text-base mb-1">Limpieza de catálogo</h2>
              <p className="text-gray-500 text-sm">
                Elimina automáticamente todo el contenido que no tenga una imagen de póster válida.
              </p>
            </div>
          </div>
          <button
            onClick={handleCleanup}
            disabled={cleaning}
            className="flex items-center gap-2 bg-red-900/20 border border-red-800/40 hover:bg-red-900/30 text-red-400 text-sm font-semibold py-2 px-4 rounded-lg transition-colors disabled:opacity-50"
          >
            {cleaning ? (
              <>
                <span className="w-3.5 h-3.5 rounded-full border-2 border-red-500 border-t-white animate-spin" />
                Limpiando...
              </>
            ) : (
              <>
                <TrashIcon />
                Eliminar contenido sin imagen
              </>
            )}
          </button>
        </div>

        {/* Auto-import status card */}
        <div className="bg-brand-card border border-brand-border rounded-2xl p-6">
          <div className="flex items-start justify-between gap-4 mb-6">
            <div>
              <h2 className="text-white font-bold text-base mb-1">Auto-importación TMDB</h2>
              <p className="text-gray-500 text-sm">
                Importa automáticamente películas y series desde TMDB cada día a las 03:00.
              </p>
            </div>
            <button
              onClick={loadStatus}
              disabled={statusLoading}
              className="text-gray-500 hover:text-white transition-colors disabled:opacity-40"
              title="Recargar estado"
            >
              <RefreshIcon spinning={statusLoading} />
            </button>
          </div>

          {statusError && (
            <div className="mb-5 flex items-center gap-2 bg-red-900/20 border border-red-800/40 rounded-lg px-4 py-3 text-red-400 text-sm">
              {statusError}
            </div>
          )}

          {statusLoading && !status ? (
            <div className="flex items-center gap-3 text-gray-500 text-sm">
              <span className="w-4 h-4 rounded-full border-2 border-gray-600 border-t-gray-300 animate-spin flex-shrink-0" />
              Cargando estado...
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-4">
              {/* Status badge */}
              <div className="flex items-center gap-2">
                <div
                  className={`w-2.5 h-2.5 rounded-full ${
                    status?.enabled ? "bg-green-400" : "bg-gray-600"
                  }`}
                />
                <span className={`text-sm font-semibold ${status?.enabled ? "text-green-400" : "text-gray-500"}`}>
                  {status?.enabled ? "Activado" : "Desactivado"}
                </span>
              </div>

              {/* Toggle */}
              <button
                onClick={handleToggle}
                disabled={toggling || !status}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none disabled:opacity-50 ${
                  status?.enabled ? "bg-brand-red" : "bg-brand-border"
                }`}
                role="switch"
                aria-checked={status?.enabled ?? false}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                    status?.enabled ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>

              {/* Run now button */}
              <button
                onClick={handleRun}
                disabled={running}
                className="flex items-center gap-2 bg-brand-surface border border-brand-border hover:border-gray-500 text-gray-200 hover:text-white text-sm font-semibold py-2 px-4 rounded-lg transition-colors disabled:opacity-50 ml-auto"
              >
                {running ? (
                  <>
                    <span className="w-3.5 h-3.5 rounded-full border-2 border-gray-500 border-t-white animate-spin" />
                    Importando...
                  </>
                ) : (
                  <>
                    <DownloadIcon />
                    Importar ahora
                  </>
                )}
              </button>
            </div>
          )}

          {/* Run result */}
          {runResult && (
            <div className="mt-4 flex flex-wrap gap-4 bg-green-900/15 border border-green-800/30 rounded-xl px-5 py-4">
              <div className="text-center">
                <p className="text-2xl font-black text-green-400">{runResult.movies_imported}</p>
                <p className="text-xs text-gray-400 mt-0.5">películas importadas</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-black text-green-400">{runResult.series_imported}</p>
                <p className="text-xs text-gray-400 mt-0.5">series importadas</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-black text-gray-300">{runResult.total_checked}</p>
                <p className="text-xs text-gray-400 mt-0.5">revisados</p>
              </div>
            </div>
          )}

          {runError && (
            <div className="mt-4 bg-red-900/20 border border-red-800/40 rounded-lg px-4 py-3 text-red-400 text-sm">
              {runError}
            </div>
          )}
        </div>

        {/* Import logs table */}
        <div className="bg-brand-card border border-brand-border rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-brand-border">
            <h2 className="text-white font-bold text-base">Últimas importaciones</h2>
          </div>

          {logs.length === 0 && !statusLoading ? (
            <div className="px-6 py-12 text-center text-gray-500 text-sm">
              No hay registros de importación aún.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-brand-border">
                    <th className="text-left px-6 py-3 text-gray-500 font-medium text-xs uppercase tracking-wider">
                      Fecha
                    </th>
                    <th className="text-center px-4 py-3 text-gray-500 font-medium text-xs uppercase tracking-wider">
                      Películas
                    </th>
                    <th className="text-center px-4 py-3 text-gray-500 font-medium text-xs uppercase tracking-wider">
                      Series
                    </th>
                    <th className="text-center px-4 py-3 text-gray-500 font-medium text-xs uppercase tracking-wider">
                      Revisados
                    </th>
                    <th className="text-center px-4 py-3 text-gray-500 font-medium text-xs uppercase tracking-wider">
                      Estado
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {logs.slice(0, 5).map((log, idx) => (
                    <tr
                      key={log.id ?? idx}
                      className="border-b border-brand-border last:border-0 hover:bg-brand-surface/50 transition-colors"
                    >
                      <td className="px-6 py-3.5 text-gray-300 font-mono text-xs whitespace-nowrap">
                        {formatDate(log.run_at)}
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <span className="text-green-400 font-bold">+{log.movies_imported}</span>
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <span className="text-blue-400 font-bold">+{log.series_imported}</span>
                      </td>
                      <td className="px-4 py-3.5 text-center text-gray-400">
                        {log.total_checked}
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        {log.status === "success" ? (
                          <span className="inline-flex items-center gap-1 bg-green-900/30 text-green-400 text-xs font-semibold px-2.5 py-1 rounded-full border border-green-800/40">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                            OK
                          </span>
                        ) : (
                          <span
                            className="inline-flex items-center gap-1 bg-red-900/30 text-red-400 text-xs font-semibold px-2.5 py-1 rounded-full border border-red-800/40 cursor-help"
                            title={log.error_message ?? "Error desconocido"}
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                            Error
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}

function RefreshIcon({ spinning }: { spinning?: boolean }) {
  return (
    <svg
      className={`w-4 h-4 ${spinning ? "animate-spin" : ""}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" strokeLinecap="round" />
      <path d="M21 3v5h-5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" strokeLinecap="round" />
      <path d="M8 16H3v5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

function WifiIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12.55a11 11 0 0 1 14.08 0" />
      <path d="M1.42 9a16 16 0 0 1 21.16 0" />
      <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
      <circle cx="12" cy="20" r="1" fill="currentColor" />
    </svg>
  );
}
