/**
 * SagaManager.tsx — Gestión unificada de sagas
 *
 * Fusiona las 3 pantallas anteriores:
 *   • ManageSagas   → asignación manual, sync SSE, importar/reset por saga
 *   • SagaExplorer  → búsqueda en TMDB, toggle activo en Home
 *   • Import.tsx    → CollectionImportSection (scan-collections-stream)
 *
 * Tabs:
 *   [Sagas configuradas]  → lista de SAGA_SECTIONS + toggle Home + acciones TMDB
 *   [Explorar TMDB]       → búsqueda libre de colecciones en TMDB
 *   [Sincronizar BD]      → scan-collections-stream + sync-all-collections-stream
 *
 * Bugs corregidos respecto a las pantallas originales:
 *   1. "Sincronizar Sagas" ya llama a handleScanCollections (no era vacío).
 *   2. Al terminar cualquier operación se invalida el caché de React Query.
 *   3. El toggle de Home filtra también las sagas estáticas (no solo las dinámicas).
 */

import React, { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import AdminLayout from "@/components/admin/AdminLayout";
import {
  getMovies,
  getSeries,
  updateCollection,
  importCollection,
  resetCollection,
  getActiveSagas,
  toggleSagaActive,
  getSagaMembers,
  manageSagaMember,
  searchTmdbCollections,
  searchMovies,
  searchSeries,
  type TmdbCollectionSearchItem,
  type SagaMember,
} from "@/lib/api";
import { getToken } from "@/lib/auth";
import { SAGA_SECTIONS } from "@/lib/homeConfig";
import type { Movie, Series } from "@/lib/types";

// ── Constants ─────────────────────────────────────────────────────────────────

const BASE_URL =
  (import.meta.env["VITE_API_URL"] as string | undefined) ||
  "https://cine-gratin.onrender.com";

// ── Types ─────────────────────────────────────────────────────────────────────

type Tab = "configured" | "explore" | "sync";
type MediaItem = (Movie | Series) & { _type: "movie" | "series" };
type SyncMode = "idle" | "importing" | "resetting" | "syncing" | "syncing-all" | "syncing-db";

interface SyncProgress {
  done: number;
  total: number;
  lastTitle: string;
  updated: number;
  errors: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizeStr(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchesKeywords(title: string, keywords: string[]): boolean {
  const n = normalizeStr(title);
  return keywords.some((k) => {
    const nk = normalizeStr(k);
    if (nk.includes(" ")) return n.includes(nk);
    return new RegExp(`(?:^|\\s)${nk}(?:\\s|$)`).test(n);
  });
}

function openSSE(
  url: string,
  onProgress: (data: Record<string, unknown>) => void,
  onDone: (data: Record<string, unknown>) => void,
  onError: (msg: string) => void
): () => void {
  const token = getToken();
  const fullUrl = token ? `${url}${url.includes("?") ? "&" : "?"}token=${token}` : url;
  const es = new EventSource(`${BASE_URL}${fullUrl}`);

  es.addEventListener("progress", (e) => {
    try { onProgress(JSON.parse((e as MessageEvent).data)); } catch { /* ignore */ }
  });
  es.addEventListener("done", (e) => {
    es.close();
    try { onDone(JSON.parse((e as MessageEvent).data)); } catch { onDone({}); }
  });
  es.addEventListener("error", (e) => {
    es.close();
    try {
      onError(JSON.parse((e as MessageEvent & { data?: string }).data ?? "{}").message ?? "Error desconocido");
    } catch { onError("Error en stream"); }
  });
  es.onerror = () => { es.close(); onError("Conexión SSE perdida"); };
  return () => es.close();
}

// ── Sub-components ────────────────────────────────────────────────────────────

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all border ${
        active
          ? "bg-brand-red border-brand-red text-white shadow-lg"
          : "bg-brand-surface border-brand-border text-gray-400 hover:text-white hover:border-gray-600"
      }`}
    >
      {children}
    </button>
  );
}

function ProgressBar({ progress, mode }: { progress: SyncProgress; mode: SyncMode }) {
  if (!progress || progress.total === 0) return null;
  const pct = Math.round((progress.done / progress.total) * 100);
  const label =
    mode === "importing" ? "Importando…" :
    mode === "resetting" ? "Reseteando…" :
    mode === "syncing-db" ? "Reparando BD…" :
    "Sincronizando…";

  return (
    <div className="bg-brand-card border border-brand-border rounded-xl p-4 space-y-2">
      <div className="flex items-center justify-between text-xs text-gray-400">
        <span className="font-bold text-white animate-pulse">{label}</span>
        <span>{progress.done}/{progress.total} ({pct}%)</span>
      </div>
      <div className="w-full bg-brand-surface rounded-full h-2 overflow-hidden">
        <div
          className="h-full bg-brand-red rounded-full transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex gap-4 text-xs text-gray-500">
        {progress.lastTitle && <span className="truncate flex-1">{progress.lastTitle}</span>}
        <span className="text-green-500 shrink-0">{progress.updated} actualizadas</span>
        {progress.errors > 0 && <span className="text-red-500 shrink-0">{progress.errors} errores</span>}
      </div>
    </div>
  );
}

function LogPanel({ log, logEndRef }: { log: string[]; logEndRef: React.RefObject<HTMLDivElement> }) {
  if (log.length === 0) return null;
  return (
    <div className="bg-brand-dark border border-brand-border rounded-xl p-3 max-h-48 overflow-y-auto font-mono text-[11px] leading-relaxed text-gray-400 space-y-0.5">
      {log.map((line, i) => (
        <div
          key={i}
          className={
            line.startsWith("✅") ? "text-green-400" :
            line.startsWith("❌") ? "text-red-400" :
            line.startsWith("⛔") ? "text-yellow-400" :
            line.startsWith("🗑") ? "text-orange-400" : ""
          }
        >
          {line}
        </div>
      ))}
      <div ref={logEndRef} />
    </div>
  );
}

function ItemRow({
  item, saving, actions, compact = false,
}: {
  item: MediaItem;
  saving: boolean;
  actions: { label: string; color: "red" | "green" | "yellow"; onClick: () => void }[];
  compact?: boolean;
}) {
  const colorMap = {
    red: "text-red-400 hover:text-red-300",
    green: "text-green-400 hover:text-green-300",
    yellow: "text-yellow-400 hover:text-yellow-300",
  };
  return (
    <div className={`flex items-center gap-3 ${compact ? "py-1" : "py-2"} border-b border-brand-border/30 last:border-0`}>
      {!compact && item.poster_url && (
        <img src={item.poster_url} alt="" className="w-8 h-12 object-cover rounded flex-shrink-0 opacity-80" />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-white text-sm font-medium truncate">{item.title}</p>
        <p className="text-gray-500 text-[10px] uppercase">
          {item._type === "movie" ? "Película" : "Serie"} · {item.year}
          {item.collection_id ? ` · col:${item.collection_id}` : ""}
        </p>
      </div>
      {saving ? (
        <span className="w-4 h-4 border-2 border-brand-red border-t-transparent rounded-full animate-spin flex-shrink-0" />
      ) : (
        <div className="flex gap-3 flex-shrink-0">
          {actions.map((a) => (
            <button
              key={a.label}
              onClick={a.onClick}
              className={`text-[11px] font-bold ${colorMap[a.color]} transition-colors`}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Modal: gestionar miembros de una saga ─────────────────────────────────────

function ManageModal({
  collectionId,
  collectionName,
  onClose,
}: {
  collectionId: number;
  collectionName: string;
  onClose: () => void;
}) {
  const [members, setMembers] = useState<SagaMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SagaMember[]>([]);
  const [searching, setSearching] = useState(false);

  const loadMembers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getSagaMembers(collectionId);
      setMembers(data);
    } catch { toast.error("Error al cargar miembros"); }
    finally { setLoading(false); }
  }, [collectionId]);

  useEffect(() => { loadMembers(); }, [loadMembers]);

  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults([]); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const [movies, series] = await Promise.all([
          searchMovies(searchQuery, 10),
          searchSeries(searchQuery, 10),
        ]);
        setSearchResults([
          ...movies.map(m => ({ id: m.id, title: m.title, poster_url: m.poster_url, year: m.year, type: "movie" as const })),
          ...series.map(s => ({ id: s.id, title: s.title, poster_url: s.poster_url, year: s.year, type: "series" as const })),
        ]);
      } catch { /* ignore */ }
      finally { setSearching(false); }
    }, 500);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const handleAdd = async (item: SagaMember) => {
    try {
      await manageSagaMember({ id: item.id, type: item.type, collection_id: collectionId, collection_name: collectionName, action: "add" });
      toast.success(`Añadido: ${item.title}`);
      loadMembers();
    } catch { toast.error("Error al añadir"); }
  };

  const handleRemove = async (item: SagaMember) => {
    try {
      await manageSagaMember({ id: item.id, type: item.type, collection_id: null, collection_name: null, action: "remove" });
      toast.success(`Eliminado: ${item.title}`);
      loadMembers();
    } catch { toast.error("Error al eliminar"); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-brand-card border border-brand-border rounded-3xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
        <div className="p-5 border-b border-brand-border flex items-center justify-between">
          <div>
            <h2 className="text-lg font-black text-white">Miembros: {collectionName}</h2>
            <p className="text-gray-500 text-xs mt-0.5">ID colección TMDB: {collectionId}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl w-8 h-8 flex items-center justify-center">✕</button>
        </div>
        <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
          {/* Miembros actuales */}
          <div className="flex-1 p-5 border-r border-brand-border overflow-y-auto">
            <h3 className="text-white font-bold mb-3 flex items-center gap-2 text-sm">
              Asignados
              <span className="bg-brand-red text-white text-[10px] px-2 py-0.5 rounded-full">{members.length}</span>
            </h3>
            {loading ? (
              <div className="flex justify-center py-8"><div className="w-7 h-7 border-3 border-brand-red border-t-transparent rounded-full animate-spin" /></div>
            ) : members.length === 0 ? (
              <p className="text-gray-500 text-sm text-center py-8 italic">Sin miembros asignados.</p>
            ) : (
              <div className="space-y-2">
                {members.map(item => (
                  <div key={`${item.type}-${item.id}`} className="flex items-center gap-3 bg-brand-surface p-2 rounded-xl border border-brand-border">
                    {item.poster_url && <img src={item.poster_url} alt="" className="w-9 h-13 object-cover rounded-lg flex-shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-bold truncate">{item.title}</p>
                      <p className="text-gray-500 text-[10px] uppercase">{item.type === "movie" ? "Película" : "Serie"} · {item.year}</p>
                    </div>
                    <button onClick={() => handleRemove(item)} className="w-7 h-7 flex items-center justify-center text-gray-500 hover:text-red-500 hover:bg-red-500/10 rounded-full transition-all">✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>
          {/* Buscar & añadir */}
          <div className="flex-1 p-5 overflow-y-auto bg-brand-dark/30">
            <h3 className="text-white font-bold mb-3 text-sm">Añadir desde catálogo</h3>
            <div className="relative mb-3">
              <input
                type="text"
                placeholder="Buscar en tu catálogo…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full bg-brand-surface border border-brand-border rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-brand-red transition-colors"
              />
              {searching && <div className="absolute right-3 top-2.5 w-4 h-4 border-2 border-brand-red border-t-transparent rounded-full animate-spin" />}
            </div>
            <div className="space-y-2">
              {searchResults.map(item => (
                <div key={`s-${item.type}-${item.id}`} className="flex items-center gap-3 bg-brand-surface p-2 rounded-xl border border-brand-border">
                  {item.poster_url && <img src={item.poster_url} alt="" className="w-9 h-13 object-cover rounded-lg flex-shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-bold truncate">{item.title}</p>
                    <p className="text-gray-500 text-[10px] uppercase">{item.type === "movie" ? "Película" : "Serie"} · {item.year}</p>
                  </div>
                  <button onClick={() => handleAdd(item)} className="w-7 h-7 flex items-center justify-center text-brand-red hover:bg-brand-red/10 rounded-full text-lg transition-all">＋</button>
                </div>
              ))}
              {searchQuery && !searching && searchResults.length === 0 && (
                <p className="text-gray-500 text-center py-8 text-sm">Sin resultados.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Tab 1: Sagas configuradas ─────────────────────────────────────────────────

function ConfiguredSagasTab() {
  const qc = useQueryClient();

  const { data: movies = [], isLoading: loadingMovies } = useQuery({
    queryKey: ["movies-all"],
    queryFn: () => getMovies({ limit: 10000 }),
    staleTime: 2 * 60 * 1000,
  });
  const { data: series = [], isLoading: loadingSeries } = useQuery({
    queryKey: ["series-all"],
    queryFn: () => getSeries({ limit: 10000 }),
    staleTime: 2 * 60 * 1000,
  });
  const [activeSagas, setActiveSagas] = useState<number[]>([]);

  useEffect(() => {
    getActiveSagas().then(setActiveSagas).catch(console.error);
  }, []);

  const [selectedId, setSelectedId] = useState(SAGA_SECTIONS[0]?.id ?? "");
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [syncMode, setSyncMode] = useState<SyncMode>("idle");
  const [progress, setProgress] = useState<SyncProgress | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [manageSaga, setManageSaga] = useState<{ id: number; name: string } | null>(null);
  const cancelRef = useRef<(() => void) | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  const allItems: MediaItem[] = useMemo(() => [
    ...(movies as Movie[]).map(m => ({ ...m, _type: "movie" as const })),
    ...(series as Series[]).map(s => ({ ...s, _type: "series" as const })),
  ], [movies, series]);

  const saga = SAGA_SECTIONS.find(s => s.id === selectedId)!;

  const { assigned, keywordOnly, searchResults } = useMemo(() => {
    if (!saga) return { assigned: [], keywordOnly: [], searchResults: [] };
    const assigned: MediaItem[] = [];
    const keywordOnly: MediaItem[] = [];
    for (const item of allItems) {
      if (item.collection_id === -1) continue;
      if (saga.collection_id && item.collection_id === saga.collection_id) {
        assigned.push(item);
      } else if (item.collection_id == null && matchesKeywords(item.title, saga.keywords)) {
        keywordOnly.push(item);
      }
    }
    assigned.sort((a, b) => (a.year ?? 0) - (b.year ?? 0));
    keywordOnly.sort((a, b) => (a.year ?? 0) - (b.year ?? 0));
    const sq = search.trim().toLowerCase();
    const searchResults = sq
      ? allItems.filter(item =>
          item.title.toLowerCase().includes(sq) &&
          !assigned.some(a => a.id === item.id) &&
          !keywordOnly.some(k => k.id === item.id)
        )
      : [];
    return { assigned, keywordOnly, searchResults };
  }, [allItems, saga, search]);

  const refreshAll = useCallback(async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["movies-all"] }),
      qc.invalidateQueries({ queryKey: ["series-all"] }),
      qc.invalidateQueries({ queryKey: ["movies"] }),
      qc.invalidateQueries({ queryKey: ["series"] }),
    ]);
  }, [qc]);

  const doUpdate = async (items: MediaItem[], collectionId: number | null, collectionName: string | null) => {
    const ids = new Set(items.map(i => String(i.id)));
    setSavingIds(ids);
    try {
      await updateCollection(items.map(item => ({
        id: String(item.id), type: item._type,
        collection_id: collectionId, collection_name: collectionName,
      })));
      await refreshAll();
      toast.success(collectionId === -1 ? "Excluido de sagas" : collectionId ? "Asignado a saga" : "Quitado de saga");
    } catch { toast.error("Error al actualizar"); }
    finally { setSavingIds(new Set()); }
  };

  const removeFromSaga = (item: MediaItem) => doUpdate([item], null, null);
  const excludeFromSagas = (item: MediaItem) => doUpdate([item], -1, null);
  const assignToSaga = (item: MediaItem) => doUpdate([item], saga.collection_id ?? null, saga.label);
  const assignAllKeyword = () => doUpdate(keywordOnly, saga.collection_id ?? null, saga.label);

  const handleImport = async () => {
    if (!saga.collection_id) { toast.error("Sin collection_id configurado."); return; }
    setSyncMode("importing");
    setLog([`▶ Importando colección ${saga.collection_id} — ${saga.label}…`]);
    try {
      const result = await importCollection(saga.collection_id);
      setLog(l => [...l,
        `✅ Importadas: ${result.imported} | Ya existían: ${result.existed} | Total TMDB: ${result.total}`,
        ...(result.titles?.length > 0 ? [`   Nuevas: ${result.titles.join(", ")}`] : []),
      ]);
      toast.success(`Importación completa: ${result.imported} nuevas`);
      await refreshAll();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setLog(l => [...l, `❌ Error: ${msg}`]);
      toast.error(msg);
    } finally { setSyncMode("idle"); }
  };

  const handleReset = async () => {
    if (!saga.collection_id) { toast.error("Sin collection_id configurado."); return; }
    if (!window.confirm(`¿Eliminar TODO de "${saga.label}" y re-importar desde TMDB?\n\nEsta acción no se puede deshacer.`)) return;
    setSyncMode("resetting");
    setLog([`🗑 Eliminando entradas de colección ${saga.collection_id}…`]);
    try {
      const del = await resetCollection(saga.collection_id);
      setLog(l => [...l,
        `   Eliminadas: ${del.deleted_movies} películas, ${del.deleted_series} series`,
        `▶ Re-importando desde TMDB…`,
      ]);
      const result = await importCollection(saga.collection_id);
      setLog(l => [...l, `✅ Importadas: ${result.imported} | Total TMDB: ${result.total}`]);
      toast.success(`Reset completo. ${result.imported} importadas.`);
      await refreshAll();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setLog(l => [...l, `❌ Error: ${msg}`]);
      toast.error(msg);
    } finally { setSyncMode("idle"); }
  };

  const handleSyncSaga = () => {
    if (!saga.collection_id) { toast.error("Sin collection_id configurado."); return; }
    setSyncMode("syncing");
    setProgress({ done: 0, total: 0, lastTitle: "", updated: 0, errors: 0 });
    setLog([`🔄 Sincronizando "${saga.label}"…`]);
    cancelRef.current = openSSE(
      `/api/admin/scan-collections-stream?ids=${saga.collection_id}`,
      (data) => {
        setProgress({ done: Number(data.i ?? 0), total: Number(data.total ?? 0), lastTitle: String(data.collection ?? ""), updated: Number(data.updated ?? 0), errors: Number(data.error ?? 0) });
        setLog(l => { const line = `[${data.i}/${data.total}] ${data.collection ?? ""} — ${data.status ?? ""}`; return l.length > 200 ? [...l.slice(-150), line] : [...l, line]; });
        setTimeout(() => logEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
      },
      async (data) => {
        setLog(l => [...l, `✅ Sync completo — ${data.updated ?? 0} actualizadas, ${data.error ?? 0} errores`]);
        setSyncMode("idle");
        toast.success("Sincronización completa");
        await refreshAll();
      },
      (msg) => { setLog(l => [...l, `❌ Error SSE: ${msg}`]); setSyncMode("idle"); toast.error(msg); }
    );
  };

  const handleCancel = () => {
    cancelRef.current?.();
    cancelRef.current = null;
    setSyncMode("idle");
    setLog(l => [...l, "⛔ Cancelado"]);
    toast.info("Operación cancelada");
  };

  const handleToggleActive = async (id: number) => {
    const current = activeSagas.includes(id);
    try {
      await toggleSagaActive(id, !current);
      setActiveSagas(prev => !current ? [...prev, id] : prev.filter(sid => sid !== id));
      // BUG FIX #3: invalidar queries para que Home se refresque
      await refreshAll();
      toast.success(current ? "Saga desactivada del Home" : "Saga activada en el Home");
    } catch { toast.error("Error al cambiar estado"); }
  };

  const isBusy = syncMode !== "idle";
  const isLoading = loadingMovies || loadingSeries;

  return (
    <div className="space-y-6">
      {isLoading && <div className="text-center text-gray-500 text-sm py-6 animate-pulse">Cargando catálogo…</div>}

      {/* Saga selector pills */}
      <div className="flex flex-wrap gap-2">
        {SAGA_SECTIONS.map(sec => {
          const count = allItems.filter(i => i.collection_id === sec.collection_id && i.collection_id != null).length;
          const isActive = sec.collection_id ? activeSagas.includes(sec.collection_id) : false;
          return (
            <button
              key={sec.id}
              onClick={() => { setSelectedId(sec.id); setSearch(""); setLog([]); setProgress(null); }}
              className={`px-3 py-1.5 rounded-full text-xs font-bold transition-colors border relative ${
                selectedId === sec.id
                  ? "bg-brand-red border-brand-red text-white"
                  : "bg-brand-surface border-brand-border text-gray-400 hover:text-white"
              }`}
            >
              {sec.label}
              {count > 0 && <span className="ml-1.5 text-[10px] opacity-70">({count})</span>}
              {/* dot indicador: activo en Home */}
              {sec.collection_id && (
                <span className={`absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full border border-brand-dark ${isActive ? "bg-green-400" : "bg-gray-600"}`} />
              )}
            </button>
          );
        })}
      </div>
      <p className="text-[10px] text-gray-600 -mt-2">Punto verde = visible en el Home.</p>

      {saga && (
        <>
          {/* Saga info + acciones */}
          <div className="bg-brand-card border border-brand-border rounded-xl p-5 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-white">{saga.label}</h2>
                {saga.collection_id ? (
                  <a href={`https://www.themoviedb.org/collection/${saga.collection_id}`} target="_blank" rel="noreferrer"
                    className="text-xs text-brand-gold font-mono hover:underline">
                    TMDB #{saga.collection_id}
                  </a>
                ) : (
                  <span className="text-xs text-yellow-600">⚠ Sin collection_id — solo keywords</span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-green-400 font-bold text-sm">{assigned.length} asignadas</span>
                {keywordOnly.length > 0 && <span className="text-yellow-400 font-bold text-sm">{keywordOnly.length} sin asignar</span>}

                {/* Toggle Home — BUG FIX #3 */}
                {saga.collection_id && (
                  <button
                    onClick={() => handleToggleActive(saga.collection_id!)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                      activeSagas.includes(saga.collection_id)
                        ? "bg-green-900/30 border-green-700/50 text-green-400 hover:bg-green-900/50"
                        : "bg-brand-surface border-brand-border text-gray-500 hover:text-white"
                    }`}
                    title="Activa o desactiva esta saga en el Home"
                  >
                    <span className={`w-2 h-2 rounded-full ${activeSagas.includes(saga.collection_id) ? "bg-green-400" : "bg-gray-600"}`} />
                    {activeSagas.includes(saga.collection_id) ? "Visible en Home" : "Oculta en Home"}
                  </button>
                )}

                {/* Gestionar miembros */}
                {saga.collection_id && (
                  <button
                    onClick={() => setManageSaga({ id: saga.collection_id!, name: saga.label })}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold bg-brand-surface border border-brand-border text-gray-300 hover:text-white hover:border-gray-600 transition-all"
                  >
                    Gestionar miembros
                  </button>
                )}
              </div>
            </div>

            {/* Acciones TMDB */}
            {saga.collection_id && (
              <div className="flex flex-wrap gap-2 pt-3 border-t border-brand-border/40">
                <button onClick={handleImport} disabled={isBusy}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold bg-green-900/40 border border-green-700/50 text-green-400 hover:text-green-300 hover:border-green-500 transition-colors disabled:opacity-40">
                  ⬇ Importar desde TMDB
                </button>
                <button onClick={handleSyncSaga} disabled={isBusy}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-900/40 border border-blue-700/50 text-blue-400 hover:text-blue-300 hover:border-blue-500 transition-colors disabled:opacity-40">
                  🔄 Sincronizar collection_ids
                </button>
                <button onClick={handleReset} disabled={isBusy}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold bg-red-900/40 border border-red-700/50 text-red-400 hover:text-red-300 hover:border-red-600 transition-colors disabled:opacity-40">
                  🗑 Reset + Re-importar
                </button>
                {isBusy && (
                  <button onClick={handleCancel}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold bg-brand-surface border border-brand-border text-gray-400 hover:text-white transition-colors">
                    ⛔ Cancelar
                  </button>
                )}
              </div>
            )}
            {saga.collection_id && !isBusy && (
              <p className="text-[11px] text-gray-600 leading-relaxed">
                <span className="text-green-600">Importar:</span> descarga las películas que faltan. ·{" "}
                <span className="text-blue-600">Sincronizar:</span> repara el campo <code>collection_id</code> en películas ya existentes. ·{" "}
                <span className="text-red-600">Reset:</span> elimina todo y vuelve a importar desde cero.
              </p>
            )}
          </div>

          {/* Progress + log */}
          {isBusy && progress && <ProgressBar progress={progress} mode={syncMode} />}
          <LogPanel log={log} logEndRef={logEndRef} />

          {/* Asignados */}
          <div className="bg-brand-card border border-green-800/40 rounded-xl p-4 space-y-2">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              <h3 className="text-sm font-bold text-white">Títulos en saga — visibles en el Home ({assigned.length})</h3>
            </div>
            {assigned.length === 0 ? (
              <p className="text-xs text-gray-500">Ningún título tiene este collection_id asignado aún.</p>
            ) : (
              assigned.map(item => (
                <ItemRow key={item.id} item={item} saving={savingIds.has(String(item.id))}
                  actions={[
                    { label: "Quitar", color: "red", onClick: () => removeFromSaga(item) },
                    { label: "Excluir de sagas", color: "yellow", onClick: () => excludeFromSagas(item) },
                  ]}
                />
              ))
            )}
          </div>

          {/* Candidatos por keyword */}
          {keywordOnly.length > 0 && (
            <div className="bg-brand-card border border-yellow-800/40 rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-yellow-500" />
                  <h3 className="text-sm font-bold text-white">Candidatos por título — pendientes ({keywordOnly.length})</h3>
                </div>
                {saga.collection_id && (
                  <button onClick={assignAllKeyword} disabled={savingIds.size > 0 || isBusy}
                    className="text-xs font-bold text-brand-gold hover:text-yellow-300 transition-colors disabled:opacity-50">
                    Asignar todos →
                  </button>
                )}
              </div>
              <p className="text-xs text-yellow-500/80 mb-2">
                {saga.collection_id
                  ? "Coinciden por nombre pero sin collection_id — NO aparecen en el Home hasta asignarlos."
                  : "Coinciden por palabras clave. Aparecen en el Home, pero puedes excluirlos."}
              </p>
              {keywordOnly.map(item => (
                <ItemRow key={item.id} item={item} saving={savingIds.has(String(item.id))}
                  actions={[
                    ...(saga.collection_id ? [{ label: "Asignar", color: "green" as const, onClick: () => assignToSaga(item) }] : []),
                    { label: "Excluir", color: "yellow", onClick: () => excludeFromSagas(item) },
                  ]}
                />
              ))}
            </div>
          )}

          {/* Buscar & añadir manualmente */}
          <div className="bg-brand-card border border-brand-border rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-bold text-white">Buscar y agregar manualmente</h3>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar película o serie…"
              className="w-full bg-brand-dark border border-brand-border rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-brand-red"
            />
            {searchResults.length > 0 && (
              <div className="space-y-1 max-h-64 overflow-y-auto">
                {searchResults.slice(0, 30).map(item => (
                  <ItemRow key={item.id} item={item} saving={savingIds.has(String(item.id))} compact
                    actions={[
                      ...(saga.collection_id ? [{ label: "Agregar", color: "green" as const, onClick: () => assignToSaga(item) }] : []),
                      { label: "Excluir", color: "yellow", onClick: () => excludeFromSagas(item) },
                    ]}
                  />
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {manageSaga && (
        <ManageModal
          collectionId={manageSaga.id}
          collectionName={manageSaga.name}
          onClose={() => setManageSaga(null)}
        />
      )}
    </div>
  );
}

// ── Tab 2: Explorar TMDB ──────────────────────────────────────────────────────

function ExploreTab() {
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<TmdbCollectionSearchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState<Record<number, boolean>>({});
  const [importResults, setImportResults] = useState<Record<number, { imported: number; existed: number }>>({});
  const [activeSagas, setActiveSagas] = useState<number[]>([]);
  const [manageSaga, setManageSaga] = useState<{ id: number; name: string } | null>(null);

  useEffect(() => {
    getActiveSagas().then(setActiveSagas).catch(console.error);
  }, []);

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        setResults(await searchTmdbCollections(query));
      } catch { toast.error("Error al buscar colecciones"); }
      finally { setLoading(false); }
    }, 500);
    return () => clearTimeout(t);
  }, [query]);

  const refreshAll = useCallback(async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["movies-all"] }),
      qc.invalidateQueries({ queryKey: ["series-all"] }),
      qc.invalidateQueries({ queryKey: ["movies"] }),
      qc.invalidateQueries({ queryKey: ["series"] }),
    ]);
  }, [qc]);

  const handleImport = async (id: number) => {
    setImporting(p => ({ ...p, [id]: true }));
    try {
      const res = await importCollection(id);
      setImportResults(p => ({ ...p, [id]: { imported: res.imported, existed: res.existed } }));
      toast.success(`Importada: ${res.collection}`);
      // BUG FIX #2: invalidar caché tras importar
      await refreshAll();
    } catch (e: any) { toast.error(e.message || "Error al importar"); }
    finally { setImporting(p => ({ ...p, [id]: false })); }
  };

  const handleReset = async (id: number) => {
    if (!confirm("¿Resetear esta saga? Se borrarán todas sus películas.")) return;
    try {
      const res = await resetCollection(id);
      toast.success(`Reseteada: ${res.total_deleted} items eliminados`);
      await refreshAll();
    } catch (e: any) { toast.error(e.message || "Error al resetear"); }
  };

  const handleToggle = async (id: number) => {
    const current = activeSagas.includes(id);
    try {
      await toggleSagaActive(id, !current);
      setActiveSagas(prev => !current ? [...prev, id] : prev.filter(s => s !== id));
      await refreshAll();
      toast.success(current ? "Saga desactivada del Home" : "Saga activada en el Home");
    } catch { toast.error("Error al cambiar estado"); }
  };

  const isConfigured = (id: number) => SAGA_SECTIONS.some(s => s.collection_id === id);
  const isActive = (id: number) => activeSagas.includes(id);

  return (
    <div className="space-y-6">
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Buscar saga en TMDB (ej: Marvel, Batman, Jurassic…)"
          className="w-full bg-brand-card border border-brand-border rounded-2xl px-6 py-4 text-white focus:outline-none focus:border-brand-red transition-colors"
        />
        {loading && (
          <div className="absolute right-5 top-1/2 -translate-y-1/2">
            <div className="w-5 h-5 border-2 border-brand-red border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>

      {results.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {results.map(item => (
            <div key={item.id} className="bg-brand-card border border-brand-border rounded-2xl overflow-hidden flex flex-col group">
              <div className="aspect-[2/3] relative overflow-hidden bg-brand-surface">
                {item.poster_path ? (
                  <img src={item.poster_path} alt={item.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-700 text-xs">Sin poster</div>
                )}
                {isConfigured(item.id) && (
                  <div className="absolute top-2 left-2 bg-green-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">✓ Configurada</div>
                )}
              </div>
              <div className="p-3 flex-1 flex flex-col gap-2">
                <div className="flex items-start justify-between gap-1">
                  <h3 className="text-white font-bold text-sm line-clamp-2 flex-1">{item.name}</h3>
                  {/* Toggle Home */}
                  <button
                    onClick={() => handleToggle(item.id)}
                    className={`flex-shrink-0 w-8 h-4 rounded-full relative transition-colors mt-0.5 ${isActive(item.id) ? "bg-brand-red" : "bg-gray-700"}`}
                    title={isActive(item.id) ? "Desactivar del Home" : "Activar en el Home"}
                  >
                    <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${isActive(item.id) ? "left-[18px]" : "left-0.5"}`} />
                  </button>
                </div>
                <p className="text-gray-500 text-[10px] font-mono">ID: {item.id}</p>
                <div className="flex flex-col gap-1.5 mt-auto">
                  {importResults[item.id] ? (
                    <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-2 text-center">
                      <p className="text-green-400 text-[10px] font-bold">+{importResults[item.id].imported} nuevos / {importResults[item.id].existed} ya existían</p>
                    </div>
                  ) : (
                    <button onClick={() => handleImport(item.id)} disabled={importing[item.id]}
                      className="w-full bg-brand-surface border border-brand-border hover:border-brand-red/50 text-white text-xs font-bold py-1.5 rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50">
                      {importing[item.id] ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> : "Importar"}
                    </button>
                  )}
                  <button onClick={() => setManageSaga({ id: item.id, name: item.name })}
                    className="w-full text-gray-500 hover:text-white text-[10px] font-bold py-1 transition-all">
                    Gestionar miembros
                  </button>
                  <button onClick={() => handleReset(item.id)}
                    className="w-full text-red-600 hover:text-red-400 text-[10px] font-bold py-1 transition-all">
                    Reset
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Sagas configuradas (siempre visible) */}
      <div className="space-y-3 pt-2">
        <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider">Sagas configuradas en Home</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {SAGA_SECTIONS.filter(s => s.collection_id).map(saga => (
            <div key={saga.collection_id} className="bg-brand-card border border-brand-border rounded-xl p-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => handleToggle(saga.collection_id!)}
                  className={`flex-shrink-0 w-9 h-5 rounded-full relative transition-colors ${isActive(saga.collection_id!) ? "bg-brand-red" : "bg-gray-700"}`}
                >
                  <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${isActive(saga.collection_id!) ? "left-[20px]" : "left-0.5"}`} />
                </button>
                <div>
                  <h4 className="text-white font-bold text-sm">{saga.label}</h4>
                  <p className="text-gray-500 text-xs font-mono">ID: {saga.collection_id}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setManageSaga({ id: saga.collection_id!, name: saga.label })}
                  className="bg-brand-surface border border-brand-border hover:border-gray-600 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg transition-all">
                  Gestionar
                </button>
                <button onClick={() => handleImport(saga.collection_id!)} disabled={importing[saga.collection_id!]}
                  className="bg-brand-surface border border-brand-border hover:border-gray-600 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg transition-all disabled:opacity-50">
                  Re-importar
                </button>
                <button onClick={() => handleReset(saga.collection_id!)}
                  className="bg-red-900/20 border border-red-800/20 hover:bg-red-900/40 text-red-500 text-[10px] font-bold px-3 py-1.5 rounded-lg transition-all">
                  Reset
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {manageSaga && (
        <ManageModal collectionId={manageSaga.id} collectionName={manageSaga.name} onClose={() => setManageSaga(null)} />
      )}
    </div>
  );
}

// ── Tab 3: Sincronizar BD ─────────────────────────────────────────────────────

function SyncTab() {
  const qc = useQueryClient();
  const [syncMode, setSyncMode] = useState<SyncMode>("idle");
  const [progress, setProgress] = useState<SyncProgress | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const cancelRef = useRef<(() => void) | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  const refreshAll = useCallback(async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["movies-all"] }),
      qc.invalidateQueries({ queryKey: ["series-all"] }),
      qc.invalidateQueries({ queryKey: ["movies"] }),
      qc.invalidateQueries({ queryKey: ["series"] }),
    ]);
  }, [qc]);

  // BUG FIX #1: "Sincronizar Sagas" ahora tiene lógica real
  const handleSyncAll = () => {
    const allIds = SAGA_SECTIONS.filter(s => s.collection_id).map(s => s.collection_id!);
    if (allIds.length === 0) { toast.error("No hay sagas con collection_id configurado."); return; }
    if (!window.confirm(`¿Sincronizar collection_ids de TODAS las sagas (${allIds.length})?`)) return;
    setSyncMode("syncing-all");
    setProgress({ done: 0, total: allIds.length, lastTitle: "", updated: 0, errors: 0 });
    setLog([`🔄 Sincronizando TODAS las sagas (${allIds.length} colecciones)…`]);
    cancelRef.current = openSSE(
      `/api/admin/scan-collections-stream?ids=${allIds.join(",")}`,
      (data) => {
        setProgress({ done: Number(data.i ?? 0), total: Number(data.total ?? allIds.length), lastTitle: String(data.collection ?? ""), updated: Number(data.updated ?? 0), errors: Number(data.error ?? 0) });
        setLog(l => { const line = `[${data.i}/${data.total}] ${data.collection ?? ""} — ${data.status ?? ""} (${data.movies_updated ?? 0} actualizadas)`; return l.length > 500 ? [...l.slice(-400), line] : [...l, line]; });
        setTimeout(() => logEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
      },
      async (data) => {
        setLog(l => [...l, `✅ Sync TODAS completo — ${data.updated ?? 0} películas actualizadas, ${data.error ?? 0} errores`]);
        setSyncMode("idle");
        toast.success(`Sync completo: ${data.updated ?? 0} películas actualizadas`);
        // BUG FIX #2: invalidar caché para que Home refleje los cambios
        await refreshAll();
      },
      (msg) => { setLog(l => [...l, `❌ Error SSE: ${msg}`]); setSyncMode("idle"); toast.error(msg); }
    );
  };

  const handleSyncDB = () => {
    if (!window.confirm("¿Reparar TODAS las películas en la BD consultando TMDB una a una?\n\nPuede tardar varios minutos.")) return;
    setSyncMode("syncing-db");
    setProgress({ done: 0, total: 0, lastTitle: "", updated: 0, errors: 0 });
    setLog([`🛠 Reparando collection_ids en toda la BD…`]);
    cancelRef.current = openSSE(
      `/api/admin/sync-all-collections-stream`,
      (data) => {
        const status = String(data.status ?? "");
        setProgress({ done: Number(data.i ?? 0), total: Number(data.total ?? 0), lastTitle: String(data.title ?? ""), updated: Number(data.updated ?? 0), errors: Number(data.error ?? 0) });
        if (status === "updated" || status === "cleared") {
          setLog(l => {
            const detail = status === "updated" ? `→ col:${data.collection_id} ${data.collection ?? ""}` : `→ sin colección (limpiado)`;
            const line = `[${data.i}/${data.total}] ${data.title ?? ""} ${detail}`;
            return l.length > 500 ? [...l.slice(-400), line] : [...l, line];
          });
          setTimeout(() => logEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
        }
      },
      async (data) => {
        setLog(l => [...l, `✅ Escaneo completo — ${data.updated ?? 0} actualizadas, ${data.skipped ?? 0} sin cambio, ${data.error ?? 0} errores`]);
        setSyncMode("idle");
        toast.success(`Reparación completa: ${data.updated ?? 0} colecciones actualizadas`);
        await refreshAll();
      },
      (msg) => { setLog(l => [...l, `❌ Error SSE: ${msg}`]); setSyncMode("idle"); toast.error(msg); }
    );
  };

  const handleCancel = () => {
    cancelRef.current?.();
    cancelRef.current = null;
    setSyncMode("idle");
    setLog(l => [...l, "⛔ Cancelado por el usuario"]);
    toast.info("Operación cancelada");
  };

  const isBusy = syncMode !== "idle";

  return (
    <div className="space-y-6">
      {/* Opciones de sincronización */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Opción A: sincronizar todas las sagas configuradas */}
        <div className="bg-brand-card border border-brand-border rounded-2xl p-6 space-y-4">
          <div>
            <h3 className="text-white font-bold">🔄 Sincronizar sagas configuradas</h3>
            <p className="text-gray-500 text-sm mt-1">
              Recorre las <strong className="text-gray-300">{SAGA_SECTIONS.filter(s => s.collection_id).length} sagas</strong> de <code>homeConfig.ts</code> y actualiza el campo <code>collection_id</code> en películas ya importadas.
              Ideal para corregir sagas que aparecen vacías en el Home.
            </p>
          </div>
          <button
            onClick={handleSyncAll}
            disabled={isBusy}
            className="w-full bg-purple-900/40 border border-purple-700/50 text-purple-300 hover:text-purple-200 hover:border-purple-500 font-bold py-3 rounded-xl transition-all disabled:opacity-40 text-sm"
          >
            Ejecutar sincronización
          </button>
        </div>

        {/* Opción B: reparar toda la BD */}
        <div className="bg-brand-card border border-brand-border rounded-2xl p-6 space-y-4">
          <div>
            <h3 className="text-white font-bold">🛠 Reparar toda la BD (TMDB)</h3>
            <p className="text-gray-500 text-sm mt-1">
              Recorre <strong className="text-gray-300">cada película</strong> en la BD, consulta TMDB, y repara <code>collection_id</code> incorrecto o faltante.
              Más lento — úsalo cuando hay muchas películas con saga incorrecta.
            </p>
          </div>
          <button
            onClick={handleSyncDB}
            disabled={isBusy}
            className="w-full bg-orange-900/40 border border-orange-700/50 text-orange-300 hover:text-orange-200 hover:border-orange-500 font-bold py-3 rounded-xl transition-all disabled:opacity-40 text-sm"
          >
            Ejecutar reparación
          </button>
        </div>
      </div>

      {isBusy && (
        <button onClick={handleCancel}
          className="px-4 py-2 rounded-lg text-xs font-bold bg-brand-surface border border-brand-border text-gray-400 hover:text-white transition-colors">
          ⛔ Cancelar operación
        </button>
      )}

      {/* Progress + log */}
      {isBusy && progress && <ProgressBar progress={progress} mode={syncMode} />}
      <LogPanel log={log} logEndRef={logEndRef} />

      {/* Info sobre el Home */}
      {!isBusy && log.length === 0 && (
        <div className="bg-brand-surface border border-brand-border rounded-xl p-5 text-sm text-gray-500 space-y-2">
          <p className="text-gray-300 font-bold">¿Cómo funcionan las sagas en el Home?</p>
          <p>El Home filtra las películas con <code>collection_id</code> igual al de la saga. Si una película tiene ese campo vacío o incorrecto, no aparece en la saga aunque se llame igual.</p>
          <p>Usa <strong className="text-purple-300">Sincronizar sagas</strong> después de importar nuevas películas, o <strong className="text-orange-300">Reparar toda la BD</strong> cuando haya películas históricas con datos corruptos.</p>
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function SagaManager() {
  const [tab, setTab] = useState<Tab>("configured");

  return (
    <AdminLayout title="Gestión de Sagas">
      <div className="max-w-7xl mx-auto space-y-8 pb-20">
        {/* Header */}
        <div className="space-y-1">
          <h1 className="text-3xl font-black text-white tracking-tight">Gestión de Sagas</h1>
          <p className="text-gray-500 text-sm max-w-xl">
            Configura qué películas pertenecen a cada saga, explora nuevas colecciones en TMDB y sincroniza los datos con la base de datos.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex flex-wrap gap-2">
          <TabButton active={tab === "configured"} onClick={() => setTab("configured")}>
            📋 Sagas configuradas
          </TabButton>
          <TabButton active={tab === "explore"} onClick={() => setTab("explore")}>
            🔍 Explorar TMDB
          </TabButton>
          <TabButton active={tab === "sync"} onClick={() => setTab("sync")}>
            🔄 Sincronizar BD
          </TabButton>
        </div>

        {/* Tab content */}
        {tab === "configured" && <ConfiguredSagasTab />}
        {tab === "explore" && <ExploreTab />}
        {tab === "sync" && <SyncTab />}
      </div>
    </AdminLayout>
  );
}
