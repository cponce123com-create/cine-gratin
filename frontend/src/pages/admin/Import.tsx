import { useState, useMemo, useRef, useEffect } from "react";
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

function extractTmdbCollectionIds(text: string): number[] {
  const ids: number[] = [];
  
  // 1. Buscar URLs de TMDB con patrón /collection/(\d+)
  const urlMatches = Array.from(text.matchAll(/\/collection\/(\d+)/g));
  for (const match of urlMatches) {
    ids.push(parseInt(match[1], 10));
  }
  
  // 2. Buscar números de 2 a 7 dígitos que no sean parte de una URL ya capturada
  // Eliminamos las URLs del texto para evitar capturar sus números
  const cleanText = text.replace(/https?:\/\/[^\s]+/g, " ");
  const numMatches = cleanText.match(/\b\d{2,7}\b/g) ?? [];
  for (const num of numMatches) {
    ids.push(parseInt(num, 10));
  }
  
  const result = [...new Set(ids)];
  console.log("IDs de colección extraídos:", result);
  return result;
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
      
      // Map backend response to AutoDone structure
      // Note: Backend returns movies_imported, series_imported, total_checked
      // Import.tsx expects added_movies, added_series, processed_movies, processed_series
      // We'll adapt the result to match what the UI expects
      const adaptedResult: RunImportResult = {
        ...res,
        added_movies: (res as any).added_movies || [],
        added_series: (res as any).added_series || [],
        processed_movies: res.movies_imported || 0,
        processed_series: res.series_imported || 0,
      };

      setResult({
        kind: "auto_done",
        newItems: adaptedResult.added_movies.concat(adaptedResult.added_series as any[]),
        apiResult: adaptedResult,
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
                      Se han procesado {result.apiResult.processed_movies + result.apiResult.processed_series} títulos.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="bg-brand-card border border-brand-border rounded-2xl p-5">
                    <p className="text-gray-500 text-xs font-bold uppercase mb-3">Películas</p>
                    <div className="flex items-end gap-2">
                      <span className="text-3xl font-black text-white">{result.apiResult.added_movies.length}</span>
                      <span className="text-gray-500 text-sm mb-1">añadidas</span>
                    </div>
                  </div>
                  <div className="bg-brand-card border border-brand-border rounded-2xl p-5">
                    <p className="text-gray-500 text-xs font-bold uppercase mb-3">Series</p>
                    <div className="flex items-end gap-2">
                      <span className="text-3xl font-black text-white">{result.apiResult.added_series.length}</span>
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
            <CollectionImportSection />

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
                
                <button 
                  onClick={() => { /* logic for collection sync */ }}
                  className="w-full text-left px-4 py-3 rounded-xl bg-brand-surface border border-brand-border hover:border-brand-red/50 transition-all group"
                >
                  <p className="text-white text-sm font-bold group-hover:text-brand-red">Sincronizar Sagas</p>
                  <p className="text-gray-500 text-xs mt-0.5">Escanea las películas actuales y las vincula correctamente a sus sagas oficiales usando metadatos de TMDB.</p>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}

const COLLECTIONS = SAGA_SECTIONS.filter(s => s.collection_id).map(s => ({ id: s.collection_id!, label: s.label }));

function CollectionImportSection() {
  const [customInput, setCustomInput] = useState("");
  const [loading, setLoading] = useState<number | null>(null);
  const [reseting, setReseting] = useState<number | null>(null);
  const [results, setResults] = useState<Record<number, { collection: string; imported: number; existed: number; total: number; deleted?: number }>>({});
  const [error, setError] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scanDone, setScanDone] = useState(false);
  const [scanProgress, setScanProgress] = useState({ current: 0, total: 0, updated: 0, no_collection: 0, error: 0, title: "" });
  const scanEsRef = useRef<EventSource | null>(null);

  const detectedIds = useMemo(() => extractTmdbCollectionIds(customInput), [customInput]);

  const handleScanCollections = () => {
    if (scanEsRef.current) scanEsRef.current.close();
    setScanning(true);
    setScanDone(false);
    setScanProgress({ current: 0, total: 0, updated: 0, no_collection: 0, error: 0, title: "" });

    const token = localStorage.getItem("cg_admin_token") ?? "";
    // Send all known collection IDs so backend only scans those
    const allIds = COLLECTIONS.map(c => c.id).join(",");
    const params = new URLSearchParams();
    if (token) params.set("token", token);
    params.set("ids", allIds);
    const url = `/api/admin/scan-collections-stream?${params.toString()}`;
    const es = new EventSource(url);
    scanEsRef.current = es;

    es.addEventListener("start", (e) => {
      const d = JSON.parse(e.data);
      setScanProgress(p => ({ ...p, total: d.total }));
    });
    es.addEventListener("progress", (e) => {
      const d = JSON.parse(e.data);
      setScanProgress({
        current: d.i, total: d.total,
        updated: d.updated, no_collection: d.not_found, error: d.error,
        title: d.collection || "",
      });
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
      setError(e.message || `Error al importar la colección ${id}.`);
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

  const [importProgress, setImportProgress] = useState<{ current: number; total: number; lastId: number | null; lastTitle: string } | null>(null);

  const handleCustomImport = async () => {
    if (detectedIds.length === 0) {
      setError("No se detectaron IDs de colección válidos en el texto.");
      return;
    }
    
    setImportProgress({ current: 0, total: detectedIds.length, lastId: null, lastTitle: "" });
    setError("");

    try {
      // Importamos uno por uno
      for (let i = 0; i < detectedIds.length; i++) {
        const id = detectedIds[i];
        setImportProgress(p => p ? { ...p, current: i + 1, lastId: id } : null);
        
        try {
          const res = await importCollection(id);
          setImportProgress(p => p ? { ...p, lastTitle: res.collection } : null);
          setResults(prev => ({ 
            ...prev, 
            [id]: { 
              ...prev[id], 
              collection: res.collection, 
              imported: res.imported, 
              existed: res.existed, 
              total: res.total 
            } 
          }));
        } catch (e: any) {
          console.error(`Error importando ID ${id}:`, e);
          // No detenemos todo el proceso por un error individual, pero lo notificamos
          setError(prev => (prev ? prev + "\n" : "") + `Error en ID ${id}: ${e.message || "Error desconocido"}`);
        }
      }
      setCustomInput(""); // Limpiar al terminar solo si tuvo éxito parcial/total
    } catch (e: any) {
      setError(e.message || "Error crítico durante la importación masiva.");
    } finally {
      setImportProgress(null);
    }
  };

  return (
    <div className="bg-brand-card border border-brand-border rounded-2xl p-6 space-y-5">
      <div>
        <h2 className="text-white font-bold text-base mb-1">Importar por Colección TMDB</h2>
        <p className="text-gray-500 text-sm">
          Importa todas las películas de una saga completa usando el ID de colección de TMDB. Puedes pegar URLs, listas o texto libre.
        </p>
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-800/40 rounded-lg px-4 py-3 text-red-400 text-sm whitespace-pre-wrap">{error}</div>
      )}

      {/* Scan collections button */}
      <div className="bg-brand-surface border border-brand-border rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-white text-sm font-semibold">Escanear colecciones existentes</p>
            <p className="text-gray-500 text-xs mt-0.5">Asigna el collection_id correcto a las películas de tus {COLLECTIONS.length} sagas configuradas. Necesario para que las sagas aparezcan correctas en el Home.</p>
          </div>
          <div className="flex flex-col items-end gap-2">

            {!scanning ? (
              <button onClick={handleScanCollections}
                className="flex items-center gap-2 bg-brand-red hover:bg-red-700 text-white text-xs font-bold px-3 py-2 rounded-lg transition-colors">
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35" strokeLinecap="round"/></svg>
                {scanDone ? "Re-escanear" : "Escanear ahora"}
              </button>
            ) : (
              <button onClick={() => { scanEsRef.current?.close(); setScanning(false); }}
                className="bg-gray-700 hover:bg-gray-600 text-white text-xs font-bold px-3 py-2 rounded-lg transition-colors">
                Detener
              </button>
            )}
          </div>
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
              <span className="text-green-400">✅ {scanProgress.updated} películas vinculadas</span>
              <span className="text-gray-500">— {scanProgress.no_collection} sagas sin match</span>
              {scanProgress.error > 0 && <span className="text-red-400">❌ {scanProgress.error} errores</span>}
            </div>
          </div>
        )}
      </div>

      {/* Custom collection ID input - MEJORADO */}
      <div className="space-y-3">
        <div className="relative">
          <textarea
            value={customInput}
            onChange={e => setCustomInput(e.target.value)}
            placeholder="Pega URLs de TMDB, IDs sueltos, o texto mezclado (ej: Harry Potter 1241, Jurassic 328...)"
            className="w-full bg-brand-surface border border-brand-border rounded-xl px-4 py-3 text-gray-200 text-sm focus:outline-none focus:border-gray-500 transition-colors min-h-[120px] resize-y"
          />
          <button
            onClick={handleCustomImport}
            disabled={loading !== null || importProgress !== null || detectedIds.length === 0}
            className="absolute bottom-3 right-3 flex items-center gap-2 bg-brand-red hover:bg-red-700 text-white text-sm font-bold px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
          >
            {loading !== null || importProgress !== null ? (
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M12 5v14m7-7H5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
            Importar {detectedIds.length > 0 ? `(${detectedIds.length})` : ""}
          </button>
        </div>

        {importProgress && (
          <div className="bg-brand-surface border border-brand-border rounded-xl p-4 space-y-2">
            <div className="flex justify-between text-xs text-gray-400">
              <span>Importando colección {importProgress.current} de {importProgress.total}</span>
              <span>ID: {importProgress.lastId} {importProgress.lastTitle && `— ${importProgress.lastTitle}`}</span>
            </div>
            <div className="w-full bg-brand-border rounded-full h-1.5">
              <div 
                className="h-1.5 rounded-full bg-brand-red transition-all duration-300" 
                style={{ width: `${(importProgress.current / importProgress.total) * 100}%` }} 
              />
            </div>
          </div>
        )}
        
        {detectedIds.length > 0 && !importProgress && (
          <div className="flex flex-wrap items-center gap-2 px-1">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">IDs detectados:</span>
            {detectedIds.map(id => (
              <span key={id} className="inline-flex items-center bg-brand-surface border border-brand-border px-2 py-0.5 rounded text-xs font-mono text-brand-red">
                {id}
              </span>
            ))}
          </div>
        )}
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
                  className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-lg bg-brand-surface border border-brand-border text-gray-500 hover:text-white hover:border-gray-500 transition-colors disabled:opacity-50"
                >
                  {isLoading ? (
                    <span className="w-3 h-3 rounded-full border-2 border-white border-t-transparent animate-spin" />
                  ) : (
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
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
