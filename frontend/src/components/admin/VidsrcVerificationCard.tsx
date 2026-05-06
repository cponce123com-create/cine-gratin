import { useState } from "react";
import { toast } from "sonner";
import { getMovies, getSeries, saveVidsrcResults, cleanupNoVidsrc } from "@/lib/api";
import { WifiIcon, TrashIcon } from "./icons";

type VidsrcPhase = "idle" | "fetching" | "verifying" | "done" | "cleaning";

interface VidsrcProgress {
  checked: number;
  total: number;
}

interface VidsrcCounts {
  active: number;
  inactive: number;
}

async function fetchVidsrcList(
  type: "movie" | "series",
  onProgress: (page: number) => void,
): Promise<Set<string>> {
  const available = new Set<string>();
  const base =
    type === "series"
      ? "https://vidsrc.me/tvshows/latest/page-"
      : "https://vidsrc.me/movies/latest/page-";

  let consecutiveFailures = 0;
  for (let page = 1; page <= 999; page++) {
    try {
      const res = await fetch(`${base}${page}.json`, { credentials: "omit" });
      if (!res.ok) {
        consecutiveFailures++;
        if (consecutiveFailures >= 3) break;
        continue;
      }
      const data = (await res.json()) as { title?: string; imdb_id?: string }[];
      if (!Array.isArray(data) || data.length === 0) break;
      consecutiveFailures = 0;
      for (const item of data) {
        if (item.imdb_id) available.add(item.imdb_id);
      }
      onProgress(page);
    } catch {
      break;
    }
  }
  return available;
}

