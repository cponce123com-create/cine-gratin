import { useState, useEffect, useCallback, useRef } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import AdminPagination from "@/components/admin/AdminPagination";
import { useConfirm } from "@/components/admin/useConfirm";
import { toast } from "sonner";
import {
  getTmdbGenres,
  tmdbDiscover,
  createImportJob,
  getImportJob,
  getTmdbCatalogIds,
  importAllTmdbDiscover,
  listImportJobs,
  adminListMovies,
  adminListSeries,
  bulkDeleteMovies,
  bulkDeleteSeries,
  previewCleanupImportedCatalog,
  cleanupImportedCatalog,
  cancelImportJob,
  type TmdbGenre,
  type TmdbDiscoverItem,
  type ImportJob,
} from "@/lib/api";

const SORT_OPTIONS = [
  { value: "popularity.desc", label: "Popularidad" },
  { value: "vote_average.desc", label: "Mejor calificación" },
  { value: "primary_release_date.desc", label: "Más reciente" },
  { value: "primary_release_date.asc", label: "Más antiguo" },
  { value: "revenue.desc", label: "Mayor recaudación" },
];

const SORT_OPTIONS_TV = [
  { value: "popularity.desc", label: "Popularidad" },
  { value: "vote_average.desc", label: "Mejor calificación" },
  { value: "first_air_date.desc", label: "Más reciente" },
  { value: "first_air_date.asc", label: "Más antiguo" },
];

const LANGUAGE_OPTIONS = [
  { value: "", label: "Todos los idiomas" },
  { value: "es", label: "Español" },
  { value: "en", label: "Inglés" },
  { value: "fr", label: "Francés" },
  { value: "ja", label: "Japonés" },
  { value: "ko", label: "Coreano" },
  { value: "pt", label: "Portugués" },
  { value: "de", label: "Alemán" },
  { value: "it", label: "Italiano" },
  { value: "zh", label: "Chino" },
  { value: "hi", label: "Hindi" },
  { value: "ar", label: "Árabe" },
];

/**
 * Tamaño de un bloque de resultados. Cada bloque son 20 títulos por página de
 * TMDB, así que estos tamaños mantienen la cuadrícula completa.
 */
const BLOCK_SIZES = [50, 100, 250, 500, 1000];

