import { useState, useRef, useEffect, useCallback } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { getMovies, getSeries, saveVidsrcResults } from "@/lib/api";
import type { Movie, Series } from "@/lib/types";

type MediaItem = { imdb_id: string; title: string; type: "movie" | "series" };
type ScanStatus = "pending" | "scanning" | "active" | "inactive" | "timeout";

type ScanRow = MediaItem & {
  net: ScanStatus;
  mov: ScanStatus;
};

const TIMEOUT_MS = 12000;
const CONCURRENT = 3; // how many iframes active at once per server

// Loads an invisible iframe and resolves true/false based on load vs error
function probeIframe(src: string, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const iframe = document.createElement("iframe");
    iframe.src = src;
    // Follow the pattern from the user's reference code — NO sandbox
    iframe.style.position = "absolute";
    iframe.style.top = "-9999px";
    iframe.style.left = "-9999px";
    iframe.style.width = "1px";
    iframe.style.height = "1px";
    iframe.style.border = "none";
    iframe.setAttribute("allowfullscreen", "true");

    let done = false;
    const finish = (result: boolean) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { document.body.removeChild(iframe); } catch { /* ignore */ }
      resolve(result);
    };

    // vidsrc always returns HTTP 200 — onload fires for both available and unavailable.
    // We wait a fixed time then check if the iframe has real content height.
    // If the page loaded but has no video, vidsrc shows a minimal error page (~2KB).
    // We detect this by checking contentDocument body text after a short render wait.
    iframe.onload = () => {
      // Give the page 2s to render its content, then read the body
      setTimeout(() => {
        try {
          const body = iframe.contentDocument?.body;
          const text = body?.innerText ?? "";
          const html = body?.innerHTML ?? "";
          // Unavailable signals: empty body, "unavailable" text, or very short HTML (error page)
          const isUnavailable =
            text.trim().length === 0 ||
            text.toLowerCase().includes("unavailable") ||
            text.toLowerCase().includes("not found") ||
            (html.length > 0 && html.length < 500 && !html.includes("video"));
          finish(!isUnavailable);
        } catch {
          // Cross-origin: can't read body — assume active (loaded without CORS error)
          finish(true);
        }
      }, 2000);
    };

    iframe.onerror = () => finish(false);

    const timer = setTimeout(() => finish(false), timeoutMs);
    document.body.appendChild(iframe);
  });
}