export default function VidsrcVerificationCard() {
  const [phase, setPhase] = useState<VidsrcPhase>("idle");
  const [cleaning, setCleaning] = useState(false);
  const [progress, setProgress] = useState<VidsrcProgress>({ checked: 0, total: 0 });
  const [counts, setCounts] = useState<VidsrcCounts>({ active: 0, inactive: 0 });
  const [cleanResult, setCleanResult] = useState<{
    movies: number;
    series: number;
    total: number;
  } | null>(null);

  const handleVerify = async () => {
    setPhase("fetching");
    setProgress({ checked: 0, total: 0 });
    setCounts({ active: 0, inactive: 0 });
    setCleanResult(null);
    try {
      let pagesLoaded = 0;
      const updatePages = (p: number) => {
        pagesLoaded = p;
        setProgress({ checked: p, total: 0 });
      };

      const [movieSet, seriesSet] = await Promise.all([
        fetchVidsrcList("movie", updatePages),
        fetchVidsrcList("series", updatePages),
      ]);

      setPhase("verifying");
      const [movies, series] = await Promise.all([getMovies(), getSeries()]);
      const allItems = [
        ...movies
          .filter((m) => m.imdb_id)
          .map((m) => ({ imdb_id: m.imdb_id!, type: "movie" as const })),
        ...series
          .filter((s) => s.imdb_id)
          .map((s) => ({ imdb_id: s.imdb_id!, type: "series" as const })),
      ];
      const total = allItems.length;
      setProgress({ checked: 0, total });

      let active = 0,
        inactive = 0,
        checked = 0;
      const SAVE_BATCH = 100;
      const pendingSave: {
        imdb_id: string;
        type: "movie" | "series";
        available: boolean;
      }[] = [];

      for (const item of allItems) {
        const available =
          item.type === "movie" ? movieSet.has(item.imdb_id) : seriesSet.has(item.imdb_id);
        if (available) active++;
        else inactive++;
        checked++;
        pendingSave.push({ ...item, available });
        setProgress({ checked, total });
        setCounts({ active, inactive });

        if (pendingSave.length >= SAVE_BATCH) {
          await saveVidsrcResults([...pendingSave]).catch(() => {});
          pendingSave.length = 0;
        }
      }
      if (pendingSave.length > 0) {
        await saveVidsrcResults([...pendingSave]).catch(() => {});
      }
      setPhase("done");
    } catch (err: unknown) {
      setPhase("idle");
      toast.error(err instanceof Error ? err.message : "Error al verificar VIDSRC.");
    }
  };

  const handleCleanup = async () => {
    if (
      !confirm(
        `¿Eliminar ${counts.inactive} título(s) sin video en VIDSRC? Esta acción no se puede deshacer.`,
      )
    )
      return;
    setPhase("cleaning");
    setCleaning(true);
    try {
      const res = await cleanupNoVidsrc();
      setCleanResult(res.summary);
      setCounts({ active: 0, inactive: 0 });
      setPhase("idle");
    } catch (err: unknown) {
      setPhase("done");
      toast.error(err instanceof Error ? err.message : "Error al eliminar.");
    } finally {
      setCleaning(false);
    }
  };

  return (
    <div className="bg-brand-card border border-brand-border rounded-2xl p-6">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h2 className="text-white font-bold text-base mb-1">
            Verificar disponibilidad en VIDSRC
          </h2>
          <p className="text-gray-500 text-sm">
            Comprueba si cada título tiene video disponible en VIDSRC. Los títulos sin video
            pueden eliminarse automáticamente.
          </p>
        </div>
      </div>

      {/* Progress bar while verifying */}
      {(phase === "verifying" || phase === "fetching") && (
        <div className="mb-4">
          <div className="flex items-center justify-between text-xs text-gray-400 mb-1.5">
            <span>
              {phase === "fetching"
                ? `Descargando lista de vidsrc.me — página ${progress.checked}...`
                : `Cruzando catálogo: ${progress.checked} de ${progress.total}...`}
            </span>
            {phase === "verifying" && progress.total > 0 && (
              <span>{Math.round((progress.checked / progress.total) * 100)}%</span>
            )}
          </div>
          <div className="w-full bg-brand-border rounded-full h-1.5">
            <div
              className="bg-brand-red h-1.5 rounded-full transition-all duration-300"
              style={{
                width:
                  phase === "fetching"
                    ? "5%"
                    : `${progress.total > 0 ? (progress.checked / progress.total) * 100 : 0}%`,
              }}
            />
          </div>
          {phase === "verifying" && (
            <div className="flex gap-4 mt-2 text-xs">
              <span className="text-green-400">{counts.active} activos</span>
              <span className="text-red-400">{counts.inactive} inactivos</span>
            </div>
          )}
        </div>
      )}

      {/* Results after verification */}
      {phase === "done" && (
        <div className="mb-4 flex flex-wrap gap-4 bg-brand-surface border border-brand-border rounded-xl px-5 py-4">
          <div className="text-center">
            <p className="text-2xl font-black text-green-400">{counts.active}</p>
            <p className="text-xs text-gray-400 mt-0.5">con video</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-black text-red-400">{counts.inactive}</p>
            <p className="text-xs text-gray-400 mt-0.5">sin video</p>
          </div>
        </div>
      )}

      {/* Cleanup result */}
      {cleanResult && (
        <div className="mb-4 bg-green-900/15 border border-green-800/30 rounded-xl px-5 py-4 text-sm text-green-400">
          Eliminados: {cleanResult.movies} películas y {cleanResult.series} series (
          {cleanResult.total} en total).
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <button
          onClick={handleVerify}
          disabled={phase !== "idle" && phase !== "done"}
          className="flex items-center gap-2 bg-brand-surface border border-brand-border hover:border-gray-500 text-gray-200 hover:text-white text-sm font-semibold py-2 px-4 rounded-lg transition-colors disabled:opacity-50"
        >
          {phase === "fetching" || phase === "verifying" ? (
            <>
              <span className="w-3.5 h-3.5 rounded-full border-2 border-gray-500 border-t-white animate-spin" />
              Verificando...
            </>
          ) : (
            <>
              <WifiIcon />
              {phase === "done" ? "Verificar de nuevo" : "Verificar catálogo"}
            </>
          )}
        </button>

        {phase === "done" && counts.inactive > 0 && (
          <button
            onClick={handleCleanup}
            disabled={cleaning}
            className="flex items-center gap-2 bg-red-900/20 border border-red-800/40 hover:bg-red-900/30 text-red-400 text-sm font-semibold py-2 px-4 rounded-lg transition-colors disabled:opacity-50"
          >
            <TrashIcon />
            Eliminar {counts.inactive} sin video
          </button>
        )}
      </div>
    </div>
  );
}
