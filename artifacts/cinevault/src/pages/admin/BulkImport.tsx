import { useState, useRef } from "react";
import {
  Upload, Play, Square, CheckCircle2, XCircle, Loader2,
  AlertCircle, SkipForward, Hash, FileText, RotateCcw, Download,
} from "lucide-react";
import { apiSaveMovie, apiGetMovies, apiGetServers, DEFAULT_SERVERS } from "@/lib/api-client";
import { uid } from "@/lib/admin-db";
import { toast } from "sonner";

interface ImportResult {
  imdb_id: string;
  status: "pending" | "fetching" | "success" | "error" | "skipped" | "not_movie";
  title?: string;
  year?: number;
  error?: string;
}

const DELAY_MS = 350; // ~170 req/min, well under TMDB's 40 req/10s limit

function sleep(ms: number) {
  return new Promise(res => setTimeout(res, ms));
}

function extractImdbIds(text: string): string[] {
  const matches = text.match(/tt\d{7,8}/g) || [];
  return [...new Set(matches)];
}

function generateSequentialIds(from: string, to: string): string[] {
  const fromNum = parseInt(from.replace("tt", "").replace(/\D/g, ""), 10);
  const toNum = parseInt(to.replace("tt", "").replace(/\D/g, ""), 10);
  if (isNaN(fromNum) || isNaN(toNum) || fromNum > toNum) return [];
  const ids: string[] = [];
  for (let i = fromNum; i <= Math.min(toNum, fromNum + 999); i++) {
    ids.push(`tt${String(i).padStart(7, "0")}`);
  }
  return ids;
}

