import { useState, useEffect, useCallback, useRef } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import AdminPagination from "@/components/admin/AdminPagination";
import { useConfirm } from "@/components/admin/useConfirm";
import { toast } from "sonner";
import {
  getTmdbGenres,
  tmdbDiscover,
  importByTmdbIds,
  getSeries,
  getMovies,
  type TmdbGenre,
  type TmdbDiscoverItem,
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
const BLOCK_SIZES = [60, 120, 300, 500];

/** Peticiones del catálogo local para saber qué títulos ya están importados. */
const CATALOGUE_PAGE_SIZE = 100;
const CATALOGUE_MAX_PAGES = 20;

export default function TmdbScraper() {
  const { confirm, confirmDialog } = useConfirm();
  const [mediaType, setMediaType] = useState<"movie" | "series">("movie");
  const [genres, setGenres] = useState<TmdbGenre[]>([]);
  const [selectedGenres, setSelectedGenres] = useState<number[]>([]);
  const [yearFrom, setYearFrom] = useState("");
  const [yearTo, setYearTo] = useState("");
  const [sortBy, setSortBy] = useState("popularity.desc");
  const [language, setLanguage] = useState("");
  const [minVotes, setMinVotes] = useState("50");
  const [page, setPage] = useState(1);
  const [blockSize, setBlockSize] = useState(BLOCK_SIZES[0]);

  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<TmdbDiscoverItem[]>([]);
  const [totalResults, setTotalResults] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchError, setSearchError] = useState("");

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; total: number } | null>(null);
  const [localIds, setLocalIds] = useState<Set<number>>(new Set());

  // Referencias para desplazar la vista: la barra de resultados siempre
  // visible y el formulario de filtros.
  const resultsRef = useRef<HTMLDivElement>(null);
  const filtersRef = useRef<HTMLDivElement>(null);

  /**
   * Recoge los identificadores de TMDB de todo el catálogo local, no solo de
   * la primera página: así la marca "En catálogo" es fiable.
   */
  const collectTmdbIds = useCallback(
    async (loadPage: (page: number) => Promise<Array<{ tmdb_id?: number | null }>>): Promise<number[]> => {
      const ids: number[] = [];
      for (let p = 1; p <= CATALOGUE_MAX_PAGES; p++) {
        const items = await loadPage(p).catch(() => []);
        if (items.length === 0) break;
        for (const item of items) {
          if (item.tmdb_id) ids.push(item.tmdb_id);
        }
        if (items.length < CATALOGUE_PAGE_SIZE) break;
      }
      return ids;
    },
    [],
  );

  // Load local catalog (TMDB IDs already imported) to show badges
  const loadLocalCatalog = useCallback(async () => {
    try {
      const [movieIds, seriesIds] = await Promise.all([
        collectTmdbIds((p) => getMovies({ page: p, limit: CATALOGUE_PAGE_SIZE })),
        collectTmdbIds((p) => getSeries({ page: p, limit: CATALOGUE_PAGE_SIZE })),
      ]);
      setLocalIds(new Set([...movieIds, ...seriesIds]));
    } catch (err) {
      // Si no se puede leer el catálogo local, la vista sigue funcionando.
      console.warn("No se pudo comprobar el catálogo local", err);
    }
  }, [collectTmdbIds]);

  // Load genres once, without duplicate calls
  useEffect(() => {
    setGenres([]);
    setSelectedGenres([]);
    getTmdbGenres(mediaType)
      .then(setGenres)
      .catch(() => {});
    loadLocalCatalog();
  }, [mediaType, loadLocalCatalog]);

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
    const pageIds = results.map((r) => r.tmdb_id);
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
      const resp = await importByTmdbIds([...selected], mediaType);
      setImportResult({ imported: resp.summary.imported, total: resp.summary.total });
      setSelected(new Set());
      loadLocalCatalog();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al importar.");
    } finally {
      setImporting(false);
    }
  };

  const sortOptions = mediaType === "series" ? SORT_OPTIONS_TV : SORT_OPTIONS;

  // Rango mostrado en el bloque actual.
  const from = totalResults === 0 ? 0 : (page - 1) * blockSize + 1;
  const to = Math.min(page * blockSize, totalResults);

  // Si todos los titulos del bloque estan marcados.
  const allOnPageSelected = results.length > 0 && results.every((r) => selected.has(r.tmdb_id));

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
                      disabled={results.length === 0}
                      className="text-xs font-semibold text-gray-400 hover:text-white disabled:opacity-40 transition-colors"
                    >
                      {allOnPageSelected ? "Quitar este bloque" : "Seleccionar este bloque"}
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

              {/* Import result banner */}
              {importResult && (
                <div className="px-6 py-3 bg-green-900/20 border-b border-green-800/30 text-green-400 text-sm">
                  Se importaron {importResult.imported} de {importResult.total} título(s) correctamente.
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
              ) : results.length === 0 ? (
                <div className="px-6 py-16 text-center text-gray-500 text-sm">
                  No se encontraron resultados para los filtros seleccionados.
                </div>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 rounded-b-2xl overflow-hidden">
                  {results.map((item) => {
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
