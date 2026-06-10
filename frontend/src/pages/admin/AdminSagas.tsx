import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchSagas,
  fetchSagaById,
  importByTmdbIds,
  refreshSaga,
  adminFetchSagas,
  adminAddSaga,
  adminDeleteSaga,
  type SagaItem,
  type SagaDetail,
  type SagaPart,
  type CvSagaRow,
} from "@/lib/api";
import { Search, Lock, Trash2, Plus, RefreshCw, Download, CheckCircle2, AlertCircle, X } from "lucide-react";
import { toast } from "sonner";

function Spinner() {
  return <div className="w-5 h-5 rounded-full border-2 border-brand-red border-t-transparent animate-spin" />;
}

function ImportIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points="17 8 12 3 7 8" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="12" y1="3" x2="12" y2="15" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SagaPartCard({
  part,
  isImporting,
  onImport,
}: {
  part: SagaPart;
  isImporting: boolean;
  onImport: () => void;
}) {
  return (
    <div
      className={`rounded-lg overflow-hidden border transition-colors ${
        part.is_imported
          ? "border-green-800/40 bg-brand-surface"
          : "border-yellow-800/30 bg-brand-surface/80 opacity-85"
      }`}
    >
      <div className="aspect-[2/3] relative bg-brand-dark">
        {part.poster_url ? (
          <img src={part.poster_url} alt={part.title} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-gray-600 text-xs px-2 text-center">{part.title}</span>
          </div>
        )}

        <div
          className={`absolute top-1.5 right-1.5 rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
            part.is_imported ? "bg-green-700/80 text-white" : "bg-yellow-700/80 text-white"
          }`}
        >
          {part.is_imported ? "Importada" : "Pendiente"}
        </div>

        {part.vote_average > 0 && (
          <div className="absolute top-1.5 left-1.5 bg-black/70 rounded-md px-1.5 py-0.5 flex items-center gap-0.5">
            <span className="text-brand-gold text-[10px]">★</span>
            <span className="text-white text-[10px] font-bold">{part.vote_average.toFixed(1)}</span>
          </div>
        )}

        {!part.is_imported && (
          <button
            onClick={onImport}
            disabled={isImporting}
            className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 hover:opacity-100 transition-opacity cursor-pointer"
          >
            {isImporting ? (
              <Spinner />
            ) : (
              <div className="flex flex-col items-center gap-1">
                <div className="w-9 h-9 rounded-full bg-brand-red flex items-center justify-center">
                  <ImportIcon />
                </div>
                <span className="text-white text-xs font-semibold">Importar</span>
              </div>
            )}
          </button>
        )}
      </div>

      <div className="p-2.5">
        <p className="text-xs font-medium text-white truncate">{part.title}</p>
        <div className="flex items-center justify-between mt-1">
          {part.year && <span className="text-[10px] text-gray-500">{part.year}</span>}
          {part.is_imported && <span className="text-[10px] text-green-400 font-medium">✓ Local</span>}
        </div>
      </div>
    </div>
  );
}

