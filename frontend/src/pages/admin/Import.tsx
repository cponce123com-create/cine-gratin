import { useState, useMemo, useEffect } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { getMovies, getSeries, runAutoImport, importByIds, scanNetworks } from "@/lib/api";
import type { RunImportResult } from "@/lib/types";

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

// ─── Main Page Component ─────────────────────────────────────────────────────

const AUTO_IMPORT_SOURCES = [
  { id: "/trending/movie/day", label: "Películas Tendencia (Hoy)" },
  { id: "/trending/movie/week", label: "Películas Tendencia (Semana)" },
  { id: "/trending/tv/day", label: "Series Tendencia (Hoy)" },
  { id: "/trending/tv/week", label: "Series Tendencia (Semana)" },
  { id: "/movie/upcoming?language=es-MX&region=MX", label: "Próximos Estrenos (Cine)" },
  { id: "/movie/top_rated?language=es-MX", label: "Películas Mejor Valoradas" },
  { id: "/tv/top_rated?language=es-MX", label: "Series Mejor Valoradas" },
  { id: "/movie/popular?language=es-MX", label: "Películas Populares" },
  { id: "/tv/popular?language=es-MX", label: "Series Populares" },
];

export default function ImportPage() {
  const [tab, setTab] = useState<Tab>("movies");
  const [input, setInput] = useState("");
  const [phase, setPhase] = useState<Phase | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BulkDone | AutoDone | null>(null);

  // Auto-import config
  const [showAutoConfig, setShowAutoConfig] = useState(false);
  const [selectedSources, setSelectedSources] = useState<string[]>(() => {
    const saved = localStorage.getItem("auto_import_sources");
    return saved ? JSON.parse(saved) : AUTO_IMPORT_SOURCES.map(s => s.id);
  });

  useEffect(() => {
    localStorage.setItem("auto_import_sources", JSON.stringify(selectedSources));
  }, [selectedSources]);

  const toggleSource = (id: string) => {
    setSelectedSources(prev => 
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
    );
  };

  // Stats
  const [movieCount, setMovieCount] = useState(0);
  const [seriesCount, setSeriesCount] = useState(0);

  useEffect(() => {
    getMovies({ limit: 1 }).then((m) => setMovieCount(m.length ? 999 : 0)); // simple placeholder
    getSeries({ limit: 1 }).then((s) => setSeriesCount(s.length ? 999 : 0));
  }, []);

  const imdbIds = useMemo(() => extractImdbIds(input), [input]);

  const handleImport = async () => {
    if (imdbIds.length === 0) return;
    setPhase("snapshot_before");
    setError(null);
    setResult(null);

    try {
      setPhase("importing");
      const res = await importByIds(imdbIds, tab === "movies" ? "movie" : "series");
      setPhase("snapshot_after");
      setResult({ kind: "done", ids: res.results, summary: res.summary });
      setInput("");
    } catch (err: any) {
      setError(err.message || "Error desconocido al importar.");
    } finally {
      setPhase(null);
    }
  };

  const handleAutoImport = async () => {
    setPhase("snapshot_before");
    setError(null);
    setResult(null);

    try {
      setPhase("importing");
      const res = await runAutoImport(selectedSources);
      setPhase("snapshot_after");
      
      setResult({
        kind: "auto_done",
        newItems: [],
        apiResult: res,
      });
    } catch (err: any) {
      setError(err.message || "Error al ejecutar auto-import.");
    } finally {
      setPhase(null);
    }
  };

  return (
    <AdminLayout title="Importar Contenido">
      <div className="max-w-5xl mx-auto space-y-8 pb-20">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="space-y-1">
            <h1 className="text-3xl font-black text-white tracking-tight">Importador</h1>
            <p className="text-gray-500 text-sm max-w-md">
              Añade contenido masivamente usando IDs de IMDb o ejecuta el escáner automático de TMDB.
            </p>
          </div>

          <div className="flex bg-brand-surface p-1 rounded-xl border border-brand-border">
            <button
              onClick={() => setTab("movies")}
              className={`px-5 py-2 rounded-lg text-sm font-bold transition-all ${
                tab === "movies" ? "bg-brand-red text-white shadow-lg" : "text-gray-500 hover:text-gray-300"
              }`}
            >
              Películas
            </button>
            <button
              onClick={() => setTab("series")}
              className={`px-5 py-2 rounded-lg text-sm font-bold transition-all ${
                tab === "series" ? "bg-brand-red text-white shadow-lg" : "text-gray-500 hover:text-gray-300"
              }`}
            >
              Series
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column: Input */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-brand-card border border-brand-border rounded-2xl p-6 space-y-5">
              <div className="relative">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={`Pega una lista de IDs de IMDb (tt1234567), URLs de IMDb, o texto que contenga IDs...`}
                  className="w-full bg-brand-surface border border-brand-border rounded-xl px-5 py-4 text-gray-200 text-sm focus:outline-none focus:border-gray-500 transition-colors min-h-[240px] resize-none font-mono"
                  disabled={phase !== null}
                />
                {imdbIds.length > 0 && (
                  <div className="absolute bottom-4 right-4 bg-brand-red/10 border border-brand-red/20 px-3 py-1 rounded-full">
                    <span className="text-brand-red text-xs font-bold">{imdbIds.length} IDs detectados</span>
                  </div>
                )}
              </div>

              {/* Auto-import config panel */}
              <div className="border border-brand-border rounded-xl overflow-hidden">
                <button
                  onClick={() => setShowAutoConfig(!showAutoConfig)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-brand-surface/50 hover:bg-brand-surface transition-colors"
                >
                  <span className="text-sm font-bold text-gray-300 flex items-center gap-2">
                    ⚙️ Configuración del escáner automático
                  </span>
                  <svg 
                    className={`w-4 h-4 text-gray-500 transition-transform ${showAutoConfig ? "rotate-180" : ""}`} 
                    viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                  >
                    <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
                
                {showAutoConfig && (
                  <div className="p-4 bg-brand-card border-t border-brand-border grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {AUTO_IMPORT_SOURCES.map(source => (
                      <label key={source.id} className="flex items-center gap-3 group cursor-pointer">
                        <div className="relative flex items-center">
                          <input
                            type="checkbox"
                            checked={selectedSources.includes(source.id)}
                            onChange={() => toggleSource(source.id)}
                            className="peer appearance-none w-5 h-5 border border-brand-border rounded bg-brand-surface checked:bg-brand-red checked:border-brand-red transition-all"
                          />
                          <svg className="absolute w-3.5 h-3.5 text-white left-0.5 opacity-0 peer-checked:opacity-100 transition-opacity pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4">
                            <polyline points="20 6 9 17 4 12" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </div>
                        <span className="text-xs text-gray-400 group-hover:text-gray-200 transition-colors">
                          {source.label}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={handleImport}
                  disabled={phase !== null || imdbIds.length === 0}
                  className="flex-1 bg-white hover:bg-gray-200 text-black font-black py-3.5 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {phase === "importing" ? (
                    <span className="w-5 h-5 border-3 border-black border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M12 5v14m7-7H5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                  Importar {imdbIds.length > 0 ? `${imdbIds.length} títulos` : "ahora"}
                </button>

                <button
                  onClick={() => setInput("")}
                  disabled={phase !== null || !input}
                  className="px-6 py-3.5 bg-brand-surface border border-brand-border text-gray-400 hover:text-white hover:border-gray-600 rounded-xl font-bold transition-all disabled:opacity-30"
                >
                  Limpiar
                </button>
              </div>
            </div>

            {/* Results Section */}
            {phase && <PhaseProgress phase={phase} />}

            {error && (
              <div className="bg-red-900/20 border border-red-800/40 rounded-2xl p-5 flex gap-4">
                <div className="w-10 h-10 bg-red-500/20 rounded-full flex items-center justify-center flex-shrink-0 text-red-500">
                  <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                </div>
                <div className="space-y-1">
                  <p className="text-red-400 font-bold">Error de importación</p>
                  <p className="text-red-400/70 text-sm leading-relaxed whitespace-pre-wrap">{error}</p>
                </div>
              </div>
            )}

            {result?.kind === "done" && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <SummaryBar {...result.summary} />

                <div className="bg-brand-card border border-brand-border rounded-2xl overflow-hidden">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-brand-surface/50 border-b border-brand-border">
                        <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">IMDb ID</th>
                        <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Título</th>
                        <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">
                          Estado
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.ids.map((res) => (
                        <IdRow key={res.imdb_id} result={res} />
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {result?.kind === "auto_done" && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="bg-green-500/10 border border-green-500/20 rounded-2xl p-6 flex gap-5">
                  <div className="w-12 h-12 bg-green-500/20 rounded-full flex items-center justify-center flex-shrink-0 text-green-400">
                    <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M20 6 9 17 4 12" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-green-400 font-bold text-xl">Auto-importación completada</h3>
                    <p className="text-green-400/60 text-sm mt-1">
                      Se han procesado {result.apiResult.total_checked} títulos.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="bg-brand-card border border-brand-border rounded-2xl p-5">
                    <p className="text-gray-500 text-xs font-bold uppercase mb-3">Películas</p>
                    <div className="flex items-end gap-2">
                      <span className="text-3xl font-black text-white">{result.apiResult.movies_imported}</span>
                      <span className="text-gray-500 text-sm mb-1">añadidas</span>
                    </div>
                  </div>
                  <div className="bg-brand-card border border-brand-border rounded-2xl p-5">
                    <p className="text-gray-500 text-xs font-bold uppercase mb-3">Series</p>
                    <div className="flex items-end gap-2">
                      <span className="text-3xl font-black text-white">{result.apiResult.series_imported}</span>
                      <span className="text-gray-500 text-sm mb-1">añadidas</span>
                    </div>
                  </div>
                </div>

                {result.newItems.length > 0 && (
                  <div className="bg-brand-card border border-brand-border rounded-2xl p-6">
                    <h4 className="text-white font-bold mb-4">Nuevos títulos añadidos</h4>
                    <div className="space-y-3">
                      {result.newItems.map((item, i) => (
                        <div key={i} className="flex items-center justify-between py-2 border-b border-brand-border last:border-0">
                          <span className="text-gray-200 text-sm font-medium">{item.title}</span>
                          <span className="text-gray-500 text-xs font-mono">{item.imdb_id}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right Column: Tools */}
          <div className="space-y-6">
            <div className="bg-brand-card border border-brand-border rounded-2xl p-6 space-y-5">
              <div>
                <h2 className="text-white font-bold text-base mb-1">Auto-import TMDB</h2>
                <p className="text-gray-500 text-sm">
                  Ejecuta el proceso automático de TMDB y muestra exactamente qué se añadió al catálogo.
                </p>
              </div>

              <button
                onClick={handleAutoImport}
                disabled={phase !== null}
                className="w-full bg-brand-surface border border-brand-border hover:border-gray-500 text-white font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
                  <path d="M21 3v5h-5" />
                </svg>
                Ejecutar ahora
              </button>
            </div>
            
            <div className="bg-brand-card border border-brand-border rounded-2xl p-6 space-y-5">
              <div>
                <h2 className="text-white font-bold text-base mb-1">Utilidades</h2>
                <p className="text-gray-500 text-sm">
                  Otras herramientas para el mantenimiento del catálogo.
                </p>
              </div>

              <div className="space-y-2">
                <button 
                  onClick={() => scanNetworks("movie")}
                  className="w-full text-left px-4 py-3 rounded-xl bg-brand-surface border border-brand-border hover:border-brand-red/50 transition-all group"
                >
                  <p className="text-white text-sm font-bold group-hover:text-brand-red">Escanear Productoras</p>
                  <p className="text-gray-500 text-xs mt-0.5">Busca Netflix, HBO, etc. en TMDB para las películas actuales.</p>
                </button>
                

              </div>
            </div>
          </div>
        </div>

        {/* Full Width Section: Collection Import */}
        <div className="w-full">
          
        </div>
      </div>
    </AdminLayout>
  );
}
