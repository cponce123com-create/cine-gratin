import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import AdminLayout from "@/components/admin/AdminLayout";
import {
  cancelImportJob,
  createImportJob,
  getImportJob,
  listImportJobs,
  previewImport,
  runAutoImport,
  scanNetworks,
  toggleAutoImport,
  type ImportJob,
  type ImportPreviewItem,
} from "@/lib/api";
import { getAutoImportStatus } from "@/lib/api";

const ID_PATTERN = /^(tt\d{7,10}|ev\d{1,12}|\d{1,7})$/;

interface ParsedInput {
  valid: string[];
  invalid: string[];
}

function parseIds(text: string): ParsedInput {
  const tokens = text
    .split(/[\s,;\n]+/)
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);

  const valid: string[] = [];
  const invalid: string[] = [];

  for (const token of tokens) {
    if (ID_PATTERN.test(token)) valid.push(token);
    else invalid.push(token);
  }

  return { valid: [...new Set(valid)], invalid: [...new Set(invalid)] };
}

const STATUS_LABELS: Record<ImportPreviewItem["status"], string> = {
  new: "Nuevo",
  existed: "Ya en catálogo",
  not_found: "No encontrado",
  invalid: "Identificador inválido",
};

function StatusBadge({ status }: { status: ImportPreviewItem["status"] }) {
  const classes: Record<ImportPreviewItem["status"], string> = {
    new: "text-emerald-400 border-emerald-500/40 bg-emerald-500/10",
    existed: "text-gray-400 border-brand-border bg-brand-surface",
    not_found: "text-red-400 border-red-500/40 bg-red-500/10",
    invalid: "text-orange-400 border-orange-500/40 bg-orange-500/10",
  };
  return (
    <span className={`inline-flex items-center text-xs px-2 py-0.5 rounded-full border ${classes[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}

export default function Import() {
  const queryClient = useQueryClient();

  const [mediaType, setMediaType] = useState<"movie" | "series">("movie");
  const [rawIds, setRawIds] = useState("");
  const [preview, setPreview] = useState<ImportPreviewItem[] | null>(null);
  const [invalidIds, setInvalidIds] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [activeJob, setActiveJob] = useState<ImportJob | null>(null);
  const pollRef = useRef<number | null>(null);

  const parsed = useMemo(() => parseIds(rawIds), [rawIds]);

  const { data: autoImport } = useQuery({
    queryKey: ["admin", "auto-import"],
    queryFn: getAutoImportStatus,
    staleTime: 30_000,
  });

  const { data: jobHistory } = useQuery({
    queryKey: ["admin", "import-jobs"],
    queryFn: () => listImportJobs(10),
    staleTime: 15_000,
  });

  // Polling of the running job. The import continues in the server even if the
  // browser is closed, so the progress can be recovered later.
  useEffect(() => {
    if (!activeJob || !["queued", "running"].includes(activeJob.status)) {
      if (pollRef.current) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
      return;
    }

    pollRef.current = window.setInterval(() => {
      void getImportJob(activeJob.id)
        .then(({ job }) => {
          setActiveJob(job);
          if (!["queued", "running"].includes(job.status)) {
            queryClient.invalidateQueries({ queryKey: ["admin", "import-jobs"] });
          }
        })
        .catch(() => undefined);
    }, 1500);

    return () => {
      if (pollRef.current) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [activeJob, queryClient]);

  const handlePreview = async () => {
    if (parsed.valid.length === 0) {
      toast.error("Introduce al menos un identificador válido (tt1234567 o un ID de TMDB)");
      return;
    }
    setBusy(true);
    try {
      const result = await previewImport(parsed.valid, mediaType);
      setPreview(result.items);
      setInvalidIds(result.invalid);
      setSelected(new Set(result.items.filter((item) => item.status === "new").map((item) => item.input)));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo generar la vista previa");
    } finally {
      setBusy(false);
    }
  };

  const handleImport = async () => {
    const items = [...selected];
    if (items.length === 0) {
      toast.error("Selecciona al menos un elemento para importar");
      return;
    }
    setBusy(true);
    try {
      const { job } = await createImportJob(items, mediaType, "manual");
      setActiveJob(job);
      setPreview(null);
      setSelected(new Set());
      toast.success(`Importación iniciada (${job.total} elementos)`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo iniciar la importación");
    } finally {
      setBusy(false);
    }
  };

  const handleCancel = async () => {
    if (!activeJob) return;
    try {
      const { job } = await cancelImportJob(activeJob.id);
      setActiveJob(job);
      toast.info("Importación cancelada");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo cancelar la importación");
    }
  };

  const retryFailed = async () => {
    if (!activeJob) return;
    const failed = activeJob.result.filter((item) => item.status === "error" || item.status === "not_found");
    if (failed.length === 0) return;

    setBusy(true);
    try {
      const { job } = await createImportJob(
        failed.map((item) => item.input),
        activeJob.type,
        "retry",
      );
      setActiveJob(job);
      toast.success(`Reintento iniciado (${failed.length} elementos)`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo reintentar");
    } finally {
      setBusy(false);
    }
  };

  const handleToggleAutoImport = async (enabled: boolean) => {
    try {
      await toggleAutoImport(enabled);
      queryClient.invalidateQueries({ queryKey: ["admin", "auto-import"] });
      toast.success(enabled ? "Importación automática activada" : "Importación automática desactivada");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo cambiar la configuración");
    }
  };

  const handleRunAutoImport = async () => {
    setBusy(true);
    try {
      const result = await runAutoImport();
      toast.success(
        `Importación automática: ${result.movies_imported} películas y ${result.series_imported} series nuevas`,
      );
      queryClient.invalidateQueries({ queryKey: ["admin", "auto-import"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo ejecutar la importación");
    } finally {
      setBusy(false);
    }
  };

  const handleScanNetworks = async () => {
    setBusy(true);
    try {
      const result = await scanNetworks(mediaType, 200);
      toast.success(
        `Productoras actualizadas: ${result.summary.updated}, sin cambios: ${result.summary.no_change}, errores: ${result.summary.error}`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo escanear");
    } finally {
      setBusy(false);
    }
  };

  const jobProgress =
    activeJob && activeJob.total > 0 ? Math.round((activeJob.processed / activeJob.total) * 100) : 0;
  const failedItems =
    activeJob?.result.filter((item) => item.status === "error" || item.status === "not_found") ?? [];

  return (
    <AdminLayout>
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl font-bold text-white">Importar contenido</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Importa películas y series por identificador de IMDb o de TMDB. La importación se ejecuta en el
            servidor: puedes cerrar esta página y seguirla desde el historial.
          </p>
        </header>

        {/* ── Guided import ─────────────────────────────────────────────── */}
        <section className="bg-brand-card border border-brand-border rounded-xl p-5 space-y-4">
          <h2 className="text-white font-bold">Importación guiada</h2>

          <div className="flex flex-col sm:flex-row sm:items-end gap-3">
            <div>
              <label htmlFor="import-type" className="block text-xs text-gray-500 mb-1">
                Tipo de contenido
              </label>
              <select
                id="import-type"
                value={mediaType}
                onChange={(event) => {
                  setMediaType(event.target.value as "movie" | "series");
                  setPreview(null);
                }}
                className="bg-brand-dark border border-brand-border rounded-lg px-3 py-2 text-white text-sm outline-none focus:ring-2 focus:ring-brand-red"
              >
                <option value="movie">Películas</option>
                <option value="series">Series</option>
              </select>
            </div>

            <div className="flex-1">
              <label htmlFor="import-ids" className="block text-xs text-gray-500 mb-1">
                Identificadores (separados por coma o salto de línea)
              </label>
              <textarea
                id="import-ids"
                rows={3}
                value={rawIds}
                onChange={(event) => setRawIds(event.target.value)}
                placeholder="tt0111161, tt0068646, 550"
                className="w-full bg-brand-dark border border-brand-border rounded-lg px-3 py-2 text-white text-sm font-mono outline-none focus:ring-2 focus:ring-brand-red resize-y"
              />
              <p className="text-xs text-gray-500 mt-1">
                {parsed.valid.length} identificadores válidos
                {parsed.invalid.length > 0 && ` · ${parsed.invalid.length} inválidos`}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void handlePreview()}
              disabled={busy || parsed.valid.length === 0}
              className="px-4 py-2 rounded-lg text-sm font-bold bg-brand-surface border border-brand-border text-white hover:border-brand-red transition-colors disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-brand-red"
            >
              Ver vista previa
            </button>

            {preview && (
              <button
                type="button"
                onClick={() => void handleImport()}
                disabled={busy || selected.size === 0}
                className="px-4 py-2 rounded-lg text-sm font-bold bg-brand-red hover:bg-red-700 text-white transition-colors disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-white/70"
              >
                Importar {selected.size} seleccionados
              </button>
            )}
          </div>

          {preview && (
            <div className="border border-brand-border rounded-lg overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 bg-brand-dark/40 text-xs text-gray-400">
                <span>
                  {preview.length} elementos analizados · {selected.size} seleccionados
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setSelected(
                        new Set(preview.filter((item) => item.status === "new").map((item) => item.input)),
                      )
                    }
                    className="hover:text-white"
                  >
                    Solo nuevos
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelected(new Set(preview.map((item) => item.input)))}
                    className="hover:text-white"
                  >
                    Seleccionar todo
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto max-h-96 overflow-y-auto">
                <table className="w-full text-sm">
                  <caption className="sr-only">Vista previa de la importación</caption>
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wider text-gray-500 border-b border-brand-border">
                      <th scope="col" className="px-3 py-2 w-10" />
                      <th scope="col" className="px-3 py-2">
                        Título
                      </th>
                      <th scope="col" className="px-3 py-2">
                        Año
                      </th>
                      <th scope="col" className="px-3 py-2">
                        Estado
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((item) => (
                      <tr key={item.input} className="border-b border-brand-border/50 last:border-0">
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={selected.has(item.input)}
                            onChange={() => {
                              const next = new Set(selected);
                              if (next.has(item.input)) next.delete(item.input);
                              else next.add(item.input);
                              setSelected(next);
                            }}
                            aria-label={`Seleccionar ${item.title ?? item.input}`}
                            className="w-4 h-4 rounded border-brand-border text-brand-red focus:ring-brand-red bg-brand-dark"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            {item.posterUrl && (
                              <img
                                src={item.posterUrl}
                                alt=""
                                loading="lazy"
                                width={28}
                                height={42}
                                className="w-7 h-[42px] object-cover rounded bg-brand-surface"
                              />
                            )}
                            <div className="min-w-0">
                              <p className="text-white truncate max-w-[18rem]">{item.title ?? item.input}</p>
                              <p className="text-xs text-gray-500 font-mono">{item.input}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-gray-300">{item.year ?? "—"}</td>
                        <td className="px-3 py-2">
                          <StatusBadge status={item.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {invalidIds.length > 0 && (
                <p className="px-3 py-2 text-xs text-orange-400 border-t border-brand-border">
                  Identificadores descartados: {invalidIds.join(", ")}
                </p>
              )}
            </div>
          )}
        </section>

        {/* ── Active job ────────────────────────────────────────────────── */}
        {activeJob && (
          <section className="bg-brand-card border border-brand-border rounded-xl p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-white font-bold">Trabajo de importación</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  {activeJob.source} · {activeJob.type === "movie" ? "películas" : "series"} ·{" "}
                  {new Date(activeJob.created_at).toLocaleString("es-ES")}
                </p>
              </div>
              <span
                className={`text-xs px-2 py-1 rounded-full border ${
                  activeJob.status === "completed"
                    ? "text-emerald-400 border-emerald-500/40 bg-emerald-500/10"
                    : activeJob.status === "partial"
                      ? "text-orange-400 border-orange-500/40 bg-orange-500/10"
                      : activeJob.status === "failed"
                        ? "text-red-400 border-red-500/40 bg-red-500/10"
                        : activeJob.status === "cancelled"
                          ? "text-gray-400 border-brand-border bg-brand-surface"
                          : "text-brand-gold border-brand-gold/40 bg-brand-gold/10"
                }`}
              >
                {activeJob.status === "queued"
                  ? "En cola"
                  : activeJob.status === "running"
                    ? "En curso"
                    : activeJob.status === "completed"
                      ? "Completado"
                      : activeJob.status === "partial"
                        ? "Parcial"
                        : activeJob.status === "cancelled"
                          ? "Cancelado"
                          : "Fallido"}
              </span>
            </div>

            <div>
              <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
                <span>
                  {activeJob.processed} de {activeJob.total} procesados
                </span>
                <span>{jobProgress}%</span>
              </div>
              <div
                className="h-2 rounded-full bg-brand-surface overflow-hidden"
                role="progressbar"
                aria-valuenow={jobProgress}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Progreso de la importación"
              >
                <div
                  className="h-full bg-brand-red transition-all duration-500"
                  style={{ width: `${jobProgress}%` }}
                />
              </div>
            </div>

            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
              <div className="bg-brand-dark/40 rounded-lg p-3">
                <dt className="text-xs text-gray-500">Importados</dt>
                <dd className="text-lg font-bold text-emerald-400">{activeJob.imported}</dd>
              </div>
              <div className="bg-brand-dark/40 rounded-lg p-3">
                <dt className="text-xs text-gray-500">Omitidos</dt>
                <dd className="text-lg font-bold text-gray-300">{activeJob.skipped}</dd>
              </div>
              <div className="bg-brand-dark/40 rounded-lg p-3">
                <dt className="text-xs text-gray-500">Fallidos</dt>
                <dd className="text-lg font-bold text-red-400">{activeJob.failed}</dd>
              </div>
              <div className="bg-brand-dark/40 rounded-lg p-3">
                <dt className="text-xs text-gray-500">Total</dt>
                <dd className="text-lg font-bold text-white">{activeJob.total}</dd>
              </div>
            </dl>

            {activeJob.error && <p className="text-sm text-red-400">{activeJob.error}</p>}

            <div className="flex flex-wrap gap-2">
              {["queued", "running"].includes(activeJob.status) && (
                <button
                  type="button"
                  onClick={() => void handleCancel()}
                  className="px-3 py-1.5 text-xs rounded-lg border border-brand-border text-gray-300 hover:text-white transition-colors focus-visible:ring-2 focus-visible:ring-brand-red"
                >
                  Detener de forma segura
                </button>
              )}
              {failedItems.length > 0 && (
                <button
                  type="button"
                  onClick={() => void retryFailed()}
                  disabled={busy}
                  className="px-3 py-1.5 text-xs rounded-lg bg-brand-red hover:bg-red-700 text-white font-bold transition-colors disabled:opacity-50"
                >
                  Reintentar {failedItems.length} fallidos
                </button>
              )}
            </div>
          </section>
        )}

        {/* ── Automatic import ──────────────────────────────────────────── */}
        <section className="bg-brand-card border border-brand-border rounded-xl p-5 space-y-4">
          <h2 className="text-white font-bold">Importación automática</h2>
          <p className="text-sm text-gray-400">
            Se ejecuta cada día a las 03:00 con las novedades de TMDB (tendencias, popular y próximas
            estrenos). Solo se añade contenido que no está en el catálogo.
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-white cursor-pointer">
              <input
                type="checkbox"
                checked={autoImport?.enabled ?? false}
                onChange={(event) => void handleToggleAutoImport(event.target.checked)}
                className="w-4 h-4 rounded border-brand-border text-brand-red focus:ring-brand-red bg-brand-dark"
              />
              Activar la importación automática
            </label>

            <button
              type="button"
              onClick={() => void handleRunAutoImport()}
              disabled={busy}
              className="px-3 py-1.5 text-xs rounded-lg bg-brand-surface border border-brand-border text-white hover:border-brand-red transition-colors disabled:opacity-50"
            >
              Ejecutar ahora
            </button>

            <button
              type="button"
              onClick={() => void handleScanNetworks()}
              disabled={busy}
              className="px-3 py-1.5 text-xs rounded-lg bg-brand-surface border border-brand-border text-white hover:border-brand-red transition-colors disabled:opacity-50"
            >
              Escanear productoras
            </button>
          </div>

          {autoImport && autoImport.logs.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <caption className="sr-only">Historial de importaciones automáticas</caption>
                <thead>
                  <tr className="text-left text-gray-500 border-b border-brand-border">
                    <th scope="col" className="px-2 py-2">
                      Fecha
                    </th>
                    <th scope="col" className="px-2 py-2">
                      Películas
                    </th>
                    <th scope="col" className="px-2 py-2">
                      Series
                    </th>
                    <th scope="col" className="px-2 py-2">
                      Revisados
                    </th>
                    <th scope="col" className="px-2 py-2">
                      Estado
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {autoImport.logs.map((log) => (
                    <tr key={log.id} className="border-b border-brand-border/40 last:border-0">
                      <td className="px-2 py-1.5 text-gray-300">
                        {new Date(log.run_at).toLocaleString("es-ES")}
                      </td>
                      <td className="px-2 py-1.5 text-gray-400">{log.movies_imported}</td>
                      <td className="px-2 py-1.5 text-gray-400">{log.series_imported}</td>
                      <td className="px-2 py-1.5 text-gray-400">{log.total_checked}</td>
                      <td className="px-2 py-1.5">
                        <span className={log.status === "success" ? "text-emerald-400" : "text-red-400"}>
                          {log.status === "success" ? "Correcta" : "Con errores"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ── Job history ───────────────────────────────────────────────── */}
        <section className="bg-brand-card border border-brand-border rounded-xl p-5 space-y-3">
          <h2 className="text-white font-bold">Historial de importaciones</h2>

          {!jobHistory || jobHistory.jobs.length === 0 ? (
            <p className="text-sm text-gray-500">Todavía no hay importaciones registradas.</p>
          ) : (
            <ul className="space-y-2">
              {jobHistory.jobs.map((job) => (
                <li
                  key={job.id}
                  className="flex flex-wrap items-center justify-between gap-2 text-xs border border-brand-border/50 rounded-lg px-3 py-2"
                >
                  <span className="text-gray-300">
                    {new Date(job.created_at).toLocaleString("es-ES")} ·{" "}
                    {job.type === "movie" ? "películas" : "series"} · {job.source}
                  </span>
                  <span className="flex items-center gap-3 text-gray-500">
                    <span>{job.total} elementos</span>
                    <span className="text-emerald-400">{job.imported} importados</span>
                    <span>{job.status}</span>
                    <button
                      type="button"
                      onClick={() => setActiveJob(job)}
                      className="text-brand-gold hover:underline"
                    >
                      Ver
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </AdminLayout>
  );
}
