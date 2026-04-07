import { useState, useMemo } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { getMovies, getSeries, runAutoImport, importByIds, scanNetworks, type ScanNetworksResult } from "@/lib/api";
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
  const matches = text.match(/tt\d{7,8}/gi) ?? [];
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

// ─── Scan Networks Section ───────────────────────────────────────────────────

function ScanNetworksSection({ tab }: { tab: Tab }) {
  const isMovies = tab === "movies";
  const typeLabel = isMovies ? "películas" : "series";
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<ScanNetworksResult[] | null>(null);
  const [summary, setSummary] = useState<{ updated: number; no_change: number; error: number } | null>(null);
  const [error, setError] = useState("");

  const handleScan = async () => {
    setLoading(true);
    setResults(null);
    setSummary(null);
    setError("");
    try {
      const resp = await scanNetworks(isMovies ? "movie" : "series");
      setResults(resp.results);
      setSummary(resp.summary);
    } catch (err: any) {
      setError(err.message || "Error al escanear productoras.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-brand-card border border-brand-border rounded-2xl p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-white font-bold text-base mb-1">Escáner de Productoras</h2>
          <p className="text-gray-500 text-sm">
            Busca automáticamente en TMDB las productoras (Netflix, HBO, Disney+, etc.) para todas las {typeLabel} existentes.
          </p>
        </div>
        {!loading && !results && (
          <button
            onClick={handleScan}
            className="flex items-center gap-2 bg-brand-surface hover:bg-brand-border border border-brand-border text-white font-bold py-2 px-4 rounded-lg transition-colors text-sm"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Escanear ahora
          </button>
        )}
      </div>

      {loading && (
        <div className="py-8 flex flex-col items-center justify-center space-y-4">
          <div className="w-10 h-10 border-4 border-brand-red border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-400 text-sm animate-pulse">Escaneando metadatos en TMDB... Esto puede tardar unos minutos.</p>
        </div>
      )}

      {error && (
        <div className="bg-red-900/20 border border-red-800/40 rounded-lg px-4 py-3 text-red-400 text-sm">
          {error}
        </div>
      )}

      {summary && (
        <div className="flex flex-wrap gap-4 bg-brand-surface border border-brand-border rounded-xl px-5 py-4">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-400" />
            <span className="text-green-400 font-bold text-lg">{summary.updated}</span>
            <span className="text-gray-400 text-sm">actualizadas</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-gray-500" />
            <span className="text-gray-300 font-bold text-lg">{summary.no_change}</span>
            <span className="text-gray-400 text-sm">sin cambios</span>
          </div>
          {summary.error > 0 && (
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-red-500" />
              <span className="text-red-400 font-bold text-lg">{summary.error}</span>
              <span className="text-gray-400 text-sm">con error</span>
            </div>
          )}
        </div>
      )}

      {results && results.length > 0 && (
        <div className="border border-brand-border rounded-xl overflow-hidden max-h-[400px] overflow-y-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-brand-surface sticky top-0 z-10">
              <tr>
                <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Título</th>
                <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Productoras Detectadas</th>
                <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-border">
              {results.map((res) => (
                <tr key={res.id} className="hover:bg-brand-surface/40 transition-colors">
                  <td className="px-4 py-3 text-sm text-gray-200 font-medium">{res.title}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {res.new_networks.length > 0 ? (
                        res.new_networks.map((n) => (
                          <span key={n} className="text-[10px] bg-brand-red/10 border border-brand-red/20 text-brand-red px-1.5 py-0.5 rounded">
                            {n}
                          </span>
                        ))
                      ) : (
                        <span className="text-gray-600 text-xs italic">Ninguna</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                      res.status === "updated" ? "bg-green-900/30 text-green-400 border-green-800/40" :
                      res.status === "error" ? "bg-red-900/30 text-red-400 border-red-800/40" :
                      "bg-gray-800/60 text-gray-400 border-gray-700"
                    }`}>
                      {res.status === "updated" ? "Actualizado" : res.status === "error" ? "Error" : "Sin cambios"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      
      {results && (
        <button
          onClick={() => { setResults(null); setSummary(null); }}
          className="text-gray-500 hover:text-gray-300 text-sm transition-colors"
        >
          Limpiar resultados
        </button>
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
        <ScanNetworksSection key={`scan-${activeTab}`} tab={activeTab} />
        <BulkImportSection key={`bulk-${activeTab}`} tab={activeTab} />
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