export function BulkImport() {
  const [mode, setMode] = useState<"list" | "sequential">("list");
  const [listText, setListText] = useState("");
  const [seqFrom, setSeqFrom] = useState("tt0111161");
  const [seqTo, setSeqTo] = useState("tt0111200");
  const [skipExisting, setSkipExisting] = useState(true);
  const [onlyMovies, setOnlyMovies] = useState(true);

  const [results, setResults] = useState<ImportResult[]>([]);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const abortRef = useRef(false);

  const successCount = results.filter(r => r.status === "success").length;
  const errorCount = results.filter(r => r.status === "error").length;
  const skippedCount = results.filter(r => r.status === "skipped" || r.status === "not_movie").length;
  const pendingCount = results.filter(r => r.status === "pending" || r.status === "fetching").length;
  const progress = results.length > 0 ? Math.round(((results.length - pendingCount) / results.length) * 100) : 0;

  const updateResult = (imdb_id: string, patch: Partial<ImportResult>) => {
    setResults(prev => prev.map(r => r.imdb_id === imdb_id ? { ...r, ...patch } : r));
  };

  const startImport = async () => {
    let ids: string[] = [];

    if (mode === "list") {
      ids = extractImdbIds(listText);
      if (ids.length === 0) {
        toast.error("No se encontraron IDs de IMDb válidos. Usa el formato tt0111161.");
        return;
      }
    } else {
      ids = generateSequentialIds(seqFrom, seqTo);
      if (ids.length === 0) {
        toast.error("Rango inválido. Asegúrate de que el ID inicial sea menor al final.");
        return;
      }
      if (ids.length > 1000) {
        toast.error("Máximo 1000 IDs por sesión en modo secuencial.");
        return;
      }
    }

    // Get existing movies to skip duplicates
    let existingIds = new Set<string>();
    if (skipExisting) {
      try {
        const existing = await apiGetMovies();
        existingIds = new Set(existing.map(m => m.imdb_id));
      } catch { /* ignore */ }
    }

    // Get servers for video sources
    const servers = await apiGetServers().catch(() => DEFAULT_SERVERS);
    const activeServers = servers.filter(s => s.active).sort((a, b) => a.order - b.order);

    // Initialize results
    const initial: ImportResult[] = ids.map(id => ({
      imdb_id: id,
      status: skipExisting && existingIds.has(id) ? "skipped" : "pending",
    }));
    setResults(initial);
    setRunning(true);
    setDone(false);
    abortRef.current = false;

    const pendingIds = initial.filter(r => r.status === "pending").map(r => r.imdb_id);

    for (const imdb_id of pendingIds) {
      if (abortRef.current) break;

      updateResult(imdb_id, { status: "fetching" });

      try {
        const res = await fetch(`/api/tmdb/movie/${imdb_id}`);
        const data = await res.json();

        if (!res.ok || data.error) {
          updateResult(imdb_id, { status: "error", error: data.error || "Error de TMDB" });
          await sleep(DELAY_MS);
          continue;
        }

        // Skip if not a movie (TV shows, shorts, etc.)
        if (onlyMovies && data.runtime < 40) {
          updateResult(imdb_id, { status: "not_movie", title: data.title, year: data.year, error: `Duración: ${data.runtime || 0} min` });
          await sleep(DELAY_MS);
          continue;
        }

        // Build video sources
        const video_sources = activeServers.map(s => ({
          id: uid(),
          name: s.name,
          url: s.url_pattern.replace("{IMDB_ID}", imdb_id),
          active: true,
        }));

        // Save movie
        const movie = {
          id: imdb_id,
          imdb_id: data.imdb_id || imdb_id,
          title: data.title || "Sin título",
          year: data.year || 0,
          rating: data.rating || 0,
          runtime: data.runtime || 0,
          genres: data.genres || [],
          language: data.language || "en",
          synopsis: data.synopsis || "",
          director: data.director || "",
          cast_list: (data.cast || []).map((c: { name: string }) => c.name),
          poster_url: data.poster_url || "",
          background_url: data.background_url || "",
          yt_trailer_code: data.yt_trailer_code || "",
          mpa_rating: data.mpa_rating || "NR",
          slug: (data.title || imdb_id).toLowerCase().replace(/[^a-z0-9]+/g, "-"),
          featured: false,
          video_sources,
          torrents: [],
          views: 0,
          date_added: new Date().toISOString(),
        };

        await apiSaveMovie(movie);
        updateResult(imdb_id, { status: "success", title: data.title, year: data.year });
      } catch (e) {
        updateResult(imdb_id, { status: "error", error: String(e) });
      }

      await sleep(DELAY_MS);
    }

    setRunning(false);
    setDone(true);

    if (!abortRef.current) {
      toast.success(`Importación completada: ${successCount + 1} éxitos`);
    }
  };

  const stopImport = () => {
    abortRef.current = true;
    setRunning(false);
    toast.info("Importación detenida");
  };

  const reset = () => {
    setResults([]);
    setDone(false);
    abortRef.current = false;
  };

  const exportLog = () => {
    const lines = results.map(r =>
      `${r.status.toUpperCase().padEnd(10)} ${r.imdb_id}  ${r.title || ""}  ${r.year || ""}  ${r.error || ""}`
    ).join("\n");
    const blob = new Blob([lines], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cinevault_import_log_${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const statusIcon = (s: ImportResult["status"]) => {
    if (s === "success") return <CheckCircle2 className="w-3.5 h-3.5 text-[#3fb950] flex-shrink-0" />;
    if (s === "error") return <XCircle className="w-3.5 h-3.5 text-[#f85149] flex-shrink-0" />;
    if (s === "skipped") return <SkipForward className="w-3.5 h-3.5 text-[#8b949e] flex-shrink-0" />;
    if (s === "not_movie") return <AlertCircle className="w-3.5 h-3.5 text-[#e3b341] flex-shrink-0" />;
    if (s === "fetching") return <Loader2 className="w-3.5 h-3.5 text-[#58a6ff] flex-shrink-0 animate-spin" />;
    return <div className="w-3.5 h-3.5 rounded-full border border-[#30363d] flex-shrink-0" />;
  };

  const statusColor = (s: ImportResult["status"]) => {
    if (s === "success") return "bg-[#238636]/5 border-[#238636]/20";
    if (s === "error") return "bg-[#da3633]/5 border-[#da3633]/20";
    if (s === "fetching") return "bg-[#58a6ff]/5 border-[#58a6ff]/20";
    if (s === "not_movie") return "bg-[#e3b341]/5 border-[#e3b341]/20";
    return "border-transparent";
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-[#c9d1d9] mb-1">Importación Masiva</h1>
        <p className="text-[#8b949e] text-sm">
          Importa cientos de películas automáticamente desde TMDB usando IDs de IMDb
        </p>
      </div>

      {/* Mode selector */}
      <div className="flex border-b border-[#30363d]">
        {([["list", "Lista de IDs", FileText], ["sequential", "Rango Secuencial", Hash]] as const).map(([id, label, Icon]) => (
          <button
            key={id}
            onClick={() => setMode(id)}
            disabled={running}
            className={`flex items-center gap-2 px-6 py-3 text-sm font-bold uppercase tracking-wider transition-colors ${
              mode === id
                ? "text-[#3fb950] border-b-2 border-[#238636]"
                : "text-[#8b949e] hover:text-[#c9d1d9]"
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Config */}
      {!running && !done && (
        <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-6 space-y-5">
          {mode === "list" ? (
            <div>
              <label className="block text-[#8b949e] text-xs font-mono uppercase tracking-wider mb-2">
                IDs de IMDb (uno por línea, o pega URLs de IMDB)
              </label>
              <textarea
                value={listText}
                onChange={e => setListText(e.target.value)}
                placeholder={"tt0111161\ntt0068646\ntt0468569\nhttps://www.imdb.com/title/tt0816692/\n\nTambién puedes pegar texto y se extraen automáticamente."}
                rows={10}
                className="w-full bg-[#0d1117] border border-[#30363d] focus:border-[#238636] text-[#c9d1d9] rounded-lg px-4 py-3 text-sm font-mono outline-none resize-y placeholder:text-[#484f58]"
              />
              {listText && (
                <p className="text-[#8b949e] text-xs font-mono mt-1.5">
                  {extractImdbIds(listText).length} IDs detectados
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-[#e3b341]/10 border border-[#e3b341]/30 rounded-lg px-4 py-3">
                <p className="text-[#e3b341] text-xs font-mono">
                  ⚠ El modo secuencial prueba cada número consecutivo. La mayoría no existirá o serán cortos/TV.
                  Máximo 1000 IDs por sesión. Recomendado: usar Lista de IDs con títulos conocidos.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[#8b949e] text-xs font-mono uppercase tracking-wider mb-1.5">Desde</label>
                  <input
                    value={seqFrom}
                    onChange={e => setSeqFrom(e.target.value)}
                    placeholder="tt0000001"
                    className="w-full bg-[#0d1117] border border-[#30363d] focus:border-[#238636] text-[#c9d1d9] rounded-lg px-3 py-2.5 text-sm font-mono outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[#8b949e] text-xs font-mono uppercase tracking-wider mb-1.5">Hasta</label>
                  <input
                    value={seqTo}
                    onChange={e => setSeqTo(e.target.value)}
                    placeholder="tt0000100"
                    className="w-full bg-[#0d1117] border border-[#30363d] focus:border-[#238636] text-[#c9d1d9] rounded-lg px-3 py-2.5 text-sm font-mono outline-none"
                  />
                </div>
              </div>
              {seqFrom && seqTo && (
                <p className="text-[#8b949e] text-xs font-mono">
                  {generateSequentialIds(seqFrom, seqTo).length} IDs en el rango
                </p>
              )}
            </div>
          )}

          {/* Options */}
          <div className="border-t border-[#30363d] pt-4 space-y-3">
            <p className="text-[#8b949e] text-xs font-mono uppercase tracking-wider">Opciones</p>
            <label className="flex items-center gap-3 cursor-pointer">
              <button
                onClick={() => setSkipExisting(!skipExisting)}
                className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 ${skipExisting ? "bg-[#238636]" : "bg-[#30363d]"}`}
              >
                <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${skipExisting ? "translate-x-4" : ""}`} />
              </button>
              <div>
                <p className="text-[#c9d1d9] text-sm">Omitir películas ya existentes</p>
                <p className="text-[#8b949e] text-xs">Si la película ya está en la base de datos, se saltea</p>
              </div>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <button
                onClick={() => setOnlyMovies(!onlyMovies)}
                className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 ${onlyMovies ? "bg-[#238636]" : "bg-[#30363d]"}`}
              >
                <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${onlyMovies ? "translate-x-4" : ""}`} />
              </button>
              <div>
                <p className="text-[#c9d1d9] text-sm">Solo películas largas (duración &gt; 40 min)</p>
                <p className="text-[#8b949e] text-xs">Filtra cortos, clips y episodios de TV</p>
              </div>
            </label>
          </div>

          <button
            onClick={startImport}
            className="flex items-center gap-2 bg-[#238636] hover:bg-[#2ea043] text-white px-6 py-3 rounded-lg font-bold text-sm transition-colors"
            data-testid="btn-start-bulk-import"
          >
            <Play className="w-4 h-4" />
            Iniciar Importación
          </button>
        </div>
      )}

      {/* Progress */}
      {(running || done) && results.length > 0 && (
        <div className="space-y-4">
          {/* Stats bar */}
          <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-[#c9d1d9] font-bold text-sm">
                {running ? "Importando..." : done ? "Importación Completa" : ""}
              </h2>
              <div className="flex items-center gap-2">
                {running && (
                  <button
                    onClick={stopImport}
                    className="flex items-center gap-1.5 bg-[#da3633]/10 border border-[#da3633]/30 text-[#f85149] px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-[#da3633]/20 transition-colors"
                  >
                    <Square className="w-3.5 h-3.5" />
                    Detener
                  </button>
                )}
                {done && (
                  <>
                    <button
                      onClick={exportLog}
                      className="flex items-center gap-1.5 bg-[#21262d] border border-[#30363d] text-[#8b949e] hover:text-[#c9d1d9] px-3 py-1.5 rounded-lg text-xs font-bold transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Exportar log
                    </button>
                    <button
                      onClick={reset}
                      className="flex items-center gap-1.5 bg-[#238636] hover:bg-[#2ea043] text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-colors"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Nueva importación
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Progress bar */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[#8b949e] text-xs font-mono">{progress}% completado</span>
                <span className="text-[#8b949e] text-xs font-mono">{results.length - pendingCount} / {results.length}</span>
              </div>
              <div className="h-2 bg-[#21262d] rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-[#238636] to-[#3fb950] rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>

            {/* Counts */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Importadas", count: successCount, color: "#3fb950", bg: "rgba(35,134,54,0.1)" },
                { label: "Errores", count: errorCount, color: "#f85149", bg: "rgba(218,54,51,0.1)" },
                { label: "Omitidas", count: skippedCount, color: "#8b949e", bg: "rgba(139,148,158,0.1)" },
                { label: "Pendientes", count: pendingCount, color: "#58a6ff", bg: "rgba(88,166,255,0.1)" },
              ].map(s => (
                <div key={s.label} className="rounded-lg p-3 text-center" style={{ background: s.bg }}>
                  <p className="text-xl font-bold font-mono" style={{ color: s.color }}>{s.count}</p>
                  <p className="text-[#8b949e] text-xs mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Result list */}
          <div className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-[#30363d] text-[#8b949e] text-xs font-mono uppercase tracking-wider">
              Detalle de resultados
            </div>
            <div className="divide-y divide-[#21262d] max-h-[500px] overflow-y-auto">
              {[...results].reverse().map(r => (
                <div
                  key={r.imdb_id}
                  className={`flex items-center gap-3 px-4 py-2.5 border-l-2 transition-colors ${statusColor(r.status)}`}
                >
                  {statusIcon(r.status)}
                  <span className="text-[#58a6ff] font-mono text-xs w-20 flex-shrink-0">{r.imdb_id}</span>
                  <span className="text-[#c9d1d9] text-sm flex-1 truncate">
                    {r.title ? `${r.title} ${r.year ? `(${r.year})` : ""}` : (
                      r.status === "pending" ? <span className="text-[#484f58]">En espera...</span>
                      : r.status === "fetching" ? <span className="text-[#58a6ff]">Buscando en TMDB...</span>
                      : "—"
                    )}
                  </span>
                  {r.error && (
                    <span className="text-[#f85149] text-xs font-mono flex-shrink-0 hidden sm:block truncate max-w-[180px]" title={r.error}>
                      {r.error}
                    </span>
                  )}
                  <span className={`text-[10px] font-mono font-bold flex-shrink-0 uppercase ${
                    r.status === "success" ? "text-[#3fb950]"
                    : r.status === "error" ? "text-[#f85149]"
                    : r.status === "fetching" ? "text-[#58a6ff]"
                    : r.status === "not_movie" ? "text-[#e3b341]"
                    : "text-[#484f58]"
                  }`}>
                    {r.status === "not_movie" ? "corto/TV" : r.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tips */}
      {!running && !done && (
        <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-5 space-y-3">
          <h3 className="text-[#c9d1d9] font-bold text-sm">Consejos para la migración masiva</h3>
          <ul className="space-y-2">
            {[
              "Puedes obtener listas de IDs de IMDb desde sitios como IMDb Watchlist, Letterboxd, JustWatch o listas de \"Top 250\".",
              "Copia cualquier página que tenga IDs de IMDb y pégala directamente — el sistema extrae solo los códigos tt automáticamente.",
              "El importador respeta los límites de TMDB (~170 películas/minuto). Para catálogos grandes, hazlo en múltiples sesiones.",
              "Usa \"Omitir existentes\" para poder reiniciar sin duplicar si hay interrupciones.",
              "El log de resultados se puede exportar para saber qué falló y reintentarlo.",
            ].map((tip, i) => (
              <li key={i} className="flex items-start gap-2 text-[#8b949e] text-xs">
                <span className="text-[#238636] font-mono flex-shrink-0 mt-0.5">→</span>
                {tip}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
