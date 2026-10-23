import { useState } from "react";
import { toast } from "sonner";
import { useConfirm } from "@/components/admin/useConfirm";
import { verifyVidsrcCatalog, previewCleanupNoVidsrc, cleanupNoVidsrc } from "@/lib/api";
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

export default function VidsrcVerificationCard() {
  const { confirm, confirmDialog } = useConfirm();
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
      setPhase("verifying");
      const result = await verifyVidsrcCatalog();
      setProgress({ checked: result.total, total: result.total });
      setCounts({ active: result.active, inactive: result.inactive });
      setPhase("done");
    } catch (err: unknown) {
      setPhase("idle");
      toast.error(err instanceof Error ? err.message : "Error al verificar VIDSRC.");
    }
  };

  const handleCleanup = async () => {
    let target: number;
    try {
      const preview = await previewCleanupNoVidsrc();
      target = preview.would_delete.movies + preview.would_delete.series;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo calcular el alcance de la limpieza.");
      return;
    }
    if (target === 0) {
      toast.info("No hay títulos sin VIDSRC para eliminar.");
      return;
    }
    const accepted = await confirm({
      title: "Eliminar títulos sin vídeo",
      description: `Se eliminarán ${target} título(s) sin disponibilidad confirmada en VIDSRC. Esta acción no se puede deshacer.`,
      confirmLabel: "Eliminar",
    });
    if (!accepted) return;
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
    <>
      {confirmDialog}
      <div className="bg-brand-card border border-brand-border rounded-2xl p-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h2 className="text-white font-bold text-base mb-1">Verificar disponibilidad en VIDSRC</h2>
            <p className="text-gray-400 text-sm">
              Comprueba si cada título tiene video disponible en VIDSRC. Para escaneos grandes usa el{" "}
              <a href="/admin/vidsrc-scanner" className="text-brand-red hover:underline">
                Escáner VIDSRC
              </a>
              .
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
              <p className="text-gray-400 text-xs mt-0.5">Activos</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-black text-red-400">{counts.inactive}</p>
              <p className="text-gray-400 text-xs mt-0.5">Sin video</p>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleVerify}
            disabled={phase === "fetching" || phase === "verifying"}
            className="flex items-center gap-2 bg-brand-red hover:bg-red-700 disabled:bg-brand-surface disabled:text-gray-600 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
          >
            <WifiIcon />
            {phase === "fetching" || phase === "verifying"
              ? "Verificando..."
              : phase === "done"
                ? "Volver a verificar"
                : "Verificar disponibilidad"}
          </button>

          {phase === "done" && counts.inactive > 0 && (
            <button
              onClick={handleCleanup}
              disabled={cleaning}
              className="flex items-center gap-2 bg-red-900/20 border border-red-800/40 hover:bg-red-900/30 text-red-400 text-sm font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
            >
              {cleaning ? (
                <span className="w-4 h-4 rounded-full border-2 border-red-500 border-t-white animate-spin" />
              ) : (
                <TrashIcon />
              )}
              Eliminar {counts.inactive} sin video
            </button>
          )}

          {cleanResult && (
            <p className="text-xs text-green-400 mt-2 w-full">
              ✅ Eliminados: {cleanResult.movies} películas y {cleanResult.series} series ({cleanResult.total}{" "}
              en total)
            </p>
          )}
        </div>
      </div>
    </>
  );
}