export default function TmdbScraper() {
  const { confirm, confirmDialog } = useConfirm();
  const [mediaType, setMediaType] = useState<"movie" | "series">("movie");
  const [genres, setGenres] = useState<TmdbGenre[]>([]);
  const [selectedGenres, setSelectedGenres] = useState<number[]>([]);
  const [yearFrom, setYearFrom] = useState("");
  const [yearTo, setYearTo] = useState("");
  const [sortBy, setSortBy] = useState("popularity.desc");
  const [language, setLanguage] = useState("");
  const [minVotes, setMinVotes] = useState("1000");
  const [page, setPage] = useState(1);
  const [blockSize, setBlockSize] = useState(500);

  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<TmdbDiscoverItem[]>([]);
  const [totalResults, setTotalResults] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchError, setSearchError] = useState("");

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; total: number } | null>(null);
  const [activeJob, setActiveJob] = useState<ImportJob | null>(null);
  const [cancellingJob, setCancellingJob] = useState(false);
  const [hideExisting, setHideExisting] = useState(false);
  const [localIds, setLocalIds] = useState<Set<number>>(new Set());
  const [catalogQuery, setCatalogQuery] = useState("");
  const [manualType, setManualType] = useState<"movie" | "series">("movie");
  const [manualRows, setManualRows] = useState<Array<{ id: string; title: string; year: number }>>([]);
  const [manualSelected, setManualSelected] = useState<Set<string>>(new Set());
  const [manualBusy, setManualBusy] = useState(false);

  // Referencias para desplazar la vista: la barra de resultados siempre
  // visible y el formulario de filtros.
  const resultsRef = useRef<HTMLDivElement>(null);
  const filtersRef = useRef<HTMLDivElement>(null);

  // La API devuelve el conjunto completo, sin depender de páginas públicas.
  const loadLocalCatalog = useCallback(async () => {
    try {
      setLocalIds(new Set(await getTmdbCatalogIds(mediaType)));
    } catch (err) {
      // Si no se puede leer el catálogo local, la vista sigue funcionando.
      console.warn("No se pudo comprobar el catálogo local", err);
    }
  }, [mediaType]);

  // Load genres once, without duplicate calls
  useEffect(() => {
    setGenres([]);
    setSelectedGenres([]);
    getTmdbGenres(mediaType)
      .then(setGenres)
      .catch(() => {});
    loadLocalCatalog();
  }, [mediaType, loadLocalCatalog]);

  // La importación vive en la cola del servidor; se puede recuperar al volver
  // al panel y continúa aunque se cierre esta pestaña.
  useEffect(() => {
    if (!activeJob || !["queued", "running"].includes(activeJob.status)) return;

    const jobId = activeJob.id;
    let cancelled = false;
    let timer: number | undefined;

    // Poll again only after the previous request settles. This avoids overlap
    // and keeps progress updates from restarting the polling loop each time.
    const poll = async () => {
      try {
        const { job } = await getImportJob(jobId);
        if (cancelled) return;
        setActiveJob(job);
        if (!["queued", "running"].includes(job.status)) {
          setImportResult({ imported: job.imported, total: job.total });
          void loadLocalCatalog();
          return;
        }
      } catch {
        // A temporary network failure should not stop progress polling.
      }
      if (!cancelled) timer = window.setTimeout(() => void poll(), 1000);
    };

    void poll();
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [activeJob?.id, activeJob?.status, loadLocalCatalog]);

  useEffect(() => {
    void listImportJobs(20)
      .then(({ jobs }) => {
        const running = jobs.find(
          (job) => job.source.startsWith("tmdb-explorer") && ["queued", "running"].includes(job.status),
        );
        if (running) setActiveJob(running);
      })
      .catch(() => undefined);
  }, []);

  // Reset sort when switching type
  useEffect(() => {
    setSortBy("popularity.desc");
  }, [mediaType]);

  const handleSearch = useCallback(
    async (p: number, options: { keepSelection?: boolean; count?: number } = {}) => {
      setLoading(true);
      setImportResult(null);
      setSearchError("");
      try {
        const data = await tmdbDiscover({
          type: mediaType,
          genre_ids: selectedGenres.length > 0 ? selectedGenres.join(",") : undefined,
          year_from: yearFrom ? Number(yearFrom) : undefined,
          year_to: yearTo ? Number(yearTo) : undefined,
          sort_by: sortBy,
          language: language || undefined,
          min_votes: Number(minVotes) || 0,
          page: p,
          count: options.count ?? blockSize,
        });
        setResults(data.results);
        setTotalResults(data.total_results);
        setTotalPages(data.total_pages);
        setPage(p);
        // Al cambiar de filtros se descarta la seleccion: al pasar de bloque se
        // conserva, para poder marcar titulos en varias paginas e importarlos
        // de una sola vez.
        if (!options.keepSelection) setSelected(new Set());
        setHasSearched(true);
      } catch (err: unknown) {
        setSearchError(err instanceof Error ? err.message : "Error al buscar en TMDB.");
      } finally {
        setLoading(false);
      }
    },
    [mediaType, selectedGenres, yearFrom, yearTo, sortBy, language, minVotes, blockSize],
  );

  // Al buscar o al cambiar de bloque, la vista vuelve a los resultados: si no,
  // el usuario se queda en la parte baja de la lista anterior.
  useEffect(() => {
    if (!hasSearched) return;
    resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [hasSearched, page]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSearch(1);
  };

  const toggleSelect = (tmdbId: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(tmdbId)) next.delete(tmdbId);
      else next.add(tmdbId);
      return next;
    });
  };

  /** Selecciona o quita los titulos del bloque que se esta viendo. */
  const toggleSelectAll = () => {
    const pageIds = visibleResults.map((r) => r.tmdb_id);
    if (pageIds.length === 0) return;
    const allSelected = pageIds.every((id) => selected.has(id));
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of pageIds) {
        if (allSelected) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  };

  const handleImport = async () => {
    if (selected.size === 0) return;
    const accepted = await confirm({
      title: "Importar desde TMDB",
      description: `Se importarán ${selected.size} título(s) al catálogo. Los que ya existan se omiten.`,
      confirmLabel: "Importar",
      tone: "default",
    });
    if (!accepted) return;
    setImporting(true);
    setImportResult(null);
    try {
      const { job } = await createImportJob([...selected].map(String), mediaType, "tmdb-explorer-selection");
      setActiveJob(job);
      setSelected(new Set());
      toast.success(`Trabajo de importación iniciado para ${job.total} elemento(s)`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al importar.");
    } finally {
      setImporting(false);
    }
  };

  const handleImportAll = async () => {
    if (!hasSearched || totalResults === 0) return;
    const accepted = await confirm({
      title: `Importar listado completo de ${mediaType === "movie" ? "películas" : "series"}`,
      description: `Se consultarán hasta 10 000 resultados de TMDB y se pondrán en cola en paquetes de 50. ${hideExisting ? "Se omitirán los títulos que ya están en tu catálogo." : "La cola evitará duplicados al importar."}`,
      confirmLabel: "Iniciar importación completa",
    });
    if (!accepted) return;
    setImporting(true);
    setImportResult(null);
    try {
      const result = await importAllTmdbDiscover({
        type: mediaType,
        genre_ids: selectedGenres.length ? selectedGenres.join(",") : undefined,
        year_from: yearFrom ? Number(yearFrom) : undefined,
        year_to: yearTo ? Number(yearTo) : undefined,
        sort_by: sortBy,
        language: language || undefined,
        min_votes: Number(minVotes) || 0,
        exclude_existing: hideExisting,
      });
      if (!result.job) {
        toast.info(`No hay elementos nuevos. ${result.skipped_existing} ya estaban en el catálogo.`);
        return;
      }
      setActiveJob(result.job);
      toast.success(
        `Importación en cola: ${result.queued.toLocaleString()} de ${result.total_found.toLocaleString()} resultados` +
          (result.skipped_existing
            ? ` · ${result.skipped_existing.toLocaleString()} ya estaban en catálogo`
            : ""),
      );
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "No se pudo iniciar la importación completa.");
    } finally {
      setImporting(false);
    }
  };

  const handleCancelJob = async () => {
    if (!activeJob || !["queued", "running"].includes(activeJob.status) || cancellingJob) return;
    setCancellingJob(true);
    try {
      const { job } = await cancelImportJob(activeJob.id);
      setActiveJob(job);
      toast.success(
        job.status === "cancelled"
          ? "Importación detenida. Ya puedes iniciar otra consulta o importación."
          : "Se solicitó detener la importación.",
      );
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "No se pudo detener la importación.");
    } finally {
      setCancellingJob(false);
    }
  };

  const searchCatalog = async () => {
    if (!catalogQuery.trim()) {
      toast.info("Escribe el título o parte del título que deseas buscar.");
      return;
    }
    setManualBusy(true);
    setManualSelected(new Set());
    try {
      const result =
        manualType === "movie"
          ? await adminListMovies({ q: catalogQuery.trim(), page: 1, limit: 100 })
          : await adminListSeries({ q: catalogQuery.trim(), page: 1, limit: 100 });
      setManualRows(
        result.items.map((item) => ({
          id: String(item.id),
          title: item.title,
          year: Number(item.year) || 0,
        })),
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo buscar en el catálogo.");
    } finally {
      setManualBusy(false);
    }
  };

  const deleteManualSelected = async () => {
    if (manualSelected.size === 0) return;
    const accepted = await confirm({
      title: "Eliminar títulos seleccionados",
      description: `Se eliminarán ${manualSelected.size} ${manualType === "movie" ? "película(s)" : "serie(s)"} del catálogo. Esta acción no se puede deshacer.`,
      confirmLabel: "Eliminar seleccionados",
    });
    if (!accepted) return;
    setManualBusy(true);
    try {
      const ids = [...manualSelected];
      const result = manualType === "movie" ? await bulkDeleteMovies(ids) : await bulkDeleteSeries(ids);
      setManualRows((rows) => rows.filter((row) => !manualSelected.has(row.id)));
      setManualSelected(new Set());
      toast.success(`${result.deleted} título(s) eliminado(s).`);
      void loadLocalCatalog();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudieron eliminar los títulos.");
    } finally {
      setManualBusy(false);
    }
  };

  const deleteImportedCatalog = async () => {
    try {
      const preview = await previewCleanupImportedCatalog();
      const count = preview.would_delete.movies + preview.would_delete.series;
      if (!count) {
        toast.info("No hay títulos marcados como importados para eliminar.");
        return;
      }
      const accepted = await confirm({
        title: "Vaciar contenido importado",
        description: `Se eliminarán ${preview.would_delete.movies} películas y ${preview.would_delete.series} series marcadas como importadas. Los registros manuales se conservarán. Esta acción no se puede deshacer.`,
        confirmLabel: "Eliminar importados",
      });
      if (!accepted) return;
      const result = await cleanupImportedCatalog();
      setManualRows([]);
      toast.success(`Eliminados ${result.summary.total} títulos importados.`);
      void loadLocalCatalog();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo limpiar el catálogo importado.");
    }
  };

  const sortOptions = mediaType === "series" ? SORT_OPTIONS_TV : SORT_OPTIONS;

  // Rango mostrado en el bloque actual.
  const from = totalResults === 0 ? 0 : (page - 1) * blockSize + 1;
  const to = Math.min(page * blockSize, totalResults);
  const visibleResults = hideExisting ? results.filter((item) => !localIds.has(item.tmdb_id)) : results;

  // Si todos los titulos del bloque estan marcados.
  const allOnPageSelected = visibleResults.length > 0 && visibleResults.every((r) => selected.has(r.tmdb_id));

  return (
    <>
      {confirmDialog}
      <AdminLayout>
        <div className="space-y-6">
          {/* Header */}
          <div>
            <h1 className="text-2xl font-black text-white">Explorador TMDB</h1>
            <p className="text-gray-500 text-sm mt-0.5">
              Busca y filtra contenido de TMDB por género, año, idioma y más para importar directamente al
              catálogo.
            </p>
          </div>

          {/* Filters card */}
          <div
            ref={filtersRef}
            className="bg-brand-card border border-brand-border rounded-2xl p-6 space-y-5"
            onKeyDown={handleKeyDown}
          >
            {/* Type selector */}
            <div className="flex gap-1 bg-brand-surface border border-brand-border rounded-xl p-1 w-fit">
              {(["movie", "series"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => {
                    setMediaType(t);
                    setResults([]);
                    setHasSearched(false);
                    setSelected(new Set());
                  }}
                  className={`px-5 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                    mediaType === t
                      ? "bg-brand-card text-white border border-brand-border shadow-sm"
                      : "text-gray-400 hover:text-white"
                  }`}
                >
                  {t === "movie" ? "Películas" : "Series"}
                </button>
              ))}
            </div>

            {/* Filter grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">
                  Año desde
                </label>
                <input
                  type="number"
                  min="1900"
                  max="2099"
                  placeholder="1900"
                  value={yearFrom}
                  onChange={(e) => setYearFrom(e.target.value)}
                  className="w-full bg-brand-surface border border-brand-border rounded-lg px-3 py-2 text-gray-200 text-sm focus:outline-none focus:border-gray-500 transition-colors"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">
                  Año hasta
                </label>
                <input
                  type="number"
                  min="1900"
                  max="2099"
                  placeholder={String(new Date().getFullYear())}
                  value={yearTo}
                  onChange={(e) => setYearTo(e.target.value)}
                  className="w-full bg-brand-surface border border-brand-border rounded-lg px-3 py-2 text-gray-200 text-sm focus:outline-none focus:border-gray-500 transition-colors"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">
                  Ordenar por
                </label>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="w-full bg-brand-surface border border-brand-border rounded-lg px-3 py-2 text-gray-200 text-sm focus:outline-none focus:border-gray-500 transition-colors"
                >
                  {sortOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">
                  Idioma original
                </label>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="w-full bg-brand-surface border border-brand-border rounded-lg px-3 py-2 text-gray-200 text-sm focus:outline-none focus:border-gray-500 transition-colors"
                >
                  {LANGUAGE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">
                  Votos mínimos
                </label>
                <input
                  type="number"
                  min="0"
                  value={minVotes}
                  onChange={(e) => setMinVotes(e.target.value)}
                  className="w-full bg-brand-surface border border-brand-border rounded-lg px-3 py-2 text-gray-200 text-sm focus:outline-none focus:border-gray-500 transition-colors"
                />
              </div>
            </div>

            <label className="inline-flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
              <input
                type="checkbox"
                checked={hideExisting}
                onChange={(event) => setHideExisting(event.target.checked)}
                className="accent-red-500"
              />
              Ocultar títulos que ya están en mi catálogo
              <span className="text-xs text-gray-500">
                ({localIds.size.toLocaleString()} identificadores revisados)
              </span>
            </label>

            {/* Genres */}
            {genres.length > 0 && (
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 block">
                  Géneros
                  {selectedGenres.length > 0 && (
                    <button
                      onClick={() => setSelectedGenres([])}
                      className="ml-2 text-brand-red hover:text-red-400 normal-case font-normal transition-colors"
                    >
                      × limpiar
                    </button>
                  )}
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {genres.map((g) => (
                    <button
                      key={g.id}
                      onClick={() =>
                        setSelectedGenres((prev) =>
                          prev.includes(g.id) ? prev.filter((id) => id !== g.id) : [...prev, g.id],
                        )
                      }
                      className={`text-xs font-semibold px-2.5 py-1 rounded-full border transition-all ${
                        selectedGenres.includes(g.id)
                          ? "bg-brand-red border-red-700 text-white"
                          : "bg-brand-surface border-brand-border text-gray-400 hover:text-white hover:border-gray-500"
                      }`}
                    >
                      {g.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {searchError && (
              <div className="bg-red-900/20 border border-red-800/40 rounded-lg px-4 py-3 text-red-400 text-sm">
                {searchError}
              </div>
            )}

            <button
              onClick={() => handleSearch(1)}
              disabled={loading}
              className="flex items-center gap-2 bg-brand-red hover:bg-red-700 disabled:opacity-50 text-white font-bold py-2.5 px-5 rounded-lg transition-colors text-sm"
            >
              {loading ? (
                <>
                  <span className="w-3.5 h-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                  Buscando...
                </>
              ) : (
                <>
                  <SearchIcon />
                  Buscar en TMDB
                </>
              )}
            </button>
          </div>

          {/* Results */}
          {hasSearched && (
            <div ref={resultsRef} className="bg-brand-card border border-brand-border rounded-2xl">
              {/*
                Barra de resultados: queda fija al hacer scroll, de modo que la
                paginacion y el boton de importar estan siempre a mano sin
                tener que bajar hasta el final de la lista.
              */}
              <div className="sticky top-14 z-20 bg-brand-card/95 backdrop-blur-sm border-b border-brand-border px-4 sm:px-6 py-3 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-baseline gap-2 min-w-0">
                    <span className="text-white font-bold">{totalResults.toLocaleString()}</span>
                    <span className="text-gray-500 text-sm">resultados</span>
                    <span className="text-gray-500 text-xs">
                      · {from}–{to} · bloque {page}/{totalPages}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        filtersRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
                      }
                      className="text-xs font-semibold text-gray-500 hover:text-white transition-colors"
                    >
                      ↑ Filtros
                    </button>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={toggleSelectAll}
                      disabled={visibleResults.length === 0}
                      className="text-xs font-semibold text-gray-400 hover:text-white disabled:opacity-40 transition-colors"
                    >
                      {allOnPageSelected ? "Quitar este bloque" : "Seleccionar este bloque"}
                    </button>
                    <button
                      type="button"
                      onClick={handleImportAll}
                      disabled={
                        importing ||
                        Boolean(activeJob && ["queued", "running"].includes(activeJob.status)) ||
                        totalResults === 0
                      }
                      className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white text-sm font-bold py-1.5 px-4 rounded-lg transition-colors"
                    >
                      {importing ? "Preparando listado..." : "Importar todo el listado"}
                    </button>
                    {selected.size > 0 && (
                      <button
                        type="button"
                        onClick={handleImport}
                        disabled={importing}
                        className="flex items-center gap-2 bg-brand-red hover:bg-red-700 disabled:opacity-50 text-white text-sm font-bold py-1.5 px-4 rounded-lg transition-colors"
                      >
                        {importing ? (
                          <>
                            <span className="w-3 h-3 rounded-full border-2 border-white border-t-transparent animate-spin" />
                            Importando...
                          </>
                        ) : (
                          `Importar ${selected.size} seleccionado${selected.size !== 1 ? "s" : ""}`
                        )}
                      </button>
                    )}
                  </div>
                </div>

                <AdminPagination
                  page={page}
                  pages={totalPages}
                  total={totalResults}
                  limit={blockSize}
                  onPageChange={(next) => handleSearch(next, { keepSelection: true })}
                  onLimitChange={(size) => {
                    setBlockSize(size);
                    void handleSearch(1, { keepSelection: true, count: size });
                  }}
                  pageSizes={BLOCK_SIZES}
                  limitLabel="Por bloque"
                  itemLabel="resultados"
                />
              </div>

              {activeJob && (
                <div className="px-6 py-3 border-b border-brand-border bg-brand-surface/40 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-gray-300">
                    <span>
                      Trabajo{" "}
                      {activeJob.status === "queued"
                        ? "en cola"
                        : activeJob.status === "running"
                          ? "importando"
                          : activeJob.status === "completed"
                            ? "completado"
                            : activeJob.status}
                      {activeJob.status === "queued" || activeJob.status === "running"
                        ? " · avanza en paquetes de 50"
                        : ""}
                    </span>
                    <div className="flex flex-wrap items-center gap-3">
                      <span>
                        {activeJob.processed.toLocaleString()} / {activeJob.total.toLocaleString()} ·{" "}
                        {activeJob.imported.toLocaleString()} nuevos
                      </span>
                      {(activeJob.status === "queued" || activeJob.status === "running") && (
                        <button
                          type="button"
                          onClick={() => void handleCancelJob()}
                          disabled={cancellingJob}
                          className="rounded-md border border-red-500/40 px-2.5 py-1 text-xs font-semibold text-red-300 transition-colors hover:border-red-400 hover:bg-red-500/10 disabled:cursor-wait disabled:opacity-60"
                        >
                          {cancellingJob ? "Deteniendo…" : "Detener importación"}
                        </button>
                      )}
                    </div>
                  </div>
                  {(activeJob.status === "queued" || activeJob.status === "running") && (
                    <div
                      className="mt-2 h-1.5 rounded-full bg-brand-border overflow-hidden"
                      aria-label="Progreso de importación"
                    >
                      <div
                        className="h-full bg-emerald-500 transition-all"
                        style={{
                          width: `${activeJob.total ? Math.min(100, (activeJob.processed / activeJob.total) * 100) : 0}%`,
                        }}
                      />
                    </div>
                  )}
                  {importResult && activeJob.status !== "queued" && activeJob.status !== "running" && (
                    <p className="mt-1 text-emerald-400">
                      Importados {importResult.imported.toLocaleString()} de{" "}
                      {importResult.total.toLocaleString()} elementos.
                    </p>
                  )}
                </div>
              )}

              {/* Skeleton grid while loading */}
              {loading ? (
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 rounded-b-2xl overflow-hidden">
                  {Array.from({ length: 15 }).map((_, i) => (
                    <div key={i} className="p-3 border-r border-b border-brand-border animate-pulse">
                      <div className="aspect-[2/3] w-full mb-2 rounded bg-brand-surface" />
                      <div className="h-3 bg-brand-surface rounded w-3/4 mb-1" />
                      <div className="h-2.5 bg-brand-surface rounded w-1/2" />
                    </div>
                  ))}
                </div>
              ) : visibleResults.length === 0 ? (
                <div className="px-6 py-16 text-center text-gray-500 text-sm">
                  {results.length > 0
                    ? "Todos los resultados de este bloque ya están en el catálogo."
                    : "No se encontraron resultados para los filtros seleccionados."}
                </div>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 rounded-b-2xl overflow-hidden">
                  {visibleResults.map((item) => {
                    const isSelected = selected.has(item.tmdb_id);
                    const isImported = localIds.has(item.tmdb_id);
                    return (
                      <button
                        key={item.tmdb_id}
                        onClick={() => toggleSelect(item.tmdb_id)}
                        className={`relative p-3 text-left border-r border-b border-brand-border hover:bg-brand-surface/60 transition-colors ${
                          isSelected ? "bg-brand-red/10 ring-1 ring-inset ring-brand-red/40" : ""
                        }`}
                      >
                        {/* Poster */}
                        <div className="relative aspect-[2/3] w-full mb-2 rounded overflow-hidden bg-brand-surface">
                          {item.poster_url ? (
                            <img
                              src={item.poster_url}
                              alt={item.title}
                              className="w-full h-full object-cover"
                              loading="lazy"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-gray-600 text-xs">
                              Sin imagen
                            </div>
                          )}
                          <div className="absolute top-1.5 left-1.5 flex flex-col gap-1">
                            {isImported && (
                              <span className="bg-green-500/80 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
                                ✔ En catálogo
                              </span>
                            )}
                            {isSelected && (
                              <div className="w-5 h-5 rounded-full bg-brand-red flex items-center justify-center">
                                <CheckIcon />
                              </div>
                            )}
                          </div>
                        </div>
                        <p className="text-gray-200 text-xs font-semibold line-clamp-2 leading-snug">
                          {item.title}
                        </p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {item.year && <span className="text-gray-500 text-xs">{item.year}</span>}
                          {item.rating > 0 && (
                            <span className="text-brand-gold text-xs">★ {item.rating.toFixed(1)}</span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <section className="bg-brand-card border border-brand-border rounded-2xl p-5 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-white font-bold">Limpieza y eliminación del catálogo</h2>
                <p className="mt-1 text-sm text-gray-500">
                  Vacía el contenido marcado como importado o busca títulos para eliminarlos manualmente.
                </p>
              </div>
              <button
                type="button"
                onClick={deleteImportedCatalog}
                disabled={manualBusy}
                className="rounded-lg border border-red-800/50 bg-red-900/20 px-3 py-2 text-sm font-semibold text-red-300 hover:bg-red-900/40 disabled:opacity-50"
              >
                Vaciar títulos importados
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              <select
                value={manualType}
                onChange={(event) => setManualType(event.target.value as "movie" | "series")}
                aria-label="Tipo para eliminar manualmente"
                className="rounded-lg border border-brand-border bg-brand-surface px-3 py-2 text-sm text-gray-200"
              >
                <option value="movie">Películas</option>
                <option value="series">Series</option>
              </select>
              <input
                value={catalogQuery}
                onChange={(event) => setCatalogQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void searchCatalog();
                }}
                placeholder="Buscar título del catálogo"
                aria-label="Buscar título del catálogo para eliminar"
                className="min-w-[220px] flex-1 rounded-lg border border-brand-border bg-brand-surface px-3 py-2 text-sm text-gray-200"
              />
              <button
                type="button"
                onClick={() => void searchCatalog()}
                disabled={manualBusy}
                className="rounded-lg bg-brand-surface px-4 py-2 text-sm font-semibold text-gray-200 hover:bg-brand-border disabled:opacity-50"
              >
                {manualBusy ? "Procesando…" : "Buscar"}
              </button>
              {manualSelected.size > 0 && (
                <button
                  type="button"
                  onClick={deleteManualSelected}
                  disabled={manualBusy}
                  className="rounded-lg bg-red-700 px-4 py-2 text-sm font-bold text-white hover:bg-red-600 disabled:opacity-50"
                >
                  Eliminar seleccionados ({manualSelected.size})
                </button>
              )}
            </div>

            {manualRows.length > 0 ? (
              <div className="max-h-72 overflow-auto rounded-lg border border-brand-border">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-brand-card text-xs uppercase text-gray-500">
                    <tr>
                      <th className="w-10 px-3 py-2" aria-label="Seleccionar" />
                      <th className="px-3 py-2 text-left">Título</th>
                      <th className="w-20 px-3 py-2 text-right">Año</th>
                    </tr>
                  </thead>
                  <tbody>
                    {manualRows.map((row) => (
                      <tr key={row.id} className="border-t border-brand-border text-gray-300">
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={manualSelected.has(row.id)}
                            aria-label={`Seleccionar ${row.title}`}
                            onChange={() =>
                              setManualSelected((current) => {
                                const next = new Set(current);
                                if (next.has(row.id)) next.delete(row.id);
                                else next.add(row.id);
                                return next;
                              })
                            }
                            className="accent-red-500"
                          />
                        </td>
                        <td className="px-3 py-2">{row.title}</td>
                        <td className="px-3 py-2 text-right text-gray-500">{row.year || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : catalogQuery && !manualBusy ? (
              <p className="text-sm text-gray-500">
                No se han cargado coincidencias. Ejecuta la búsqueda para ver resultados.
              </p>
            ) : null}
          </section>
        </div>
      </AdminLayout>
    </>
  );
}

function SearchIcon() {
  return (
    <svg
      className="w-4 h-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      className="w-3 h-3 text-white"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
