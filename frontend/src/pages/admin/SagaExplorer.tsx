import { useState, useEffect, useCallback } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { 
  searchTmdbCollections, 
  importCollection, 
  resetCollection, 
  getActiveSagas, 
  toggleSagaActive, 
  getSagaMembers,
  manageSagaMember,
  searchMovies,
  searchSeries,
  type TmdbCollectionSearchItem,
  type SagaMember
} from "@/lib/api";
import { SAGA_SECTIONS } from "@/lib/homeConfig";
import { toast } from "sonner";

interface ManageModalProps {
  collectionId: number;
  collectionName: string;
  onClose: () => void;
}

function ManageModal({ collectionId, collectionName, onClose }: ManageModalProps) {
  const [members, setMembers] = useState<SagaMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SagaMember[]>([]);
  const [searching, setSearching] = useState(false);

  const loadMembers = useCallback(async () => {
    try {
      const data = await getSagaMembers(collectionId);
      setMembers(data);
    } catch (err) {
      toast.error("Error al cargar miembros de la saga");
    } finally {
      setLoading(false);
    }
  }, [collectionId]);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const [movies, series] = await Promise.all([
          searchMovies(searchQuery, 10),
          searchSeries(searchQuery, 10)
        ]);
        const combined: SagaMember[] = [
          ...movies.map(m => ({ id: m.id, title: m.title, poster_url: m.poster_url, year: m.year, type: "movie" as const })),
          ...series.map(s => ({ id: s.id, title: s.title, poster_url: s.poster_url, year: s.year, type: "series" as const }))
        ];
        setSearchResults(combined);
      } catch (err) {
        console.error(err);
      } finally {
        setSearching(false);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleAdd = async (item: SagaMember) => {
    try {
      await manageSagaMember({
        id: item.id,
        type: item.type,
        collection_id: collectionId,
        collection_name: collectionName,
        action: "add"
      });
      toast.success(`Añadido: ${item.title}`);
      loadMembers();
    } catch (err) {
      toast.error("Error al añadir a la saga");
    }
  };

  const handleRemove = async (item: SagaMember) => {
    try {
      await manageSagaMember({
        id: item.id,
        type: item.type,
        collection_id: null,
        collection_name: null,
        action: "remove"
      });
      toast.success(`Eliminado: ${item.title}`);
      loadMembers();
    } catch (err) {
      toast.error("Error al eliminar de la saga");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-brand-card border border-brand-border rounded-3xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
        <div className="p-6 border-b border-brand-border flex items-center justify-between">
          <div>
            <h2 className="text-xl font-black text-white">Gestionar Sagas: {collectionName}</h2>
            <p className="text-gray-500 text-xs mt-1">ID Colección: {collectionId}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl">✕</button>
        </div>

        <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
          {/* Left Column: Current Members */}
          <div className="flex-1 p-6 border-r border-brand-border overflow-y-auto">
            <h3 className="text-white font-bold mb-4 flex items-center gap-2">
              Miembros actuales <span className="bg-brand-red text-white text-[10px] px-2 py-0.5 rounded-full">{members.length}</span>
            </h3>
            {loading ? (
              <div className="flex justify-center py-10"><div className="w-8 h-8 border-4 border-brand-red border-t-transparent rounded-full animate-spin" /></div>
            ) : members.length === 0 ? (
              <p className="text-gray-500 text-center py-10 italic">No hay películas o series asignadas manualmente.</p>
            ) : (
              <div className="space-y-3">
                {members.map(item => (
                  <div key={`${item.type}-${item.id}`} className="flex items-center gap-3 bg-brand-surface p-2 rounded-xl border border-brand-border group">
                    <img src={item.poster_url} alt="" className="w-10 h-14 object-cover rounded-lg" />
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-bold truncate">{item.title}</p>
                      <p className="text-gray-500 text-[10px] uppercase font-bold">{item.type === 'movie' ? 'Película' : 'Serie'} • {item.year}</p>
                    </div>
                    <button 
                      onClick={() => handleRemove(item)}
                      className="w-8 h-8 flex items-center justify-center text-gray-500 hover:text-red-500 hover:bg-red-500/10 rounded-full transition-all"
                      title="Quitar de la saga"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right Column: Search & Add */}
          <div className="flex-1 p-6 overflow-y-auto bg-brand-dark/30">
            <h3 className="text-white font-bold mb-4">Añadir al catálogo</h3>
            <div className="relative mb-4">
              <input 
                type="text" 
                placeholder="Buscar en tu catálogo..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full bg-brand-surface border border-brand-border rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-brand-red transition-colors"
              />
              {searching && <div className="absolute right-3 top-2.5 w-4 h-4 border-2 border-brand-red border-t-transparent rounded-full animate-spin" />}
            </div>

            <div className="space-y-3">
              {searchResults.map(item => (
                <div key={`search-${item.type}-${item.id}`} className="flex items-center gap-3 bg-brand-surface p-2 rounded-xl border border-brand-border group">
                  <img src={item.poster_url} alt="" className="w-10 h-14 object-cover rounded-lg" />
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-bold truncate">{item.title}</p>
                    <p className="text-gray-500 text-[10px] uppercase font-bold">{item.type === 'movie' ? 'Película' : 'Serie'} • {item.year}</p>
                  </div>
                  <button 
                    onClick={() => handleAdd(item)}
                    className="w-8 h-8 flex items-center justify-center text-brand-red hover:bg-brand-red/10 rounded-full transition-all"
                    title="Añadir a la saga"
                  >
                    ＋
                  </button>
                </div>
              ))}
              {searchQuery && !searching && searchResults.length === 0 && (
                <p className="text-gray-500 text-center py-10 text-sm">No se encontraron resultados.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SagaExplorer() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<TmdbCollectionSearchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState<Record<number, boolean>>({});
  const [importResults, setImportResults] = useState<Record<number, { imported: number; existed: number }>>({});
  const [activeSagas, setActiveSagas] = useState<number[]>([]);
  const [manageSaga, setManageSaga] = useState<{ id: number; name: string } | null>(null);

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

                  <div className="flex flex-col gap-2">
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
                    <button
                      onClick={() => setManageSaga({ id: item.id, name: item.name })}
                      className="w-full bg-brand-dark/50 border border-brand-border hover:border-gray-500 text-gray-400 hover:text-white text-[10px] font-bold py-1.5 rounded-lg transition-all"
                    >
                      Gestionar películas
                    </button>
                  </div>
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
                    onClick={() => setManageSaga({ id: saga.collection_id!, name: saga.label })}
                    className="bg-brand-surface border border-brand-border hover:border-gray-500 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg transition-all"
                  >
                    Gestionar
                  </button>
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

      {manageSaga && (
        <ManageModal 
          collectionId={manageSaga.id} 
          collectionName={manageSaga.name} 
          onClose={() => setManageSaga(null)} 
        />
      )}
    </AdminLayout>
  );
}
