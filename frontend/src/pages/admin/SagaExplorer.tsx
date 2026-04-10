import { useState, useEffect, useCallback } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { searchTmdbCollections, importCollection, resetCollection, getActiveSagas, toggleSagaActive, type TmdbCollectionSearchItem } from "@/lib/api";
import { SAGA_SECTIONS } from "@/lib/homeConfig";
import { toast } from "sonner";

export default function SagaExplorer() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<TmdbCollectionSearchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState<Record<number, boolean>>({});
  const [importResults, setImportResults] = useState<Record<number, { imported: number; existed: number }>>({});
  const [activeSagas, setActiveSagas] = useState<number[]>([]);

  // Load active sagas on mount
  useEffect(() => {
    getActiveSagas().then(setActiveSagas).catch(console.error);
  }, []);

  // Debounce search
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await searchTmdbCollections(query);
        setResults(data);
      } catch (err) {
        console.error(err);
        toast.error("Error al buscar colecciones");
      } finally {
        setLoading(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [query]);

  const handleImport = async (id: number) => {
    setImporting(prev => ({ ...prev, [id]: true }));
    try {
      const res = await importCollection(id);
      setImportResults(prev => ({ ...prev, [id]: { imported: res.imported, existed: res.existed } }));
      toast.success(`Importada: ${res.collection}`);
    } catch (err: any) {
      toast.error(err.message || "Error al importar");
    } finally {
      setImporting(prev => ({ ...prev, [id]: false }));
    }
  };

  const handleReset = async (id: number) => {
    if (!confirm("¿Estás seguro de resetear esta saga? Se borrarán todas sus películas.")) return;
    try {
      const res = await resetCollection(id);
      toast.success(`Saga reseteada: ${res.total_deleted} items eliminados`);
    } catch (err: any) {
      toast.error(err.message || "Error al resetear");
    }
  };

  const isConfigured = (id: number) => SAGA_SECTIONS.some(s => s.collection_id === id);
  const isActive = (id: number) => activeSagas.includes(id);

  const handleToggleActive = async (id: number, currentActive: boolean) => {
    try {
      await toggleSagaActive(id, !currentActive);
      setActiveSagas(prev => 
        !currentActive ? [...prev, id] : prev.filter(sid => sid !== id)
      );
      toast.success(currentActive ? "Saga desactivada del Home" : "Saga activada en el Home");
    } catch (err: any) {
      toast.error("Error al cambiar estado de la saga");
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-8">
        <div className="space-y-2">
          <h1 className="text-2xl font-black text-white">Explorador de Sagas</h1>
          <p className="text-gray-500 text-sm">Busca colecciones en TMDB e impórtalas directamente a tu catálogo.</p>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar saga (ej: Marvel, Batman, Jurassic...)"
            className="w-full bg-brand-card border border-brand-border rounded-2xl px-6 py-4 text-white focus:outline-none focus:border-brand-red transition-colors"
          />
          {loading && (
            <div className="absolute right-6 top-1/2 -translate-y-1/2">
              <div className="w-5 h-5 border-2 border-brand-red border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>

        {/* Results Grid */}
        {results.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {results.map((item) => (
              <div key={item.id} className="bg-brand-card border border-brand-border rounded-2xl overflow-hidden flex flex-col group">
                <div className="aspect-[2/3] relative overflow-hidden bg-brand-surface">
                  {item.poster_path ? (
                    <img src={item.poster_path} alt={item.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-700">Sin poster</div>
                  )}
                  {isConfigured(item.id) && (
                    <div className="absolute top-2 right-2 bg-green-500 text-white text-[10px] font-bold px-2 py-1 rounded-full shadow-lg">
                      ✓ Configurada
                    </div>
                  )}
                </div>
                <div className="p-4 flex-1 flex flex-col gap-3">
                  <div className="flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-white font-bold text-sm line-clamp-2">{item.name}</h3>
                      <button 
                        onClick={() => handleToggleActive(item.id, isActive(item.id))}
                        className={`flex-shrink-0 w-8 h-4 rounded-full relative transition-colors ${isActive(item.id) ? 'bg-brand-red' : 'bg-gray-700'}`}
                        title={isActive(item.id) ? "Desactivar del Home" : "Activar en el Home"}
                      >
                        <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${isActive(item.id) ? 'left-4.5' : 'left-0.5'}`} />
                      </button>
                    </div>
                    <p className="text-gray-500 text-[10px] mt-1 font-mono">ID: {item.id}</p>
                  </div>

                  {importResults[item.id] ? (
                    <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-2 text-center">
                      <p className="text-green-400 text-[10px] font-bold">
                        +{importResults[item.id].imported} nuevos / {importResults[item.id].existed} ya existían
                      </p>
                    </div>
                  ) : (
                    <button
                      onClick={() => handleImport(item.id)}
                      disabled={importing[item.id]}
                      className="w-full bg-brand-surface border border-brand-border hover:border-brand-red/50 text-white text-xs font-bold py-2 rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {importing[item.id] ? (
                        <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      ) : (
                        "Importar"
                      )}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Configured Sagas */}
        <div className="space-y-4 pt-4">
          <h2 className="text-lg font-bold text-white">Sagas configuradas en Home</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {SAGA_SECTIONS.filter(s => s.collection_id).map((saga) => (
              <div key={saga.collection_id} className="bg-brand-card border border-brand-border rounded-2xl p-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <button 
                    onClick={() => handleToggleActive(saga.collection_id!, isActive(saga.collection_id!))}
                    className={`flex-shrink-0 w-10 h-5 rounded-full relative transition-colors ${isActive(saga.collection_id!) ? 'bg-brand-red' : 'bg-gray-700'}`}
                  >
                    <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${isActive(saga.collection_id!) ? 'left-5.5' : 'left-0.5'}`} />
                  </button>
                  <div>
                    <h4 className="text-white font-bold text-sm">{saga.label}</h4>
                    <p className="text-gray-500 text-xs font-mono">ID: {saga.collection_id}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleImport(saga.collection_id!)}
                    disabled={importing[saga.collection_id!]}
                    className="bg-brand-surface border border-brand-border hover:border-gray-500 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg transition-all"
                  >
                    Re-importar
                  </button>
                  <button
                    onClick={() => handleReset(saga.collection_id!)}
                    className="bg-red-900/20 border border-red-800/20 hover:bg-red-900/40 text-red-500 text-[10px] font-bold px-3 py-1.5 rounded-lg transition-all"
                  >
                    Reset
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
