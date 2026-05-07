import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Helmet } from "react-helmet-async";
import { fetchSagaById, importByTmdbIds, type SagaDetail as SagaDetailType } from "@/lib/api";
import { getToken } from "@/lib/auth";

const FALLBACK_BG =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1280' height='720' viewBox='0 0 1280 720'%3E%3Crect width='1280' height='720' fill='%231a1a1a'/%3E%3C/svg%3E";

function PlayIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
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

function Spinner() {
  return <div className="w-5 h-5 rounded-full border-2 border-brand-red border-t-transparent animate-spin" />;
}

export default function SagaDetail() {
  const { id } = useParams<{ id: string }>();
  const sagaId = Number(id);
  const navigate = useNavigate();

  const [importingParts, setImportingParts] = useState<Set<number>>(new Set());
  const [bulkImporting, setBulkImporting] = useState(false);

  const {
    data: saga,
    isLoading,
    error,
    refetch,
  } = useQuery<SagaDetailType>({
    queryKey: ["saga", sagaId],
    queryFn: () => fetchSagaById(sagaId),
    enabled: !isNaN(sagaId),
    staleTime: 30 * 60 * 1000,
  });

  const hasAdminToken = !!getToken();

  const importPart = async (tmdbId: number) => {
    if (importingParts.has(tmdbId)) return;
    setImportingParts((prev) => new Set(prev).add(tmdbId));
    try {
      await importByTmdbIds([tmdbId], "movie");
      await refetch();
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

  const importAllMissing = async () => {
    if (!saga || bulkImporting) return;
    const missing = saga.parts.filter((p) => !p.is_imported);
    if (missing.length === 0) return;

    setBulkImporting(true);
    const tmdbIds = missing.map((p) => p.tmdb_id);
    // Import in batches of 5 to avoid overwhelming the API
    for (let i = 0; i < tmdbIds.length; i += 5) {
      const batch = tmdbIds.slice(i, i + 5);
      try {
        await importByTmdbIds(batch, "movie");
      } catch {
        // continue with next batch
      }
    }
    await refetch();
    setBulkImporting(false);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-brand-dark flex items-center justify-center pt-16">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 rounded-full border-2 border-brand-red border-t-transparent animate-spin" />
          <p className="text-gray-400 text-sm">Cargando saga...</p>
        </div>
      </div>
    );
  }

  if (error || !saga) {
    return (
      <div className="min-h-screen bg-brand-dark flex items-center justify-center pt-16">
        <div className="text-center">
          <p className="text-red-400 text-lg">No se pudo cargar la saga.</p>
          <Link to="/" className="mt-4 inline-block text-brand-red hover:text-red-400 underline">
            Volver al inicio
          </Link>
        </div>
      </div>
    );
  }

  const missingCount = saga.parts.filter((p) => !p.is_imported).length;
  const importedCount = saga.parts.length - missingCount;

  return (
    <div className="min-h-screen bg-brand-dark">
      <Helmet>
        <title>{saga.name} — Cine Gratín</title>
        <meta name="description" content={saga.overview?.slice(0, 160) ?? ""} />
        <meta property="og:title" content={`${saga.name} — Cine Gratín`} />
        <meta property="og:description" content={saga.overview?.slice(0, 200) ?? ""} />
        {saga.backdrop_path && <meta property="og:image" content={saga.backdrop_path} />}
      </Helmet>

      {/* Backdrop */}
      <div className="relative w-full h-[50vh] min-h-[320px] overflow-hidden">
        <img
          src={saga.backdrop_path || saga.poster_path || FALLBACK_BG}
          alt={saga.name}
          className="w-full h-full object-cover object-top"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).src = FALLBACK_BG;
          }}
        />
        <div className="absolute inset-0 hero-gradient" />
        <div className="absolute inset-x-0 bottom-0 h-40 hero-gradient-bottom" />
        <button
          onClick={() => navigate(-1)}
          className="absolute top-20 left-6 flex items-center gap-2 text-gray-300 hover:text-white text-sm transition-colors"
        >
          ← Volver
        </button>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 -mt-24 relative z-10 pb-16">
        <div className="flex flex-col sm:flex-row gap-8 mb-12">
          {/* Poster */}
          <div className="flex-shrink-0 w-36 sm:w-48 md:w-56">
            <img
              src={saga.poster_path || FALLBACK_BG}
              alt={saga.name}
              className="w-full aspect-[2/3] object-cover rounded-xl shadow-2xl border border-brand-border"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).src = FALLBACK_BG;
              }}
            />
          </div>

          {/* Info */}
          <div className="flex-1 pt-2 sm:pt-12">
            <h1 className="text-2xl sm:text-4xl font-black text-white mb-2 leading-tight">{saga.name}</h1>
            <p className="text-gray-400 text-sm mb-1">
              {saga.parts.length} {saga.parts.length === 1 ? "película" : "películas"}
              {importedCount > 0 && (
                <span className="text-green-400 ml-2">
                  · {importedCount} importada{importedCount !== 1 ? "s" : ""}
                </span>
              )}
              {missingCount > 0 && (
                <span className="text-yellow-400 ml-2">
                  · {missingCount} pendiente{missingCount !== 1 ? "s" : ""}
                </span>
              )}
            </p>
            {saga.overview && (
              <p className="text-gray-300 text-sm sm:text-base leading-relaxed max-w-2xl">{saga.overview}</p>
            )}

            {/* Bulk import banner */}
            {hasAdminToken && missingCount > 0 && (
              <div className="mt-4 flex flex-wrap items-center gap-3 p-3 rounded-lg bg-yellow-900/30 border border-yellow-700/50">
                <p className="text-yellow-300 text-sm flex-1">
                  {missingCount} película{missingCount !== 1 ? "s" : ""} no importada
                  {missingCount !== 1 ? "s" : ""}
                </p>
                <button
                  onClick={importAllMissing}
                  disabled={bulkImporting}
                  className="flex items-center gap-2 bg-yellow-600 hover:bg-yellow-500 disabled:opacity-50 text-white text-sm font-semibold py-2 px-4 rounded-lg transition-colors"
                >
                  {bulkImporting ? <Spinner /> : <ImportIcon />}
                  Importar {missingCount === 1 ? "todas" : "todo"}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Movies grid */}
        <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-3">
          <span className="w-2 h-7 bg-brand-red rounded-full" />
          Películas de la saga
        </h2>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {saga.parts.map((part) => {
            const isImporting = importingParts.has(part.tmdb_id);

            if (part.is_imported && part.local_id) {
              // Movie exists locally → link to local player page
              return (
                <Link key={part.id} to={`/pelicula/${part.local_id}`} className="group block">
                  <div className="relative overflow-hidden rounded-lg bg-brand-surface card-hover">
                    <div className="aspect-[2/3] w-full relative">
                      {part.poster_url ? (
                        <img
                          src={part.poster_url}
                          alt={part.title}
                          loading="lazy"
                          className="w-full h-full object-cover transition-opacity duration-300"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-brand-surface">
                          <span className="text-gray-500 text-xs px-2 text-center">{part.title}</span>
                        </div>
                      )}
                      {part.vote_average > 0 && (
                        <div className="absolute top-1.5 right-1.5 bg-black/70 backdrop-blur-sm rounded-md px-1.5 py-0.5 flex items-center gap-0.5">
                          <span className="text-brand-gold text-[10px] leading-none">★</span>
                          <span className="text-white text-[10px] font-bold leading-none">
                            {part.vote_average.toFixed(1)}
                          </span>
                        </div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-3">
                        <p className="text-white text-xs font-semibold line-clamp-2 leading-snug">
                          {part.title}
                        </p>
                        {part.year && <span className="text-gray-400 text-xs mt-0.5">{part.year}</span>}
                      </div>
                    </div>
                    {/* Play badge */}
                    <div className="absolute top-1.5 left-1.5 bg-brand-red/90 rounded-md px-1.5 py-0.5">
                      <span className="text-white text-[9px] font-bold flex items-center gap-0.5">
                        <PlayIcon /> Reproducir
                      </span>
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-gray-400 truncate px-0.5 group-hover:text-gray-200 transition-colors">
                    {part.title}
                  </p>
                  {part.year && <p className="text-[10px] text-gray-600 px-0.5">{part.year}</p>}
                </Link>
              );
            }

            // Movie not imported
            return (
              <div key={part.id} className="group block relative">
                <div className="relative overflow-hidden rounded-lg bg-brand-surface">
                  <div className="aspect-[2/3] w-full relative">
                    {part.poster_url ? (
                      <img
                        src={part.poster_url}
                        alt={part.title}
                        loading="lazy"
                        className="w-full h-full object-cover transition-opacity duration-300 opacity-50"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-brand-surface">
                        <span className="text-gray-500 text-xs px-2 text-center">{part.title}</span>
                      </div>
                    )}
                    {/* Gray overlay */}
                    <div className="absolute inset-0 bg-black/40" />

                    {part.vote_average > 0 && (
                      <div className="absolute top-1.5 right-1.5 bg-black/70 backdrop-blur-sm rounded-md px-1.5 py-0.5 flex items-center gap-0.5">
                        <span className="text-brand-gold text-[10px] leading-none">★</span>
                        <span className="text-white text-[10px] font-bold leading-none">
                          {part.vote_average.toFixed(1)}
                        </span>
                      </div>
                    )}

                    {/* Import button in the center */}
                    {hasAdminToken ? (
                      <button
                        onClick={() => importPart(part.tmdb_id)}
                        disabled={isImporting}
                        className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/30 hover:bg-black/50 transition-colors cursor-pointer"
                      >
                        {isImporting ? (
                          <Spinner />
                        ) : (
                          <>
                            <div className="w-10 h-10 rounded-full bg-brand-red flex items-center justify-center">
                              <ImportIcon />
                            </div>
                            <span className="text-white text-xs font-semibold">Importar</span>
                          </>
                        )}
                      </button>
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-gray-500 text-xs">No disponible</span>
                      </div>
                    )}
                  </div>
                </div>
                <p className="mt-2 text-xs text-gray-500 truncate px-0.5">{part.title}</p>
                {part.year && <p className="text-[10px] text-gray-600 px-0.5">{part.year}</p>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
