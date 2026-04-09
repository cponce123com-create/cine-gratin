import { useState, useMemo, useRef } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { getMovies, getSeries, runAutoImport, importByIds, scanNetworks, importCollection, resetCollection, type ScanNetworksResult } from "@/lib/api";
import { SAGA_SECTIONS } from "@/lib/homeConfig";
import type { Movie, Series, RunImportResult } from "@/lib/types";

// ─── Types ───────────────────────────────────────────────────────────────────

type Tab = "movies" | "series";

type IdStatus = "imported" | "existed" | "not_found" | "error";

interface IdResult {
  imdb_id: string;
  status: IdStatus;
  title?: string;
  year?: number;
}

interface BulkDone {
  kind: "done";
  ids: IdResult[];
  summary: { imported: number; existed: number; not_found: number; error: number };
}

interface AutoDone {
  kind: "auto_done";
  newItems: Array<{ title: string; year?: number; imdb_id?: string }>;
  apiResult: RunImportResult;
}

type Phase = "snapshot_before" | "importing" | "snapshot_after";

// ─── Utils ───────────────────────────────────────────────────────────────────

function extractImdbIds(text: string): string[] {
  const matches = text.match(/(tt|ev)\d{7,8}/gi) ?? [];
  return [...new Set(matches.map((id) => id.toLowerCase()))];
}

// ─── Phase progress bar ──────────────────────────────────────────────────────

const PHASE_LABELS: Record<Phase, string> = {
  snapshot_before: "Leyendo catálogo actual...",
  importing: "Ejecutando importación...",
  snapshot_after: "Verificando resultados...",
};
const PHASE_ORDER: Phase[] = ["snapshot_before", "importing", "snapshot_after"];