export default function VidsrcScanner() {
  const [rows, setRows] = useState<ScanRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [filter, setFilter] = useState<"all" | "movie" | "series">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive" | "pending">("all");
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [saved, setSaved] = useState(0);
  const stopRef = useRef(false);

  // Load catalog
  const loadCatalog = useCallback(async () => {
    setLoading(true);
    try {
      const [movies, series] = await Promise.all([getMovies(), getSeries()]);
      const items: ScanRow[] = [
        ...movies
          .filter((m: Movie) => m.imdb_id)
          .map((m: Movie) => ({
            imdb_id: m.imdb_id!,
            title: m.title,
            type: "movie" as const,
            net: "pending" as ScanStatus,
            mov: "pending" as ScanStatus,
          })),
        ...series
          .filter((s: Series) => s.imdb_id)
          .map((s: Series) => ({
            imdb_id: s.imdb_id!,
            title: s.title,
            type: "series" as const,
            net: "pending" as ScanStatus,
            mov: "pending" as ScanStatus,
          })),
      ];
      setRows(items);
      setProgress({ done: 0, total: items.length });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadCatalog(); }, [loadCatalog]);

  const updateRow = (imdb_id: string, field: "net" | "mov", status: ScanStatus) => {
    setRows((prev) =>
      prev.map((r) => r.imdb_id === imdb_id ? { ...r, [field]: status } : r)
    );
  };

  const startScan = async () => {
    stopRef.current = false;
    setScanning(true);
    setSaved(0);

    const pending = rows.filter((r) => r.net === "pending" || r.mov === "pending");
    setProgress({ done: 0, total: pending.length });

    // Reset pending rows to scanning state
    setRows((prev) =>
      prev.map((r) => ({ ...r, net: "pending", mov: "pending" }))
    );

    const saveBuffer: { imdb_id: string; type: "movie" | "series"; available: boolean }[] = [];
    let done = 0;

    // Process CONCURRENT items at a time
    for (let i = 0; i < rows.length; i += CONCURRENT) {
      if (stopRef.current) break;

      const chunk = rows.slice(i, i + CONCURRENT);

      // Mark as scanning
      chunk.forEach((item) => {
        updateRow(item.imdb_id, "net", "scanning");
        updateRow(item.imdb_id, "mov", "scanning");
      });

      // Probe both servers in parallel for each item in the chunk
      await Promise.all(
        chunk.map(async (item) => {
          const netUrl = item.type === "series"
            ? `https://vidsrc.net/embed/tv/${item.imdb_id}/`
            : `https://vidsrc.net/embed/movie/${item.imdb_id}/`;
          const movUrl = item.type === "series"
            ? `https://vidsrc.mov/embed/tv/${item.imdb_id}/`
            : `https://vidsrc.mov/embed/movie/${item.imdb_id}/`;

          const [netOk, movOk] = await Promise.all([
            probeIframe(netUrl, TIMEOUT_MS).catch(() => false),
            probeIframe(movUrl, TIMEOUT_MS).catch(() => false),
          ]);

          updateRow(item.imdb_id, "net", netOk ? "active" : "inactive");
          updateRow(item.imdb_id, "mov", movOk ? "active" : "inactive");

          // Use net result as the canonical vidsrc_status (Servidor 1)
          saveBuffer.push({ imdb_id: item.imdb_id, type: item.type, available: netOk });
          done++;
          setProgress((p) => ({ ...p, done }));

          // Save to DB every 20 items
          if (saveBuffer.length >= 20) {
            await saveVidsrcResults([...saveBuffer]).catch(() => {});
            setSaved((s) => s + saveBuffer.length);
            saveBuffer.length = 0;
          }
        })
      );
    }

    // Save remaining
    if (saveBuffer.length > 0) {
      await saveVidsrcResults([...saveBuffer]).catch(() => {});
      setSaved((s) => s + saveBuffer.length);
    }

    setScanning(false);
  };

  const stopScan = () => { stopRef.current = true; };

  const filtered = rows.filter((r) => {
    if (filter !== "all" && r.type !== filter) return false;
    if (statusFilter === "active") return r.net === "active" || r.mov === "active";
    if (statusFilter === "inactive") return r.net === "inactive" && r.mov === "inactive";
    if (statusFilter === "pending") return r.net === "pending";
    return true;
  });

  const counts = {
    active: rows.filter((r) => r.net === "active").length,
    inactive: rows.filter((r) => r.net === "inactive" && r.mov === "inactive").length,
    pending: rows.filter((r) => r.net === "pending").length,
  };

  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-black text-white">Escáner VIDSRC</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            Verifica título por título en vidsrc.net (Servidor 1) y vidsrc.mov
          </p>
        </div>

        {/* Controls */}
        <div className="bg-brand-card border border-brand-border rounded-2xl p-5 flex flex-wrap gap-4 items-center justify-between">
          <div className="flex flex-wrap gap-3 items-center">
            {/* Type filter */}
            <div className="flex rounded-lg overflow-hidden border border-brand-border">
              {(["all", "movie", "series"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
                    filter === f ? "bg-brand-red text-white" : "bg-brand-surface text-gray-400 hover:text-white"
                  }`}
                >
                  {f === "all" ? "Todo" : f === "movie" ? "Películas" : "Series"}
                </button>
              ))}
            </div>
            {/* Status filter */}
            <div className="flex rounded-lg overflow-hidden border border-brand-border">
              {(["all", "active", "inactive", "pending"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setStatusFilter(f)}
                  className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
                    statusFilter === f ? "bg-brand-red text-white" : "bg-brand-surface text-gray-400 hover:text-white"
                  }`}
                >
                  {f === "all" ? "Todos" : f === "active" ? `✅ Activos (${counts.active})` : f === "inactive" ? `❌ Inactivos (${counts.inactive})` : `⏳ Pendientes (${counts.pending})`}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-2 items-center">
            {loading && <span className="text-gray-500 text-sm">Cargando catálogo...</span>}
            {!scanning ? (
              <button
                onClick={startScan}
                disabled={loading || rows.length === 0}
                className="flex items-center gap-2 bg-brand-red hover:bg-red-700 text-white text-sm font-bold px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
              >
                <PlayIcon /> Iniciar escaneo ({rows.length} títulos)
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

        {/* Progress bar */}
        {(scanning || progress.done > 0) && (
          <div className="bg-brand-card border border-brand-border rounded-xl px-5 py-4 space-y-2">
            <div className="flex justify-between text-xs text-gray-400">
              <span>{scanning ? `Escaneando... ${progress.done} de ${progress.total}` : `Completado: ${progress.done} de ${progress.total}`}</span>
              <span>{pct}% · {saved} guardados en BD</span>
            </div>
            <div className="w-full bg-brand-border rounded-full h-2">
              <div
                className="bg-brand-red h-2 rounded-full transition-all duration-300"
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="flex gap-5 text-xs pt-0.5">
              <span className="text-green-400">✅ {counts.active} con video (vidsrc.net)</span>
              <span className="text-red-400">❌ {counts.inactive} sin video en ambos</span>
              <span className="text-gray-500">⏳ {counts.pending} pendientes</span>
            </div>
          </div>
        )}

        {/* Table */}
        <div className="bg-brand-card border border-brand-border rounded-2xl overflow-hidden">
          <div className="px-5 py-3 border-b border-brand-border flex items-center justify-between">
            <span className="text-white font-semibold text-sm">
              Mostrando {filtered.length} de {rows.length} títulos
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-brand-border">
                  <th className="text-left px-5 py-3 text-gray-500 font-medium text-xs uppercase tracking-wider">Título</th>
                  <th className="text-center px-4 py-3 text-gray-500 font-medium text-xs uppercase tracking-wider">Tipo</th>
                  <th className="text-center px-4 py-3 text-gray-500 font-medium text-xs uppercase tracking-wider">IMDb</th>
                  <th className="text-center px-5 py-3 text-gray-500 font-medium text-xs uppercase tracking-wider">vidsrc.net</th>
                  <th className="text-center px-5 py-3 text-gray-500 font-medium text-xs uppercase tracking-wider">vidsrc.mov</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={5} className="text-center py-16 text-gray-500 text-sm">
                      {loading ? "Cargando..." : "No hay títulos que mostrar"}
                    </td>
                  </tr>
                )}
                {filtered.map((row) => (
                  <tr key={row.imdb_id} className="border-b border-brand-border last:border-0 hover:bg-brand-surface/40 transition-colors">
                    <td className="px-5 py-3 text-gray-200 font-medium truncate max-w-xs">{row.title}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        row.type === "movie"
                          ? "bg-blue-900/40 text-blue-400"
                          : "bg-purple-900/40 text-purple-400"
                      }`}>
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
                      <StatusBadge status={row.net} />
                    </td>
                    <td className="px-5 py-3 text-center">
                      <StatusBadge status={row.mov} />
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

function StatusBadge({ status }: { status: ScanStatus }) {
  if (status === "pending") return <span className="text-gray-600 text-xs">—</span>;
  if (status === "scanning") return (
    <span className="inline-flex items-center gap-1 text-yellow-400 text-xs">
      <span className="w-2.5 h-2.5 rounded-full border-2 border-yellow-500 border-t-transparent animate-spin" />
      Escaneando
    </span>
  );
  if (status === "active") return (
    <span className="inline-flex items-center gap-1 bg-green-900/30 text-green-400 text-xs font-semibold px-2.5 py-1 rounded-full border border-green-800/40">
      <span className="w-1.5 h-1.5 rounded-full bg-green-400" /> Activo
    </span>
  );
  if (status === "inactive") return (
    <span className="inline-flex items-center gap-1 bg-red-900/20 text-red-400 text-xs font-semibold px-2.5 py-1 rounded-full border border-red-800/40">
      <span className="w-1.5 h-1.5 rounded-full bg-red-400" /> Inactivo
    </span>
  );
  return <span className="text-gray-500 text-xs">—</span>;
}

function PlayIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
      <polygon points="5 3 19 12 5 21 5 3" />
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