export default function AdminSagas() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [importingParts, setImportingParts] = useState<Set<number>>(new Set());
  const [bulkImporting, setBulkImporting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Left panel state
  const [searchQuery, setSearchQuery] = useState("");
  const [sortByCount, setSortByCount] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newCollectionId, setNewCollectionId] = useState("");
  const [addingSaga, setAddingSaga] = useState(false);

  // Fetch all sagas (TMDB-enriched list)
  const { data: sagas = [], isLoading } = useQuery<SagaItem[]>({
    queryKey: ["sagas"],
    queryFn: fetchSagas,
    staleTime: 30 * 60 * 1000,
  });

  // Fetch admin saga rows (for DB metadata like is_curated)
  const { data: cvSagas = [] } = useQuery<CvSagaRow[]>({
    queryKey: ["admin-sagas"],
    queryFn: adminFetchSagas,
    staleTime: 30 * 60 * 1000,
  });

  // Build a map from collection_id → CvSagaRow
  const dbSagaMap = useMemo(() => {
    const map = new Map<number, CvSagaRow>();
    for (const s of cvSagas) {
      map.set(s.collection_id, s);
    }
    return map;
  }, [cvSagas]);

  // Filtered + sorted sagas for the left panel
  const filteredSagas = useMemo(() => {
    let list = [...sagas];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((s) => s.name.toLowerCase().includes(q));
    }
    if (sortByCount) {
      list.sort((a, b) => b.part_count - a.part_count);
    } else {
      list.sort((a, b) => a.name.localeCompare(b.name));
    }
    return list;
  }, [sagas, searchQuery, sortByCount]);

  // Fetch selected saga detail
  const {
    data: sagaDetail,
    isLoading: detailLoading,
    refetch: refetchDetail,
  } = useQuery<SagaDetail>({
    queryKey: ["saga-detail", selectedId],
    queryFn: () => fetchSagaById(selectedId!),
    enabled: selectedId !== null,
    staleTime: 60 * 1000,
  });

  const getStatusColor = (status: "all" | "some" | "unknown") => {
    if (status === "all") return "bg-green-400";
    if (status === "some") return "bg-yellow-400";
    return "bg-gray-500";
  };

  // Import a single missing movie
  const importSingle = async (tmdbId: number) => {
    if (importingParts.has(tmdbId)) return;
    setImportingParts((prev) => new Set(prev).add(tmdbId));
    try {
      await importByTmdbIds([tmdbId], "movie");
      await refetchDetail();
      toast.success("Película importada correctamente");
    } catch (err: any) {
      toast.error(err.message || "Error al importar película");
    } finally {
      setImportingParts((prev) => {
        const next = new Set(prev);
        next.delete(tmdbId);
        return next;
      });
    }
  };

  // Bulk import all missing
  const importAllMissing = async () => {
    if (!sagaDetail || bulkImporting) return;
    const missing = sagaDetail.parts.filter((p) => !p.is_imported);
    if (missing.length === 0) return;

    setBulkImporting(true);
    const tmdbIds = missing.map((p) => p.tmdb_id);
    let imported = 0;
    for (let i = 0; i < tmdbIds.length; i += 5) {
      const batch = tmdbIds.slice(i, i + 5);
      try {
        await importByTmdbIds(batch, "movie");
        imported += batch.length;
      } catch {
        // continue
      }
    }
    await refetchDetail();
    setBulkImporting(false);
    toast.success(`${imported} películas importadas`);
  };

  // Refresh saga from TMDB
  const handleRefresh = async (autoImport = false) => {
    if (!selectedId || refreshing) return;
    setRefreshing(true);
    try {
      const result = await refreshSaga(selectedId, autoImport);
      await refetchDetail();
      queryClient.invalidateQueries({ queryKey: ["sagas"] });
      toast.success(
        autoImport
          ? `Saga sincronizada. ${result.imported} películas importadas.`
          : "Saga sincronizada correctamente",
      );
    } catch (err: any) {
      toast.error(err.message || "Error al sincronizar saga");
    } finally {
      setRefreshing(false);
    }
  };

  // Add a custom saga
  const handleAddSaga = async () => {
    const cid = Number(newCollectionId);
    if (!cid || isNaN(cid)) {
      toast.error("Ingresa un collection_id válido");
      return;
    }
    setAddingSaga(true);
    try {
      const row = await adminAddSaga(cid);
      toast.success(`Saga "${row.name}" agregada`);
      setShowAddForm(false);
      setNewCollectionId("");
      queryClient.invalidateQueries({ queryKey: ["sagas"] });
      queryClient.invalidateQueries({ queryKey: ["admin-sagas"] });
      setSelectedId(cid);
    } catch (err: any) {
      toast.error(err.message || "Error al agregar saga");
    } finally {
      setAddingSaga(false);
    }
  };

  // Delete a custom saga
  const handleDeleteSaga = async (collectionId: number, name: string) => {
    const confirmed = window.confirm(`¿Eliminar "${name}" de la lista de sagas?`);
    if (!confirmed) return;
    try {
      await adminDeleteSaga(collectionId);
      toast.success("Saga eliminada");
      if (selectedId === collectionId) {
        setSelectedId(null);
      }
      queryClient.invalidateQueries({ queryKey: ["sagas"] });
      queryClient.invalidateQueries({ queryKey: ["admin-sagas"] });
    } catch (err: any) {
      toast.error(err.message || "Error al eliminar saga");
    }
  };

  const missingCount = sagaDetail?.parts.filter((p) => !p.is_imported).length ?? 0;
  const importedCount = sagaDetail ? sagaDetail.parts.length - missingCount : 0;

  return (
    <div className="flex gap-6 h-[calc(100vh-9rem)]">
      {/* ── Left Panel — Saga List ── */}
      <div className="w-[280px] flex-shrink-0 flex flex-col bg-brand-surface border border-brand-border rounded-xl overflow-hidden">
        {/* Search */}
        <div className="p-3 border-b border-brand-border">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar sagas..."
              className="w-full bg-brand-dark border border-white/10 rounded-lg pl-9 pr-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-gray-500 transition-colors"
            />
          </div>
        </div>

        {/* Sort toggle */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-brand-border">
          <button
            onClick={() => setSortByCount(true)}
            className={`text-xs font-semibold px-2.5 py-1 rounded-md transition-colors ${
              sortByCount ? "bg-brand-red/20 text-brand-red" : "text-gray-500 hover:text-gray-300"
            }`}
          >
            Por películas
          </button>
          <button
            onClick={() => setSortByCount(false)}
            className={`text-xs font-semibold px-2.5 py-1 rounded-md transition-colors ${
              !sortByCount ? "bg-brand-red/20 text-brand-red" : "text-gray-500 hover:text-gray-300"
            }`}
          >
            Alfabético
          </button>
        </div>

        {/* Saga list */}
        <div className="flex-1 overflow-y-auto space-y-0.5 p-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Spinner />
            </div>
          ) : filteredSagas.length === 0 ? (
            <p className="text-gray-500 text-xs text-center py-8">
              {searchQuery ? "Sin resultados" : "No hay sagas"}
            </p>
          ) : (
            filteredSagas.map((saga) => {
              const dbRow = dbSagaMap.get(saga.id);
              const isCurated = dbRow?.is_curated ?? true;
              return (
                <button
                  key={saga.id}
                  onClick={() => setSelectedId(saga.id)}
                  className={`w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                    selectedId === saga.id
                      ? "bg-brand-red/15 text-white border border-brand-red/20"
                      : "text-gray-400 hover:text-white hover:bg-white/5"
                  }`}
                >
                  {/* Poster thumbnail */}
                  <div className="w-10 h-[60px] rounded flex-shrink-0 overflow-hidden bg-brand-dark">
                    {saga.poster_path ? (
                      <img
                        src={saga.poster_path}
                        alt={saga.name}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <span className="text-gray-600 text-[8px]">N/A</span>
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium truncate">{saga.name}</span>
                      {isCurated && <Lock size={11} className="text-gray-500 flex-shrink-0" />}
                    </div>
                    <span className="text-xs text-gray-500">
                      {saga.part_count} {saga.part_count === 1 ? "película" : "películas"}
                    </span>
                  </div>

                  {/* Status dot */}
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${getStatusColor("unknown")}`} />

                  {/* Delete button for custom sagas */}
                  {!isCurated && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteSaga(saga.id, saga.name);
                      }}
                      className="p-1 rounded hover:bg-red-900/30 text-gray-500 hover:text-red-400 transition-colors flex-shrink-0"
                      title="Eliminar saga"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </button>
              );
            })
          )}
        </div>

        {/* Add saga button / form */}
        <div className="border-t border-brand-border p-3">
          {showAddForm ? (
            <div className="space-y-2">
              <div>
                <label className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold block mb-1">
                  TMDB Collection ID
                </label>
                <input
                  type="number"
                  value={newCollectionId}
                  onChange={(e) => setNewCollectionId(e.target.value)}
                  placeholder="Ej: 1771"
                  className="w-full bg-brand-dark border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-gray-500 transition-colors"
                />
                <a
                  href="https://www.themoviedb.org/collection/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] text-gray-600 hover:text-gray-400 mt-1 inline-block"
                >
                  https://www.themoviedb.org/collection/XXXXX
                </a>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleAddSaga}
                  disabled={addingSaga}
                  className="flex-1 flex items-center justify-center gap-1.5 bg-brand-red hover:bg-red-700 disabled:opacity-50 text-white text-xs font-bold py-2 rounded-lg transition-colors"
                >
                  {addingSaga ? <Spinner /> : <Plus size={14} />}
                  Agregar
                </button>
                <button
                  onClick={() => {
                    setShowAddForm(false);
                    setNewCollectionId("");
                  }}
                  className="px-3 py-2 rounded-lg border border-white/10 text-gray-400 hover:text-white hover:bg-white/5 text-xs transition-colors"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowAddForm(true)}
              className="w-full flex items-center justify-center gap-1.5 bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white text-sm font-semibold py-2.5 rounded-lg border border-dashed border-white/10 transition-colors"
            >
              <Plus size={15} />
              Agregar saga
            </button>
          )}
        </div>
      </div>

      {/* ── Center Panel — Saga Detail ── */}
      <div className="flex-1 min-w-0 overflow-y-auto">
        {!selectedId && (
          <div className="flex items-center justify-center h-64 text-gray-500 text-sm">
            Selecciona una saga para ver los detalles
          </div>
        )}

        {selectedId && detailLoading && (
          <div className="flex items-center justify-center h-64">
            <Spinner />
          </div>
        )}

        {selectedId && sagaDetail && !detailLoading && (
          <div>
            {/* Hero banner */}
            <div className="relative rounded-xl overflow-hidden mb-6">
              {sagaDetail.backdrop_path ? (
                <>
                  <img
                    src={sagaDetail.backdrop_path}
                    alt=""
                    className="w-full h-48 object-cover opacity-30 blur-sm"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-brand-dark via-brand-dark/60 to-transparent" />
                </>
              ) : (
                <div className="w-full h-32 bg-brand-surface" />
              )}
              <div className="absolute bottom-0 left-0 right-0 p-6">
                <h2 className="text-2xl font-black text-white mb-1">{sagaDetail.name}</h2>
                {sagaDetail.overview && (
                  <p className="text-xs text-gray-400 line-clamp-2 max-w-xl">{sagaDetail.overview}</p>
                )}
                <p className="text-sm text-gray-400 mt-2">
                  {sagaDetail.parts.length} películas · {importedCount} importadas · {missingCount} pendientes
                </p>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2 mb-6 flex-wrap">
              <button
                onClick={() => handleRefresh(false)}
                disabled={refreshing}
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border border-white/10 bg-white/5 text-gray-300 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-50"
              >
                {refreshing ? <Spinner /> : <RefreshCw size={14} />}
                Sincronizar
              </button>
              <button
                onClick={() => handleRefresh(true)}
                disabled={refreshing}
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border border-green-700/50 bg-green-900/30 text-green-300 hover:bg-green-800/40 transition-colors disabled:opacity-50"
              >
                {refreshing ? <Spinner /> : <RefreshCw size={14} />}
                Sincronizar e importar
              </button>
              {missingCount > 0 && (
                <button
                  onClick={importAllMissing}
                  disabled={bulkImporting}
                  className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border border-yellow-700/50 bg-yellow-900/30 text-yellow-300 hover:bg-yellow-800/40 transition-colors disabled:opacity-50"
                >
                  {bulkImporting ? <Spinner /> : <Download size={14} />}
                  Importar pendientes ({missingCount})
                </button>
              )}
            </div>

            {/* Import status banner */}
            {missingCount > 0 ? (
              <div className="mb-4 flex items-center gap-3 p-3 rounded-lg bg-yellow-900/30 border border-yellow-700/50">
                <AlertCircle size={16} className="text-yellow-400 flex-shrink-0" />
                <p className="text-yellow-300 text-sm flex-1">
                  {missingCount} película{missingCount !== 1 ? "s" : ""} pendiente
                  {missingCount !== 1 ? "s" : ""} de importar
                </p>
              </div>
            ) : (
              <div className="mb-4 flex items-center gap-2 p-3 rounded-lg bg-green-900/30 border border-green-700/50">
                <CheckCircle2 size={16} className="text-green-400 flex-shrink-0" />
                <p className="text-green-300 text-sm">Todas las películas están importadas</p>
              </div>
            )}

            {/* Parts grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {sagaDetail.parts.map((part) => (
                <SagaPartCard
                  key={part.id}
                  part={part}
                  isImporting={importingParts.has(part.tmdb_id)}
                  onImport={() => importSingle(part.tmdb_id)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
