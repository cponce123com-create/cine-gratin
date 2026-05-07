import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchSagas, fetchSagaById, importByTmdbIds, refreshSaga, type SagaItem, type SagaDetail, type SagaPart } from "@/lib/api";

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

function RefreshIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10" />
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
    </svg>
  );
}

function checkIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export default function AdminSagas() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [importingParts, setImportingParts] = useState<Set<number>>(new Set());
  const [bulkImporting, setBulkImporting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Fetch all sagas
  const { data: sagas = [], isLoading } = useQuery<SagaItem[]>({
    queryKey: ["sagas"],
    queryFn: fetchSagas,
    staleTime: 30 * 60 * 1000,
  });

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

  // Import a single missing movie
  const importSingle = async (tmdbId: number) => {
    if (importingParts.has(tmdbId)) return;
    setImportingParts((prev) => new Set(prev).add(tmdbId));
    try {
      await importByTmdbIds([tmdbId], "movie");
      await refetchDetail();
    } catch {
      // ignore
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
    for (let i = 0; i < tmdbIds.length; i += 5) {
      const batch = tmdbIds.slice(i, i + 5);
      try {
        await importByTmdbIds(batch, "movie");
      } catch {
        // continue
      }
    }
    await refetchDetail();
    setBulkImporting(false);
  };

  // Refresh saga from TMDB
  const handleRefresh = async (autoImport = false) => {
    if (!selectedId || refreshing) return;
    setRefreshing(true);
    try {
      await refreshSaga(selectedId, autoImport);
      await refetchDetail();
      queryClient.invalidateQueries({ queryKey: ["sagas"] });
    } catch {
      // ignore
    } finally {
      setRefreshing(false);
    }
  };

  const missingCount = sagaDetail?.parts.filter((p) => !p.is_imported).length ?? 0;
  const importedCount = sagaDetail ? sagaDetail.parts.length - missingCount : 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Gestión de Sagas</h1>
          <p className="text-sm text-gray-400 mt-1">
            {sagas.length} sagas configuradas
          </p>
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <Spinner />
        </div>
      )}

      {!isLoading && (
        <div className="flex gap-6">
          {/* Sagas list */}
          <div className="w-72 flex-shrink-0 space-y-1">
            {sagas.map((saga) => (
              <button
                key={saga.id}
                onClick={() => setSelectedId(saga.id)}
                className={`w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  selectedId === saga.id
                    ? "bg-brand-red/15 text-white border border-brand-red/20"
                    : "text-gray-400 hover:text-white hover:bg-brand-surface"
                }`}
              >
                <span className="truncate block">{saga.name}</span>
                <span className="text-xs text-gray-500 mt-0.5 block">
                  {saga.part_count} {saga.part_count === 1 ? "película" : "películas"}
                </span>
              </button>
            ))}
          </div>

          {/* Saga detail */}
          <div className="flex-1 min-w-0">
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
                {/* Header */}
                <div className="flex items-start justify-between mb-4 gap-4">
                  <div>
                    <h2 className="text-lg font-bold text-white">{sagaDetail.name}</h2>
                    <p className="text-sm text-gray-400 mt-1">
                      {sagaDetail.parts.length} películas · {importedCount} importadas · {missingCount} pendientes
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => handleRefresh(false)}
                      disabled={refreshing}
                      className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border border-white/10 bg-white/5 text-gray-300 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-50"
                    >
                      {refreshing ? <Spinner /> : <RefreshIcon />}
                      Sincronizar
                    </button>
                    <button
                      onClick={() => handleRefresh(true)}
                      disabled={refreshing}
                      className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border border-green-700/50 bg-green-900/30 text-green-300 hover:bg-green-800/40 transition-colors disabled:opacity-50"
                    >
                      {refreshing ? <Spinner /> : <RefreshIcon />}
              Sincronizar e importar
                    </button>
                  </div>
                </div>

                {sagaDetail.overview && (
                  <p className="text-xs text-gray-500 mb-4 line-clamp-2">{sagaDetail.overview}</p>
                )}

                {/* Bulk import banner */}
                {missingCount > 0 && (
                  <div className="mb-4 flex items-center gap-3 p-3 rounded-lg bg-yellow-900/30 border border-yellow-700/50">
                    <p className="text-yellow-300 text-sm flex-1">
                      {missingCount} película{missingCount !== 1 ? "s" : ""} pendiente{missingCount !== 1 ? "s" : ""} de importar
                    </p>
                    <button
                      onClick={importAllMissing}
                      disabled={bulkImporting}
                      className="flex items-center gap-2 bg-yellow-600 hover:bg-yellow-500 disabled:opacity-50 text-white text-sm font-semibold py-2 px-4 rounded-lg transition-colors"
                    >
                      {bulkImporting ? <Spinner /> : <ImportIcon />}
                      Importar todo ({missingCount})
                    </button>
                  </div>
                )}

                {/* Imported count badge */}
                {missingCount === 0 && (
                  <div className="mb-4 flex items-center gap-2 p-3 rounded-lg bg-green-900/30 border border-green-700/50">
                    {checkIcon()}
                    <p className="text-green-300 text-sm">Todas las películas están importadas</p>
                  </div>
                )}

                {/* Parts grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
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
      )}
    </div>
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
    <div className={`rounded-lg overflow-hidden border transition-colors ${
      part.is_imported
        ? "border-green-800/40 bg-brand-surface"
        : "border-yellow-800/30 bg-brand-surface/80 opacity-85"
    }`}>
      {/* Poster */}
      <div className="aspect-[2/3] relative bg-brand-dark">
        {part.poster_url ? (
          <img
            src={part.poster_url}
            alt={part.title}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-gray-600 text-xs px-2 text-center">{part.title}</span>
          </div>
        )}

        {/* Status badge */}
        <div className={`absolute top-1.5 right-1.5 rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
          part.is_imported
            ? "bg-green-700/80 text-white"
            : "bg-yellow-700/80 text-white"
        }`}>
          {part.is_imported ? "Importada" : "Pendiente"}
        </div>

        {/* Vote */}
        {part.vote_average > 0 && (
          <div className="absolute top-1.5 left-1.5 bg-black/70 rounded-md px-1.5 py-0.5 flex items-center gap-0.5">
            <span className="text-brand-gold text-[10px]">★</span>
            <span className="text-white text-[10px] font-bold">{part.vote_average.toFixed(1)}</span>
          </div>
        )}

        {/* Action overlay on hover for non-imported */}
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

      {/* Info */}
      <div className="p-2.5">
        <p className="text-xs font-medium text-white truncate">{part.title}</p>
        <div className="flex items-center justify-between mt-1">
          {part.year && <span className="text-[10px] text-gray-500">{part.year}</span>}
          {part.is_imported && (
            <span className="text-[10px] text-green-400 font-medium">✓ Local</span>
          )}
        </div>
      </div>
    </div>
  );
}
