import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { logout } from "@/lib/auth";
import {
  getAutoImportStatus,
  toggleAutoImport,
  runAutoImport,
} from "@/lib/api";
import type { AutoImportStatus, AutoImportLog, RunImportResult } from "@/lib/types";

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
  const navigate = useNavigate();

  const [status, setStatus] = useState<AutoImportStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [statusError, setStatusError] = useState("");

  const [toggling, setToggling] = useState(false);
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<RunImportResult | null>(null);
  const [runError, setRunError] = useState("");

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

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

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
      // Refresh logs after run
      await loadStatus();
    } catch (err: unknown) {
      setRunError(err instanceof Error ? err.message : "Error al importar.");
    } finally {
      setRunning(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate("/admin/login", { replace: true });
  };

  const logs: AutoImportLog[] = status?.logs ?? [];

  return (
    <div className="min-h-screen bg-brand-dark">
      {/* Top bar */}
      <header className="bg-brand-card border-b border-brand-border sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <span className="text-brand-red font-black text-base tracking-tight">CINE</span>
              <span className="text-brand-gold font-black text-base tracking-tight">GRATIN</span>
            </div>
            <span className="text-brand-border text-sm select-none">/</span>
            <span className="text-gray-400 text-sm font-medium">Admin</span>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 text-gray-400 hover:text-white text-sm transition-colors"
          >
            <LogoutIcon />
            Cerrar sesión
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-10 space-y-8">
        <div>
          <h1 className="text-2xl font-black text-white">Dashboard</h1>
          <p className="text-gray-500 text-sm mt-0.5">Panel de administración de Cine Gratín</p>
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
            {/* Refresh */}
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
                        <span className="text-green-400 font-bold">
                          +{log.movies_imported}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <span className="text-blue-400 font-bold">
                          +{log.series_imported}
                        </span>
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

        {/* Quick links back to the site */}
        <div className="flex gap-3">
          <a
            href="/"
            className="text-xs text-gray-600 hover:text-gray-400 transition-colors"
          >
            ← Volver al sitio
          </a>
        </div>
      </main>
    </div>
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
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points="7 10 12 15 17 10" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="12" y1="15" x2="12" y2="3" strokeLinecap="round" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points="16 17 21 12 16 7" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="21" y1="12" x2="9" y2="12" strokeLinecap="round" />
    </svg>
  );
}