function PhaseProgress({ phase }: { phase: Phase }) {
  const idx = PHASE_ORDER.indexOf(phase);
  return (
    <div className="space-y-3 py-2">
      {PHASE_ORDER.map((p, i) => {
        const done = i < idx;
        const active = i === idx;
        return (
          <div key={p} className="flex items-center gap-3">
            <div
              className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-xs ${
                done
                  ? "bg-green-500/20 border border-green-500 text-green-400"
                  : active
                  ? "bg-brand-red/20 border border-brand-red"
                  : "bg-brand-surface border border-brand-border"
              }`}
            >
              {done ? (
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <polyline points="20 6 9 17 4 12" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : active ? (
                <span className="w-2.5 h-2.5 rounded-full border-2 border-brand-red border-t-white animate-spin block" />
              ) : null}
            </div>
            <span
              className={`text-sm ${
                done ? "text-gray-500 line-through" : active ? "text-white font-medium" : "text-gray-600"
              }`}
            >
              {i + 1}. {PHASE_LABELS[p]}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Result row ──────────────────────────────────────────────────────────────

function IdRow({ result }: { result: IdResult }) {
  const cfg = {
    imported: {
      dot: "bg-green-400",
      label: "Importado",
      labelClass: "bg-green-900/30 text-green-400 border-green-800/40",
    },
    existed: {
      dot: "bg-gray-500",
      label: "Ya existía",
      labelClass: "bg-gray-800/60 text-gray-400 border-gray-700",
    },
    not_found: {
      dot: "bg-red-500",
      label: "No encontrado",
      labelClass: "bg-red-900/30 text-red-400 border-red-800/40",
    },
    error: {
      dot: "bg-orange-500",
      label: "Error",
      labelClass: "bg-orange-900/30 text-orange-400 border-orange-800/40",
    },
  }[result.status];

  return (
    <tr className="border-b border-brand-border last:border-0 hover:bg-brand-surface/40 transition-colors">
      <td className="px-4 py-3 font-mono text-xs text-gray-400 whitespace-nowrap">
        {result.imdb_id}
      </td>
      <td className="px-4 py-3">
        {result.title ? (
          <span className="text-gray-200 text-sm font-medium">
            {result.title}
            {result.year && (
              <span className="text-gray-500 font-normal ml-1.5">({result.year})</span>
            )}
          </span>
        ) : (
          <span className="text-gray-600 text-sm italic">—</span>
        )}
      </td>
      <td className="px-4 py-3 text-right">
        <span
          className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${cfg.labelClass}`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
          {cfg.label}
        </span>
      </td>
    </tr>
  );
}

// ─── Summary bar ─────────────────────────────────────────────────────────────

function SummaryBar({
  imported,
  existed,
  not_found,
  error = 0,
}: {
  imported: number;
  existed: number;
  not_found: number;
  error?: number;
}) {
  return (
    <div className="flex flex-wrap gap-4 bg-brand-surface border border-brand-border rounded-xl px-5 py-4">
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-green-400" />
        <span className="text-green-400 font-bold text-lg">{imported}</span>
        <span className="text-gray-400 text-sm">importados</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-gray-500" />
        <span className="text-gray-300 font-bold text-lg">{existed}</span>
        <span className="text-gray-400 text-sm">ya existían</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-red-500" />
        <span className="text-red-400 font-bold text-lg">{not_found}</span>
        <span className="text-gray-400 text-sm">no encontrados</span>
      </div>
      {error > 0 && (
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-orange-500" />
          <span className="text-orange-400 font-bold text-lg">{error}</span>
          <span className="text-gray-400 text-sm">con error</span>
        </div>
      )}
    </div>
  );
}

// ─── Range Import Section ────────────────────────────────────────────────────

const MAX_RANGE = 500;
const RANGE_BATCH = 50;

function generateRange(from: string, to: string): { ids: string[] | null; error?: string } {
  if (!/^tt\d{7,8}$/.test(from) || !/^tt\d{7,8}$/.test(to)) {
    return { ids: null, error: "Formato inválido. Usa ttXXXXXXX (7-8 dígitos)." };
  }
  const numFrom = parseInt(from.slice(2));
  const numTo = parseInt(to.slice(2));
  if (numFrom > numTo) return { ids: null, error: '"Hasta" debe ser mayor o igual que "Desde".' };
  const count = numTo - numFrom + 1;
  if (count > MAX_RANGE) return { ids: null, error: `El rango máximo es ${MAX_RANGE} IDs por operación.` };
  const digitLen = Math.max(from.slice(2).length, to.slice(2).length);
  const ids: string[] = [];
  for (let n = numFrom; n <= numTo; n++) {
    ids.push("tt" + String(n).padStart(digitLen, "0"));
  }
  return { ids };
}

function RangeImportSection({ tab }: { tab: Tab }) {
  const isMovies = tab === "movies";

  const [fromId, setFromId] = useState("tt0000001");
  const [toId, setToId] = useState("tt0000050");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<{ processed: number; total: number; imported: number; existed: number; not_found: number; error: number } | null>(null);
  const [done, setDone] = useState<{ imported: number; existed: number; not_found: number; error: number } | null>(null);
  const [rangeError, setRangeError] = useState("");

  const rangeResult = generateRange(fromId.trim(), toId.trim());
  const rangeCount = rangeResult.ids?.length ?? 0;
  const validationError = fromId && toId ? rangeResult.error : undefined;

  const handleImport = async () => {
    if (!rangeResult.ids) return;
    setLoading(true);
    setDone(null);
    setRangeError("");
    const ids = rangeResult.ids;
    const type = isMovies ? "movie" : "series";
    let imported = 0, existed = 0, not_found = 0, error = 0, processed = 0;
    setProgress({ processed: 0, total: ids.length, imported: 0, existed: 0, not_found: 0, error: 0 });

    try {
      for (let i = 0; i < ids.length; i += RANGE_BATCH) {
        const batch = ids.slice(i, i + RANGE_BATCH);
        const resp = await importByIds(batch, type);
        imported += resp.summary.imported;
        existed += resp.summary.existed;
        not_found += resp.summary.not_found;
        error += resp.summary.error;
        processed += batch.length;
        setProgress({ processed, total: ids.length, imported, existed, not_found, error });
      }
      setDone({ imported, existed, not_found, error });
    } catch (err: unknown) {
      setRangeError(err instanceof Error ? err.message : "Error durante la importación por rango.");
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setDone(null);
    setProgress(null);
    setRangeError("");
  };

  const pct = progress && progress.total > 0 ? Math.round((progress.processed / progress.total) * 100) : 0;

  return (
    <div className="bg-brand-card border border-brand-border rounded-2xl p-6 space-y-5">
      <div>
        <h2 className="text-white font-bold text-base mb-1">Importar por Rango de ID</h2>
        <p className="text-gray-500 text-sm">
          Importa un rango continuo de IDs de IMDb. Formato{" "}
          <code className="text-gray-400 bg-brand-surface px-1 rounded text-xs">tt0000001</code>
          . Máximo {MAX_RANGE} IDs por operación.
        </p>
      </div>

      {!loading && !done && (
        <>
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[130px]">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Desde</label>
              <input
                value={fromId}
                onChange={(e) => setFromId(e.target.value)}
                placeholder="tt0000001"
                className="w-full bg-brand-surface border border-brand-border rounded-lg px-3 py-2 text-gray-200 text-sm font-mono focus:outline-none focus:border-gray-500 transition-colors"
              />
            </div>
            <div className="flex-1 min-w-[130px]">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Hasta</label>
              <input
                value={toId}
                onChange={(e) => setToId(e.target.value)}
                placeholder="tt0000050"
                className="w-full bg-brand-surface border border-brand-border rounded-lg px-3 py-2 text-gray-200 text-sm font-mono focus:outline-none focus:border-gray-500 transition-colors"
              />
            </div>
          </div>

          {validationError ? (
            <p className="text-xs text-yellow-500">{validationError}</p>
          ) : rangeCount > 0 ? (
            <p className="text-xs text-gray-500">
              Se generarán{" "}
              <span className="text-green-400 font-bold">{rangeCount}</span> IDs ·
              procesados en lotes de {RANGE_BATCH}
            </p>
          ) : null}

          {rangeError && (
            <div className="bg-red-900/20 border border-red-800/40 rounded-lg px-4 py-3 text-red-400 text-sm">
              {rangeError}
            </div>
          )}

          <button
            onClick={handleImport}
            disabled={!rangeResult.ids || rangeCount === 0}
            className="flex items-center gap-2 bg-brand-red hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold py-2.5 px-5 rounded-lg transition-colors text-sm"
          >
            <UploadIcon />
            Importar Rango ({rangeCount} IDs)
          </button>
        </>
      )}

      {loading && progress && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-gray-400">
            <span>Importando {progress.processed} de {progress.total}...</span>
            <span>{pct}%</span>
          </div>
          <div className="w-full bg-brand-border rounded-full h-1.5">
            <div
              className="bg-brand-red h-1.5 rounded-full transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex flex-wrap gap-4 text-xs">
            <span className="text-green-400 font-bold">{progress.imported} importados</span>
            <span className="text-gray-400">{progress.existed} ya existían</span>
            <span className="text-red-400">{progress.not_found} no encontrados</span>
            {progress.error > 0 && <span className="text-orange-400">{progress.error} errores</span>}
          </div>
        </div>
      )}

      {done && (
        <div className="space-y-4">
          <SummaryBar {...done} />
          <button
            onClick={reset}
            className="flex items-center gap-2 bg-brand-surface border border-brand-border hover:border-gray-500 text-gray-300 hover:text-white text-sm font-semibold py-2 px-4 rounded-lg transition-colors"
          >
            <ResetIcon />
            Nueva importación
          </button>
        </div>
      )}
    </div>
  );
}


// ─── Collection Import Section ───────────────────────────────────────────────

const COLLECTIONS = SAGA_SECTIONS.filter(s => s.collection_id).map(s => ({ id: s.collection_id!, label: s.label }));

function CollectionImportSection() {
  const [customId, setCustomId] = useState("");
  const [loading, setLoading] = useState<number | null>(null);
  const [reseting, setReseting] = useState<number | null>(null);
  const [results, setResults] = useState<Record<number, { collection: string; imported: number; existed: number; total: number; deleted?: number }>>({});
  const [error, setError] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scanDone, setScanDone] = useState(false);
  const [scanProgress, setScanProgress] = useState({ current: 0, total: 0, updated: 0, no_collection: 0, error: 0, title: "" });
  const scanEsRef = useRef<EventSource | null>(null);

  const handleScanCollections = () => {
    if (scanEsRef.current) scanEsRef.current.close();
    setScanning(true);
    setScanDone(false);
    setScanProgress({ current: 0, total: 0, updated: 0, no_collection: 0, error: 0, title: "" });

    const token = localStorage.getItem("cg_admin_token") ?? "";
    const url = `/api/admin/scan-collections-stream${token ? `?token=${token}` : ""}`;
    const es = new EventSource(url);
    scanEsRef.current = es;

    es.addEventListener("start", (e) => {
      const d = JSON.parse(e.data);
      setScanProgress(p => ({ ...p, total: d.total }));
    });
    es.addEventListener("progress", (e) => {
      const d = JSON.parse(e.data);
      setScanProgress({ current: d.i, total: d.total, updated: d.updated, no_collection: d.no_collection, error: d.error, title: d.title });
    });
    es.addEventListener("done", () => { setScanning(false); setScanDone(true); es.close(); });
    es.addEventListener("error", () => { setScanning(false); es.close(); });
  };

  const scanPct = scanProgress.total > 0 ? Math.round((scanProgress.current / scanProgress.total) * 100) : 0;

  const handleImport = async (id: number) => {
    setLoading(id);
    setError("");
    try {
      const res = await importCollection(id);
      setResults(prev => ({ ...prev, [id]: { ...prev[id], collection: res.collection, imported: res.imported, existed: res.existed, total: res.total } }));
    } catch (e: any) {
      setError(e.message || "Error al importar la colección.");
    } finally {
      setLoading(null);
    }
  };

  const handleReset = async (id: number) => {
    if (!confirm("¿Estás seguro de que quieres resetear esta saga? Se eliminarán todas las películas y series asociadas a esta colección.")) return;
    setReseting(id);
    setError("");
    try {
      const res = await resetCollection(id);
      setResults(prev => ({ ...prev, [id]: { ...prev[id], deleted: res.total_deleted, imported: 0, existed: 0, total: 0 } }));
    } catch (e: any) {
      setError(e.message || "Error al resetear la colección.");
    } finally {
      setReseting(null);
    }
  };

  const handleCustomImport = () => {
    const id = parseInt(customId.trim(), 10);
    if (!id || isNaN(id)) { setError("Ingresa un ID de colección válido."); return; }
    handleImport(id);
  };

  return (
    <div className="bg-brand-card border border-brand-border rounded-2xl p-6 space-y-5">
      <div>
        <h2 className="text-white font-bold text-base mb-1">Importar por Colección TMDB</h2>
        <p className="text-gray-500 text-sm">
          Importa todas las películas de una saga completa usando el ID de colección de TMDB.
        </p>
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-800/40 rounded-lg px-4 py-3 text-red-400 text-sm">{error}</div>
      )}

      {/* Scan collections button */}
      <div className="bg-brand-surface border border-brand-border rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-white text-sm font-semibold">Escanear colecciones existentes</p>
            <p className="text-gray-500 text-xs mt-0.5">Actualiza el campo collection_id en todas las películas que aún no lo tienen. Necesario para que las sagas funcionen correctamente en el Home.</p>
          </div>
          {!scanning ? (
            <button onClick={handleScanCollections}
              className="flex-shrink-0 flex items-center gap-2 bg-brand-red hover:bg-red-700 text-white text-xs font-bold px-3 py-2 rounded-lg transition-colors">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35" strokeLinecap="round"/></svg>
              {scanDone ? "Re-escanear" : "Escanear ahora"}
            </button>
          ) : (
            <button onClick={() => { scanEsRef.current?.close(); setScanning(false); }}
              className="flex-shrink-0 bg-gray-700 hover:bg-gray-600 text-white text-xs font-bold px-3 py-2 rounded-lg transition-colors">
              Detener
            </button>
          )}
        </div>
        {(scanning || scanDone) && scanProgress.total > 0 && (
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs text-gray-500">
              <span className="truncate max-w-xs">{scanning ? scanProgress.title : "Completado"}</span>
              <span>{scanProgress.current}/{scanProgress.total} ({scanPct}%)</span>
            </div>
            <div className="w-full bg-brand-border rounded-full h-1.5">
              <div className={`h-1.5 rounded-full transition-all ${scanDone ? "bg-green-500" : "bg-brand-red"}`} style={{ width: `${scanPct}%` }} />
            </div>
            <div className="flex gap-4 text-xs">
              <span className="text-green-400">✅ {scanProgress.updated} actualizadas</span>
              <span className="text-gray-500">— {scanProgress.no_collection} sin colección</span>
              {scanProgress.error > 0 && <span className="text-red-400">❌ {scanProgress.error} errores</span>}
            </div>
          </div>
        )}
      </div>

      {/* Custom collection ID input */}
      <div className="flex gap-2">
        <input
          type="number"
          value={customId}
          onChange={e => setCustomId(e.target.value)}
          placeholder="ID de colección TMDB (ej: 1241)"
          className="flex-1 bg-brand-surface border border-brand-border rounded-lg px-3 py-2 text-gray-200 text-sm focus:outline-none focus:border-gray-500 transition-colors"
        />
        <button
          onClick={handleCustomImport}
          disabled={loading !== null}
          className="flex items-center gap-2 bg-brand-red hover:bg-red-700 text-white text-sm font-bold px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
        >
          Importar
        </button>
      </div>

      {/* Known collections grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {COLLECTIONS.map(col => {
          const res = results[col.id];
          const isLoading = loading === col.id;
          return (
            <div key={col.id} className="flex items-center justify-between gap-3 bg-brand-surface border border-brand-border rounded-xl px-4 py-3">
              <div className="flex-1 min-w-0">
                <p className="text-gray-200 text-sm font-medium truncate">{col.label}</p>
                <p className="text-gray-600 text-xs font-mono">ID: {col.id}</p>
                {res && (
                  <p className="text-xs mt-0.5">
                    {res.deleted !== undefined && res.deleted > 0 && (
                      <span className="text-red-400 mr-2">-{res.deleted} eliminadas</span>
                    )}
                    {res.imported > 0 && (
                      <span className="text-green-400">+{res.imported} importadas</span>
                    )}
                    {res.existed > 0 && <span className="text-gray-500"> · {res.existed} ya existían</span>}
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleReset(col.id)}
                  disabled={loading !== null || reseting !== null}
                  title="Resetear saga (eliminar para re-importar)"
                  className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-lg border border-brand-border bg-brand-surface text-gray-500 hover:text-red-400 hover:border-red-900/50 transition-colors disabled:opacity-50"
                >
                  {reseting === col.id ? (
                    <span className="w-3 h-3 rounded-full border-2 border-red-400 border-t-transparent animate-spin" />
                  ) : (
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
                <button
                  onClick={() => handleImport(col.id)}
                  disabled={loading !== null || reseting !== null}
                  className={`flex-shrink-0 flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-50 ${
                    res && res.total > 0
                      ? "bg-green-900/20 border-green-800/40 text-green-400"
                      : "bg-brand-surface border-brand-border text-gray-300 hover:text-white hover:border-gray-500"
                  }`}
                >
                  {isLoading ? (
                    <span className="w-3 h-3 rounded-full border-2 border-gray-400 border-t-white animate-spin" />
                  ) : res && res.total > 0 ? (
                    "✅ Importado"
                  ) : (
                    "Importar"
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Scan Networks Section ───────────────────────────────────────────────────

function ScanNetworksSection({ tab }: { tab: Tab }) {
  const isMovies = tab === "movies";
  const typeLabel = isMovies ? "películas" : "series";
  const [scanning, setScanning] = useState(false);
  const [done, setDone] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, title: "", updated: 0, no_change: 0, error: 0 });
  const [recentUpdates, setRecentUpdates] = useState<{ title: string; networks: string[] }[]>([]);
  const [errorMsg, setErrorMsg] = useState("");
  const esRef = useRef<EventSource | null>(null);

  const handleScan = () => {
    if (esRef.current) esRef.current.close();
    setScanning(true);
    setDone(false);
    setErrorMsg("");
    setRecentUpdates([]);
    setProgress({ current: 0, total: 0, title: "", updated: 0, no_change: 0, error: 0 });

    const token = localStorage.getItem("cg_admin_token") ?? "";
    const url = `/api/admin/scan-networks-stream?type=${isMovies ? "movie" : "series"}${token ? `&token=${token}` : ""}`;
    const es = new EventSource(url);
    esRef.current = es;

    es.addEventListener("start", (e) => {
      const d = JSON.parse(e.data);
      setProgress(p => ({ ...p, total: d.total }));
    });
    es.addEventListener("progress", (e) => {
      const d = JSON.parse(e.data);
      setProgress({ current: d.i, total: d.total, title: d.title, updated: d.updated, no_change: d.no_change, error: d.error });
      if (d.status === "updated" && d.new_networks?.length > 0) {
        setRecentUpdates(prev => [{ title: d.title, networks: d.new_networks }, ...prev].slice(0, 50));
      }
    });
    es.addEventListener("done", () => { setScanning(false); setDone(true); es.close(); });
    es.addEventListener("error", () => { setScanning(false); setErrorMsg("Error durante el escaneo."); es.close(); });
  };

  const handleStop = () => { esRef.current?.close(); setScanning(false); };
  const pct = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  return (
    <div className="bg-brand-card border border-brand-border rounded-2xl p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-white font-bold text-base mb-1">Escáner de Productoras</h2>
          <p className="text-gray-500 text-sm">
            Busca automáticamente en TMDB las productoras (Netflix, HBO, Disney+, etc.) para todas las {typeLabel} existentes.
          </p>
        </div>
        {!scanning ? (
          <button onClick={handleScan}
            className="flex items-center gap-2 bg-brand-surface hover:bg-brand-border border border-brand-border text-white font-bold py-2 px-4 rounded-lg transition-colors text-sm">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {done ? "Escanear de nuevo" : "Escanear ahora"}
          </button>
        ) : (
          <button onClick={handleStop}
            className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 text-white text-sm font-bold py-2 px-4 rounded-lg transition-colors">
            Detener
          </button>
        )}
      </div>

      {(scanning || done) && progress.total > 0 && (
        <div className="space-y-2">
          <div className="flex justify-between text-xs text-gray-400">
            <span className="truncate max-w-xs">{scanning ? `Escaneando: ${progress.title}` : "Escaneo completado"}</span>
            <span>{progress.current} / {progress.total} ({pct}%)</span>
          </div>
          <div className="w-full bg-brand-border rounded-full h-2">
            <div className={`h-2 rounded-full transition-all duration-300 ${done ? "bg-green-500" : "bg-brand-red"}`}
              style={{ width: `${pct}%` }} />
          </div>
          <div className="flex gap-5 text-xs">
            <span className="text-green-400">✅ {progress.updated} actualizadas</span>
            <span className="text-gray-400">— {progress.no_change} sin cambios</span>
            {progress.error > 0 && <span className="text-red-400">❌ {progress.error} errores</span>}
          </div>
        </div>
      )}

      {scanning && progress.total === 0 && (
        <div className="py-4 flex items-center gap-3 text-gray-400 text-sm">
          <div className="w-5 h-5 border-2 border-brand-red border-t-transparent rounded-full animate-spin flex-shrink-0" />
          Cargando catálogo...
        </div>
      )}

      {errorMsg && (
        <div className="bg-red-900/20 border border-red-800/40 rounded-lg px-4 py-3 text-red-400 text-sm">
          {errorMsg}
        </div>
      )}

      {recentUpdates.length > 0 && (
        <div className="border border-brand-border rounded-xl overflow-hidden max-h-[300px] overflow-y-auto">
          <div className="px-4 py-2 bg-brand-surface border-b border-brand-border text-xs font-bold text-gray-500 uppercase tracking-wider">
            Productoras actualizadas recientemente
          </div>
          <div className="divide-y divide-brand-border">
            {recentUpdates.map((u, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                <span className="text-sm text-gray-200 flex-1 truncate">{u.title}</span>
                <div className="flex flex-wrap gap-1 justify-end">
                  {u.networks.map((n) => (
                    <span key={n} className="text-[10px] bg-brand-red/10 border border-brand-red/20 text-brand-red px-1.5 py-0.5 rounded">
                      {n}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Bulk import section ──────────────────────────────────────────────────────

function BulkImportSection({ tab }: { tab: Tab }) {
  const isMovies = tab === "movies";
  const typeLabel = isMovies ? "películas" : "series";

  const [idText, setIdText] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState<BulkDone | null>(null);
  const [error, setError] = useState("");

  const extractedIds = useMemo(() => extractImdbIds(idText), [idText]);

  const handleImport = async () => {
    setLoading(true);
    setDone(null);
    setError("");

    try {
      const type = isMovies ? "movie" : "series";
      const resp = await importByIds(extractedIds, type);

      const ids: IdResult[] = resp.results.map((r) => ({
        imdb_id: r.imdb_id,
        status: r.status,
        title: r.title ?? undefined,
        year: r.year ?? undefined,
      }));

      setDone({ kind: "done", ids, summary: resp.summary });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error inesperado durante la importación.");
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setIdText("");
    setDone(null);
    setError("");
  };

  return (
    <div className="bg-brand-card border border-brand-border rounded-2xl p-6 space-y-5">
      <div>
        <h2 className="text-white font-bold text-base mb-1">Lista de IDs de IMDb</h2>
        <p className="text-gray-500 text-sm">
          Pega IDs de {typeLabel} (formato{" "}
          <code className="text-gray-400 bg-brand-surface px-1 rounded text-xs">tt1234567</code>
          ), uno por línea o mezclados con cualquier texto.
        </p>
      </div>

      {/* Textarea — hide while loading/done */}
      {!loading && !done && (
        <>
          <textarea
            value={idText}
            onChange={(e) => setIdText(e.target.value)}
            rows={7}
            placeholder={
              isMovies
                ? "tt0111161\ntt0068646\ntt0071562\n\nO pega cualquier texto con IDs de IMDb..."
                : "tt0903747\ntt0944947\ntt0475784\n\nO pega cualquier texto con IDs de IMDb..."
            }
            className="w-full bg-brand-surface border border-brand-border rounded-xl px-4 py-3 text-gray-200 placeholder-gray-600 text-sm font-mono focus:outline-none focus:border-gray-500 transition-colors resize-y"
          />

          {idText.trim() && (
            <p className="text-xs text-gray-500 -mt-2">
              {extractedIds.length === 0 ? (
                <span className="text-yellow-500">
                  No se encontraron IDs con formato válido (tt0000000).
                </span>
              ) : (
                <>
                  <span className="text-green-400 font-bold">{extractedIds.length}</span>{" "}
                  {extractedIds.length === 1 ? "ID detectado" : "IDs detectados"}:{" "}
                  <span className="text-gray-400">
                    {extractedIds.slice(0, 6).join(", ")}
                    {extractedIds.length > 6 && ` y ${extractedIds.length - 6} más...`}
                  </span>
                </>
              )}
            </p>
          )}

          {error && (
            <div className="bg-red-900/20 border border-red-800/40 rounded-lg px-4 py-3 text-red-400 text-sm">
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={handleImport}
              disabled={extractedIds.length === 0}
              className="flex items-center gap-2 bg-brand-red hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold py-2.5 px-5 rounded-lg transition-colors"
            >
              <UploadIcon />
              Iniciar Importación ({extractedIds.length} IDs)
            </button>
            {idText && (
              <button
                onClick={reset}
                className="text-gray-500 hover:text-gray-300 text-sm transition-colors"
              >
                Limpiar
              </button>
            )}
          </div>
        </>
      )}

      {/* Loading spinner */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-10 gap-4">
          <span className="w-8 h-8 rounded-full border-2 border-brand-red border-t-white animate-spin block" />
          <p className="text-gray-400 text-sm">
            Buscando e importando {extractedIds.length} {typeLabel} en TMDB...
          </p>
          <p className="text-gray-600 text-xs">Esto puede tardar unos segundos por ID.</p>
        </div>
      )}

      {/* Results */}
      {done && (
        <div className="space-y-4">
          <SummaryBar {...done.summary} />

          <div className="overflow-hidden rounded-xl border border-brand-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-brand-border bg-brand-surface/50">
                  <th className="text-left px-4 py-2.5 text-gray-500 text-xs uppercase tracking-wider font-medium">
                    ID IMDb
                  </th>
                  <th className="text-left px-4 py-2.5 text-gray-500 text-xs uppercase tracking-wider font-medium">
                    Título
                  </th>
                  <th className="text-right px-4 py-2.5 text-gray-500 text-xs uppercase tracking-wider font-medium">
                    Estado
                  </th>
                </tr>
              </thead>
              <tbody>
                {done.ids.map((r) => (
                  <IdRow key={r.imdb_id} result={r} />
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex gap-3 pt-1">
            <button
              onClick={reset}
              className="flex items-center gap-2 bg-brand-surface border border-brand-border hover:border-gray-500 text-gray-300 hover:text-white text-sm font-semibold py-2 px-4 rounded-lg transition-colors"
            >
              <ResetIcon />
              Nueva importación
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Auto-import section ──────────────────────────────────────────────────────

function AutoImportSection({ tab }: { tab: Tab }) {
  const isMovies = tab === "movies";

  const [phase, setPhase] = useState<Phase | null>(null);
  const [done, setDone] = useState<AutoDone | null>(null);
  const [error, setError] = useState("");

  const handleRun = async () => {
    setPhase("snapshot_before");
    setDone(null);
    setError("");

    try {
      // Phase 1 — snapshot before
      const before = isMovies ? await getMovies() : await getSeries();
      const beforeIds = new Set(before.map((x) => String(x.id)));

      // Phase 2 — run global import
      setPhase("importing");
      const apiResult = await runAutoImport();

      // Phase 3 — snapshot after
      setPhase("snapshot_after");
      const after = isMovies ? await getMovies() : await getSeries();

      // Newly added items
      const newItems = after
        .filter((x) => !beforeIds.has(String(x.id)))
        .map((x) => ({ title: x.title, year: (x as Movie | Series).year, imdb_id: x.imdb_id }));

      setDone({ kind: "auto_done", newItems, apiResult });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al ejecutar el auto-import.");
    } finally {
      setPhase(null);
    }
  };

  const isRunning = phase !== null;

  return (
    <div className="bg-brand-card border border-brand-border rounded-2xl p-6 space-y-5">
      <div>
        <h2 className="text-white font-bold text-base mb-1">Auto-import TMDB</h2>
        <p className="text-gray-500 text-sm">
          Ejecuta el proceso automático de TMDB y muestra exactamente qué se añadió al catálogo.
        </p>
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-800/40 rounded-lg px-4 py-3 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Progress */}
      {isRunning && phase && <PhaseProgress phase={phase} />}

      {/* Results */}
      {done && (
        <div className="space-y-4">
          {/* API summary */}
          <div className="flex flex-wrap gap-4 bg-brand-surface border border-brand-border rounded-xl px-5 py-4">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-400" />
              <span className="text-green-400 font-bold text-lg">
                {done.apiResult.movies_imported}
              </span>
              <span className="text-gray-400 text-sm">películas importadas</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-400" />
              <span className="text-blue-400 font-bold text-lg">
                {done.apiResult.series_imported}
              </span>
              <span className="text-gray-400 text-sm">series importadas</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-gray-500" />
              <span className="text-gray-300 font-bold text-lg">
                {done.apiResult.total_checked}
              </span>
              <span className="text-gray-400 text-sm">revisados</span>
            </div>
          </div>

          {/* New items list */}
          {done.newItems.length > 0 ? (
            <div className="overflow-hidden rounded-xl border border-brand-border">
              <div className="px-4 py-3 border-b border-brand-border bg-brand-surface/50 flex items-center justify-between">
                <span className="text-sm font-semibold text-white">
                  Nuevo en el catálogo
                </span>
                <span className="text-xs text-gray-500">
                  {done.newItems.length} {done.newItems.length === 1 ? "entrada" : "entradas"}
                </span>
              </div>
              <div className="divide-y divide-brand-border max-h-80 overflow-y-auto">
                {done.newItems.map((item, i) => (
                  <div key={i} className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-brand-surface/40 transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-green-400 flex-shrink-0">
                        <CheckIcon />
                      </span>
                      <span className="text-gray-200 text-sm font-medium truncate">
                        {item.title}
                        {item.year && (
                          <span className="text-gray-500 font-normal ml-1.5">({item.year})</span>
                        )}
                      </span>
                    </div>
                    {item.imdb_id && (
                      <span className="text-gray-600 text-xs font-mono flex-shrink-0">
                        {item.imdb_id}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center py-6 border border-brand-border rounded-xl text-gray-500 text-sm">
              No se añadieron entradas nuevas al catálogo en esta ejecución.
            </div>
          )}

          <button
            onClick={() => setDone(null)}
            className="flex items-center gap-2 bg-brand-surface border border-brand-border hover:border-gray-500 text-gray-300 hover:text-white text-sm font-semibold py-2 px-4 rounded-lg transition-colors"
          >
            <ResetIcon />
            Ejecutar de nuevo
          </button>
        </div>
      )}

      {!isRunning && !done && (
        <button
          onClick={handleRun}
          className="flex items-center gap-2 bg-brand-surface border border-brand-border hover:border-gray-500 text-gray-200 hover:text-white font-bold py-2.5 px-5 rounded-lg transition-colors text-sm"
        >
          <SyncIcon />
          Ejecutar auto-import
        </button>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function MetadataRescanSection() {
  const [scanning, setScanning] = useState(false);
  const [done, setDone] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, title: "", updated: 0, no_change: 0, error: 0 });
  const [errorMsg, setErrorMsg] = useState("");
  const esRef = useRef<EventSource | null>(null);

  const handleScan = () => {
    if (esRef.current) esRef.current.close();
    setScanning(true);
    setDone(false);
    setErrorMsg("");
    setProgress({ current: 0, total: 0, title: "", updated: 0, no_change: 0, error: 0 });

    const token = localStorage.getItem("cg_admin_token") ?? "";
    const url = `/api/admin/rescan-metadata-stream?token=${token}`;
    const es = new EventSource(url);
    esRef.current = es;

    es.addEventListener("start", (e) => {
      const d = JSON.parse(e.data);
      setProgress(p => ({ ...p, total: d.total }));
    });
    es.addEventListener("progress", (e) => {
      const d = JSON.parse(e.data);
      setProgress({ current: d.i, total: d.total, title: d.title, updated: d.updated, no_change: d.no_change, error: d.error });
    });
    es.addEventListener("done", () => { setScanning(false); setDone(true); es.close(); });
    es.addEventListener("error", () => { setScanning(false); setErrorMsg("Error durante el escaneo de metadatos."); es.close(); });
  };

  const handleStop = () => { esRef.current?.close(); setScanning(false); };
  const pct = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  return (
    <div className="bg-brand-card border border-brand-border rounded-2xl p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-white font-bold text-base mb-1">Optimizador de Sagas</h2>
          <p className="text-gray-500 text-sm">
            Escanea las películas actuales y las vincula correctamente a sus sagas oficiales usando metadatos de TMDB.
          </p>
        </div>
        {!scanning ? (
          <button onClick={handleScan}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 border border-green-500 text-white font-bold py-2 px-4 rounded-lg transition-colors text-sm">
            Optimizar Sagas
          </button>
        ) : (
          <button onClick={handleStop}
            className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 text-white text-sm font-bold py-2 px-4 rounded-lg transition-colors">
            Detener
          </button>
        )}
      </div>

      {(scanning || done) && progress.total > 0 && (
        <div className="space-y-2">
          <div className="flex justify-between text-xs text-gray-400">
            <span className="truncate max-w-xs">{scanning ? `Procesando: ${progress.title}` : "Optimización completada"}</span>
            <span>{progress.current} / {progress.total} ({pct}%)</span>
          </div>
          <div className="w-full bg-brand-border rounded-full h-2">
            <div className={`h-2 rounded-full transition-all duration-300 ${done ? "bg-green-500" : "bg-brand-red"}`}
              style={{ width: `${pct}%` }} />
          </div>
          <div className="flex gap-5 text-xs">
            <span className="text-green-400">✅ {progress.updated} películas vinculadas</span>
            {progress.error > 0 && <span className="text-red-400">❌ {progress.error} errores</span>}
          </div>
        </div>
      )}

      {errorMsg && (
        <div className="bg-red-900/20 border border-red-800/40 rounded-lg px-4 py-3 text-red-400 text-sm">
          {errorMsg}
        </div>
      )}
    </div>
  );
}

export default function AdminImport() {
  const [activeTab, setActiveTab] = useState<Tab>("movies");

  const tabs: { id: Tab; label: string }[] = [
    { id: "movies", label: "Películas" },
    { id: "series", label: "Series de TV" },
  ];

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-black text-white">Importación Masiva</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            Importa contenido por ID de IMDb con seguimiento por título, o ejecuta el auto-import de TMDB.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-brand-surface border border-brand-border rounded-xl p-1 w-fit">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-5 py-2 rounded-lg text-sm font-semibold transition-colors ${
                activeTab === tab.id
                  ? "bg-brand-card text-white border border-brand-border shadow-sm"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Sections — re-mount on tab change for independent state */}
        <AutoImportSection key={`auto-${activeTab}`} tab={activeTab} />
        {activeTab === "movies" && <MetadataRescanSection />}
        <CollectionImportSection />
        <ScanNetworksSection key={`scan-${activeTab}`} tab={activeTab} />
        <BulkImportSection key={`bulk-${activeTab}`} tab={activeTab} />
        <RangeImportSection key={`range-${activeTab}`} tab={activeTab} />
      </div>
    </AdminLayout>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function UploadIcon() {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points="17 8 12 3 7 8" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="12" y1="3" x2="12" y2="15" strokeLinecap="round" />
    </svg>
  );
}

function SyncIcon() {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" strokeLinecap="round" />
      <path d="M21 3v5h-5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" strokeLinecap="round" />
      <path d="M8 16H3v5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <polyline points="20 6 9 17 4 12" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ResetIcon() {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" strokeLinecap="round" />
      <path d="M21 3v5h-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
