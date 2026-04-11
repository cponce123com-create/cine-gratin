/**
 * SagaManager.tsx — Gestión unificada de sagas
 * Tabs:
 *   [Sagas configuradas]  → lista BD + toggle Home + acciones TMDB + asignación manual
 *   [Explorar TMDB]       → búsqueda libre de colecciones en TMDB
 *   [Sincronizar BD]      → scan-collections-stream + sync-all
 *   [Configuración]       → CRUD de SAGA_SECTIONS (antes hardcodeado en homeConfig.ts)
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
  getSagaConfig,
  createSagaConfig,
  updateSagaConfig,
  deleteSagaConfig,
  seedSagaConfig,
  type TmdbCollectionSearchItem,
  type SagaMember,
  type SagaConfigRow,
} from "@/lib/api";
import { getToken } from "@/lib/auth";
import type { Movie, Series } from "@/lib/types";

// ── Constants ─────────────────────────────────────────────────────────────────

const BASE_URL =
  (import.meta.env["VITE_API_URL"] as string | undefined) ||
  "https://cine-gratin.onrender.com";

// ── Types ─────────────────────────────────────────────────────────────────────

type Tab = "configured" | "explore" | "sync" | "config";
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

  // Flag para saber si ya recibimos "done" correctamente.
  // EventSource dispara onerror al cerrar la conexión aunque sea limpiamente,
  // así que ignoramos errores post-done.
  let completed = false;

  es.addEventListener("progress", (e) => {
    try { onProgress(JSON.parse((e as MessageEvent).data)); } catch { /* ignore */ }
  });
  es.addEventListener("done", (e) => {
    completed = true;
    es.close();
    try { onDone(JSON.parse((e as MessageEvent).data)); } catch { onDone({}); }
  });
  // Evento "error" enviado explícitamente por el servidor (distinto al onerror de conexión)
  es.addEventListener("error", (e) => {
    if (completed) return;
    const data = (e as MessageEvent & { data?: string }).data;
    if (!data) return; // sin datos = error de conexión, lo maneja onerror
    es.close();
    try { onError((JSON.parse(data) as { message?: string }).message ?? "Error desconocido"); }
    catch { onError("Error en stream"); }
  });
  // Error de conexión nativo del EventSource
  es.onerror = () => {
    if (completed) return; // conexión cerró limpiamente tras "done", ignorar
    es.close();
    onError("Conexión SSE perdida");
  };
  return () => { completed = true; es.close(); };
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ── Shared sub-components ─────────────────────────────────────────────────────

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
  const label = mode === "importing" ? "Importando…" : mode === "resetting" ? "Reseteando…" : mode === "syncing-db" ? "Reparando BD…" : "Sincronizando…";
  return (
    <div className="bg-brand-card border border-brand-border rounded-xl p-4 space-y-2">
      <div className="flex items-center justify-between text-xs text-gray-400">
        <span className="font-bold text-white animate-pulse">{label}</span>
        <span>{progress.done}/{progress.total} ({pct}%)</span>
      </div>
      <div className="w-full bg-brand-surface rounded-full h-2 overflow-hidden">
        <div className="h-full bg-brand-red rounded-full transition-all duration-300" style={{ width: `${pct}%` }} />
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
        <div key={i} className={line.startsWith("✅") ? "text-green-400" : line.startsWith("❌") ? "text-red-400" : line.startsWith("⛔") ? "text-yellow-400" : line.startsWith("🗑") ? "text-orange-400" : ""}>
          {line}
        </div>
      ))}
      <div ref={logEndRef} />
    </div>
  );
}

function ItemRow({ item, saving, actions, compact = false }: {
  item: MediaItem; saving: boolean;
  actions: { label: string; color: "red" | "green" | "yellow"; onClick: () => void }[];
  compact?: boolean;
}) {
  const colorMap = { red: "text-red-400 hover:text-red-300", green: "text-green-400 hover:text-green-300", yellow: "text-yellow-400 hover:text-yellow-300" };
  return (
    <div className={`flex items-center gap-3 ${compact ? "py-1" : "py-2"} border-b border-brand-border/30 last:border-0`}>
      {!compact && item.poster_url && <img src={item.poster_url} alt="" className="w-8 h-12 object-cover rounded flex-shrink-0 opacity-80" />}
      <div className="flex-1 min-w-0">
        <p className="text-white text-sm font-medium truncate">{item.title}</p>
        <p className="text-gray-500 text-[10px] uppercase">{item._type === "movie" ? "Película" : "Serie"} · {item.year}{item.collection_id ? ` · col:${item.collection_id}` : ""}</p>
      </div>
      {saving ? (
        <span className="w-4 h-4 border-2 border-brand-red border-t-transparent rounded-full animate-spin flex-shrink-0" />
      ) : (
        <div className="flex gap-3 flex-shrink-0">
          {actions.map((a) => <button key={a.label} onClick={a.onClick} className={`text-[11px] font-bold ${colorMap[a.color]} transition-colors`}>{a.label}</button>)}
        </div>
      )}
    </div>
  );
}

// ── Modal: gestionar miembros ─────────────────────────────────────────────────

function ManageModal({ collectionId, collectionName, onClose }: { collectionId: number; collectionName: string; onClose: () => void }) {
  const [members, setMembers] = useState<SagaMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SagaMember[]>([]);
  const [searching, setSearching] = useState(false);

  const loadMembers = useCallback(async () => {
    setLoading(true);
    try { setMembers(await getSagaMembers(collectionId)); }
    catch { toast.error("Error al cargar miembros"); }
    finally { setLoading(false); }
  }, [collectionId]);

  useEffect(() => { loadMembers(); }, [loadMembers]);

  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults([]); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const [movies, series] = await Promise.all([searchMovies(searchQuery, 10), searchSeries(searchQuery, 10)]);
        setSearchResults([
          ...movies.map(m => ({ id: m.id, title: m.title, poster_url: m.poster_url, year: m.year, type: "movie" as const })),
          ...series.map(s => ({ id: s.id, title: s.title, poster_url: s.poster_url, year: s.year, type: "series" as const })),
        ]);
      } catch { /* ignore */ } finally { setSearching(false); }
    }, 500);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const handleAdd = async (item: SagaMember) => {
    try { await manageSagaMember({ id: item.id, type: item.type, collection_id: collectionId, collection_name: collectionName, action: "add" }); toast.success(`Añadido: ${item.title}`); loadMembers(); }
    catch { toast.error("Error al añadir"); }
  };
  const handleRemove = async (item: SagaMember) => {
    try { await manageSagaMember({ id: item.id, type: item.type, collection_id: null, collection_name: null, action: "remove" }); toast.success(`Eliminado: ${item.title}`); loadMembers(); }
    catch { toast.error("Error al eliminar"); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-brand-card border border-brand-border rounded-3xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
        <div className="p-5 border-b border-brand-border flex items-center justify-between">
          <div><h2 className="text-lg font-black text-white">Miembros: {collectionName}</h2><p className="text-gray-500 text-xs mt-0.5">ID colección TMDB: {collectionId}</p></div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl w-8 h-8 flex items-center justify-center">✕</button>
        </div>
        <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
          <div className="flex-1 p-5 border-r border-brand-border overflow-y-auto">
            <h3 className="text-white font-bold mb-3 flex items-center gap-2 text-sm">Asignados <span className="bg-brand-red text-white text-[10px] px-2 py-0.5 rounded-full">{members.length}</span></h3>
            {loading ? <div className="flex justify-center py-8"><div className="w-7 h-7 border-3 border-brand-red border-t-transparent rounded-full animate-spin" /></div>
              : members.length === 0 ? <p className="text-gray-500 text-sm text-center py-8 italic">Sin miembros asignados.</p>
              : <div className="space-y-2">{members.map(item => (
                <div key={`${item.type}-${item.id}`} className="flex items-center gap-3 bg-brand-surface p-2 rounded-xl border border-brand-border">
                  {item.poster_url && <img src={item.poster_url} alt="" className="w-9 h-14 object-cover rounded-lg flex-shrink-0" />}
                  <div className="flex-1 min-w-0"><p className="text-white text-sm font-bold truncate">{item.title}</p><p className="text-gray-500 text-[10px] uppercase">{item.type === "movie" ? "Película" : "Serie"} · {item.year}</p></div>
                  <button onClick={() => handleRemove(item)} className="w-7 h-7 flex items-center justify-center text-gray-500 hover:text-red-500 hover:bg-red-500/10 rounded-full transition-all">✕</button>
                </div>
              ))}</div>}
          </div>
          <div className="flex-1 p-5 overflow-y-auto bg-brand-dark/30">
            <h3 className="text-white font-bold mb-3 text-sm">Añadir desde catálogo</h3>
            <div className="relative mb-3">
              <input type="text" placeholder="Buscar en tu catálogo…" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full bg-brand-surface border border-brand-border rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-brand-red transition-colors" />
              {searching && <div className="absolute right-3 top-2.5 w-4 h-4 border-2 border-brand-red border-t-transparent rounded-full animate-spin" />}
            </div>
            <div className="space-y-2">
              {searchResults.map(item => (
                <div key={`s-${item.type}-${item.id}`} className="flex items-center gap-3 bg-brand-surface p-2 rounded-xl border border-brand-border">
                  {item.poster_url && <img src={item.poster_url} alt="" className="w-9 h-14 object-cover rounded-lg flex-shrink-0" />}
                  <div className="flex-1 min-w-0"><p className="text-white text-sm font-bold truncate">{item.title}</p><p className="text-gray-500 text-[10px] uppercase">{item.type === "movie" ? "Película" : "Serie"} · {item.year}</p></div>
                  <button onClick={() => handleAdd(item)} className="w-7 h-7 flex items-center justify-center text-brand-red hover:bg-brand-red/10 rounded-full text-lg transition-all">＋</button>
                </div>
              ))}
              {searchQuery && !searching && searchResults.length === 0 && <p className="text-gray-500 text-center py-8 text-sm">Sin resultados.</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Tab 1: Sagas configuradas ─────────────────────────────────────────────────

function ConfiguredSagasTab({ sagaConfig }: { sagaConfig: SagaConfigRow[] }) {
  const qc = useQueryClient();
  const { data: movies = [], isLoading: loadingMovies } = useQuery({ queryKey: ["movies-all"], queryFn: () => getMovies({ limit: 10000 }), staleTime: 2 * 60 * 1000 });
  const { data: series = [], isLoading: loadingSeries } = useQuery({ queryKey: ["series-all"], queryFn: () => getSeries({ limit: 10000 }), staleTime: 2 * 60 * 1000 });
  const [activeSagas, setActiveSagas] = useState<number[]>([]);

  useEffect(() => { getActiveSagas().then(setActiveSagas).catch(console.error); }, []);

  const [selectedId, setSelectedId] = useState(sagaConfig[0]?.id ?? "");
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [syncMode, setSyncMode] = useState<SyncMode>("idle");
  const [progress, setProgress] = useState<SyncProgress | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [manageSaga, setManageSaga] = useState<{ id: number; name: string } | null>(null);
  const cancelRef = useRef<(() => void) | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  // Keep selectedId valid when sagaConfig changes
  useEffect(() => {
    if (sagaConfig.length > 0 && !sagaConfig.find(s => s.id === selectedId)) {
      setSelectedId(sagaConfig[0].id);
    }
  }, [sagaConfig, selectedId]);

  const allItems: MediaItem[] = useMemo(() => [
    ...(movies as Movie[]).map(m => ({ ...m, _type: "movie" as const })),
    ...(series as Series[]).map(s => ({ ...s, _type: "series" as const })),
  ], [movies, series]);

  const saga = sagaConfig.find(s => s.id === selectedId);

  const { assigned, keywordOnly, searchResults } = useMemo(() => {
    if (!saga) return { assigned: [], keywordOnly: [], searchResults: [] };
    const assigned: MediaItem[] = [], keywordOnly: MediaItem[] = [];
    for (const item of allItems) {
      if (item.collection_id === -1) continue;
      if (saga.collection_id && item.collection_id === saga.collection_id) assigned.push(item);
      else if (item.collection_id == null && matchesKeywords(item.title, saga.keywords)) keywordOnly.push(item);
    }
    assigned.sort((a, b) => (a.year ?? 0) - (b.year ?? 0));
    keywordOnly.sort((a, b) => (a.year ?? 0) - (b.year ?? 0));
    const sq = search.trim().toLowerCase();
    const searchResults = sq ? allItems.filter(item => item.title.toLowerCase().includes(sq) && !assigned.some(a => a.id === item.id) && !keywordOnly.some(k => k.id === item.id)) : [];
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
      await updateCollection(items.map(item => ({ id: String(item.id), type: item._type, collection_id: collectionId, collection_name: collectionName })));
      await refreshAll();
      toast.success(collectionId === -1 ? "Excluido de sagas" : collectionId ? "Asignado a saga" : "Quitado de saga");
    } catch { toast.error("Error al actualizar"); } finally { setSavingIds(new Set()); }
  };

  const handleImport = async () => {
    if (!saga?.collection_id) { toast.error("Sin collection_id configurado."); return; }
    setSyncMode("importing");
    setLog([`▶ Importando colección ${saga.collection_id} — ${saga.label}…`]);
    try {
      const result = await importCollection(saga.collection_id);
      setLog(l => [...l, `✅ Importadas: ${result.imported} | Ya existían: ${result.existed} | Total: ${result.total}`, ...(result.titles?.length > 0 ? [`   Nuevas: ${result.titles.join(", ")}`] : [])]);
      toast.success(`Importación completa: ${result.imported} nuevas`);
      await refreshAll();
    } catch (e) { const msg = e instanceof Error ? e.message : String(e); setLog(l => [...l, `❌ Error: ${msg}`]); toast.error(msg); }
    finally { setSyncMode("idle"); }
  };

  const handleReset = async () => {
    if (!saga?.collection_id) { toast.error("Sin collection_id configurado."); return; }
    if (!window.confirm(`¿Eliminar TODO de "${saga.label}" y re-importar desde TMDB?\n\nNo se puede deshacer.`)) return;
    setSyncMode("resetting");
    setLog([`🗑 Eliminando entradas de colección ${saga.collection_id}…`]);
    try {
      const del = await resetCollection(saga.collection_id);
      setLog(l => [...l, `   Eliminadas: ${del.deleted_movies} películas, ${del.deleted_series} series`, `▶ Re-importando desde TMDB…`]);
      const result = await importCollection(saga.collection_id);
      setLog(l => [...l, `✅ Importadas: ${result.imported} | Total: ${result.total}`]);
      toast.success(`Reset completo. ${result.imported} importadas.`);
      await refreshAll();
    } catch (e) { const msg = e instanceof Error ? e.message : String(e); setLog(l => [...l, `❌ Error: ${msg}`]); toast.error(msg); }
    finally { setSyncMode("idle"); }
  };

  const handleSyncSaga = () => {
    if (!saga?.collection_id) { toast.error("Sin collection_id configurado."); return; }
    setSyncMode("syncing");
    setProgress({ done: 0, total: 0, lastTitle: "", updated: 0, errors: 0 });
    setLog([`🔄 Sincronizando "${saga.label}"…`]);
    cancelRef.current = openSSE(
      `/api/admin/scan-collections-stream?ids=${saga.collection_id}`,
      (data) => { setProgress({ done: Number(data.i ?? 0), total: Number(data.total ?? 0), lastTitle: String(data.collection ?? ""), updated: Number(data.updated ?? 0), errors: Number(data.error ?? 0) }); setLog(l => { const line = `[${data.i}/${data.total}] ${data.collection ?? ""} — ${data.status ?? ""}`; return l.length > 200 ? [...l.slice(-150), line] : [...l, line]; }); setTimeout(() => logEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50); },
      async (data) => { setLog(l => [...l, `✅ Sync completo — ${data.updated ?? 0} actualizadas`]); setSyncMode("idle"); toast.success("Sincronización completa"); await refreshAll(); },
      (msg) => { setLog(l => [...l, `❌ Error SSE: ${msg}`]); setSyncMode("idle"); toast.error(msg); }
    );
  };

  const handleToggleActive = async (id: number) => {
    const current = activeSagas.includes(id);
    try {
      await toggleSagaActive(id, !current);
      setActiveSagas(prev => !current ? [...prev, id] : prev.filter(s => s !== id));
      await refreshAll();
      toast.success(current ? "Saga desactivada del Home" : "Saga activada en el Home");
    } catch { toast.error("Error al cambiar estado"); }
  };

  const isBusy = syncMode !== "idle";

  return (
    <div className="space-y-6">
      {(loadingMovies || loadingSeries) && <div className="text-center text-gray-500 text-sm py-4 animate-pulse">Cargando catálogo…</div>}

      {/* Saga pills */}
      <div className="flex flex-wrap gap-2">
        {sagaConfig.map(sec => {
          const count = allItems.filter(i => i.collection_id === sec.collection_id && i.collection_id != null).length;
          const isActive = sec.collection_id ? activeSagas.includes(sec.collection_id) : false;
          return (
            <button key={sec.id} onClick={() => { setSelectedId(sec.id); setSearch(""); setLog([]); setProgress(null); }}
              className={`px-3 py-1.5 rounded-full text-xs font-bold transition-colors border relative ${selectedId === sec.id ? "bg-brand-red border-brand-red text-white" : "bg-brand-surface border-brand-border text-gray-400 hover:text-white"}`}>
              {sec.label}
              {count > 0 && <span className="ml-1.5 text-[10px] opacity-70">({count})</span>}
              {sec.collection_id && <span className={`absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full border border-brand-dark ${isActive ? "bg-green-400" : "bg-gray-600"}`} />}
            </button>
          );
        })}
      </div>
      <p className="text-[10px] text-gray-600 -mt-2">Punto verde = visible en el Home.</p>

      {saga && (
        <>
          <div className="bg-brand-card border border-brand-border rounded-xl p-5 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-white">{saga.label}</h2>
                {saga.collection_id
                  ? <a href={`https://www.themoviedb.org/collection/${saga.collection_id}`} target="_blank" rel="noreferrer" className="text-xs text-brand-gold font-mono hover:underline">TMDB #{saga.collection_id}</a>
                  : <span className="text-xs text-yellow-600">⚠ Sin collection_id — solo keywords</span>}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-green-400 font-bold text-sm">{assigned.length} asignadas</span>
                {keywordOnly.length > 0 && <span className="text-yellow-400 font-bold text-sm">{keywordOnly.length} sin asignar</span>}
                {saga.collection_id && (
                  <button onClick={() => handleToggleActive(saga.collection_id!)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${activeSagas.includes(saga.collection_id) ? "bg-green-900/30 border-green-700/50 text-green-400" : "bg-brand-surface border-brand-border text-gray-500 hover:text-white"}`}>
                    <span className={`w-2 h-2 rounded-full ${activeSagas.includes(saga.collection_id) ? "bg-green-400" : "bg-gray-600"}`} />
                    {activeSagas.includes(saga.collection_id) ? "Visible en Home" : "Oculta en Home"}
                  </button>
                )}
                {saga.collection_id && (
                  <button onClick={() => setManageSaga({ id: saga.collection_id!, name: saga.label })}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold bg-brand-surface border border-brand-border text-gray-300 hover:text-white hover:border-gray-600 transition-all">
                    Gestionar miembros
                  </button>
                )}
              </div>
            </div>
            {saga.collection_id && (
              <div className="flex flex-wrap gap-2 pt-3 border-t border-brand-border/40">
                <button onClick={handleImport} disabled={isBusy} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-green-900/40 border border-green-700/50 text-green-400 hover:border-green-500 transition-colors disabled:opacity-40">⬇ Importar desde TMDB</button>
                <button onClick={handleSyncSaga} disabled={isBusy} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-900/40 border border-blue-700/50 text-blue-400 hover:border-blue-500 transition-colors disabled:opacity-40">🔄 Sincronizar collection_ids</button>
                <button onClick={handleReset} disabled={isBusy} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-red-900/40 border border-red-700/50 text-red-400 hover:border-red-600 transition-colors disabled:opacity-40">🗑 Reset + Re-importar</button>
                {isBusy && <button onClick={() => { cancelRef.current?.(); setSyncMode("idle"); setLog(l => [...l, "⛔ Cancelado"]); }} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-brand-surface border border-brand-border text-gray-400 hover:text-white">⛔ Cancelar</button>}
              </div>
            )}
          </div>

          {isBusy && progress && <ProgressBar progress={progress} mode={syncMode} />}
          <LogPanel log={log} logEndRef={logEndRef} />

          {/* Asignados */}
          <div className="bg-brand-card border border-green-800/40 rounded-xl p-4 space-y-1">
            <div className="flex items-center gap-2 mb-2"><span className="w-2 h-2 rounded-full bg-green-500" /><h3 className="text-sm font-bold text-white">Títulos en saga — visibles en Home ({assigned.length})</h3></div>
            {assigned.length === 0 ? <p className="text-xs text-gray-500">Ningún título asignado aún.</p>
              : assigned.map(item => <ItemRow key={item.id} item={item} saving={savingIds.has(String(item.id))} actions={[{ label: "Quitar", color: "red", onClick: () => doUpdate([item], null, null) }, { label: "Excluir", color: "yellow", onClick: () => doUpdate([item], -1, null) }]} />)}
          </div>

          {/* Candidatos */}
          {keywordOnly.length > 0 && (
            <div className="bg-brand-card border border-yellow-800/40 rounded-xl p-4 space-y-1">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-yellow-500" /><h3 className="text-sm font-bold text-white">Candidatos por título ({keywordOnly.length})</h3></div>
                {saga.collection_id && <button onClick={() => doUpdate(keywordOnly, saga.collection_id!, saga.label)} disabled={savingIds.size > 0} className="text-xs font-bold text-brand-gold hover:text-yellow-300 disabled:opacity-50">Asignar todos →</button>}
              </div>
              <p className="text-xs text-yellow-500/80 mb-2">{saga.collection_id ? "Coinciden por nombre pero sin collection_id — NO aparecen en el Home hasta asignarlos." : "Coinciden por keywords."}</p>
              {keywordOnly.map(item => <ItemRow key={item.id} item={item} saving={savingIds.has(String(item.id))} actions={[...(saga.collection_id ? [{ label: "Asignar", color: "green" as const, onClick: () => doUpdate([item], saga.collection_id!, saga.label) }] : []), { label: "Excluir", color: "yellow", onClick: () => doUpdate([item], -1, null) }]} />)}
            </div>
          )}

          {/* Buscar */}
          <div className="bg-brand-card border border-brand-border rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-bold text-white">Buscar y agregar manualmente</h3>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar película o serie…" className="w-full bg-brand-dark border border-brand-border rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-brand-red" />
            {searchResults.length > 0 && (
              <div className="space-y-1 max-h-64 overflow-y-auto">
                {searchResults.slice(0, 30).map(item => <ItemRow key={item.id} item={item} saving={savingIds.has(String(item.id))} compact actions={[...(saga.collection_id ? [{ label: "Agregar", color: "green" as const, onClick: () => doUpdate([item], saga.collection_id!, saga.label) }] : []), { label: "Excluir", color: "yellow", onClick: () => doUpdate([item], -1, null) }]} />)}
              </div>
            )}
          </div>
        </>
      )}
      {manageSaga && <ManageModal collectionId={manageSaga.id} collectionName={manageSaga.name} onClose={() => setManageSaga(null)} />}
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
  const { data: sagaConfig = [] } = useQuery({ queryKey: ["saga-config"], queryFn: getSagaConfig, staleTime: 5 * 60 * 1000 });

  useEffect(() => { getActiveSagas().then(setActiveSagas).catch(console.error); }, []);
  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    const t = setTimeout(async () => { setLoading(true); try { setResults(await searchTmdbCollections(query)); } catch { toast.error("Error al buscar"); } finally { setLoading(false); } }, 500);
    return () => clearTimeout(t);
  }, [query]);

  const refreshAll = useCallback(async () => {
    await Promise.all([qc.invalidateQueries({ queryKey: ["movies-all"] }), qc.invalidateQueries({ queryKey: ["series-all"] }), qc.invalidateQueries({ queryKey: ["movies"] }), qc.invalidateQueries({ queryKey: ["series"] })]);
  }, [qc]);

  const handleImport = async (id: number) => {
    setImporting(p => ({ ...p, [id]: true }));
    try { const res = await importCollection(id); setImportResults(p => ({ ...p, [id]: { imported: res.imported, existed: res.existed } })); toast.success(`Importada: ${res.collection}`); await refreshAll(); }
    catch (e: any) { toast.error(e.message || "Error al importar"); } finally { setImporting(p => ({ ...p, [id]: false })); }
  };

  const handleReset = async (id: number) => {
    if (!confirm("¿Resetear esta saga? Se borrarán todas sus películas.")) return;
    try { const res = await resetCollection(id); toast.success(`Reseteada: ${res.total_deleted} items`); await refreshAll(); }
    catch (e: any) { toast.error(e.message || "Error al resetear"); }
  };

  const handleToggle = async (id: number) => {
    const current = activeSagas.includes(id);
    try { await toggleSagaActive(id, !current); setActiveSagas(prev => !current ? [...prev, id] : prev.filter(s => s !== id)); await refreshAll(); toast.success(current ? "Desactivada del Home" : "Activada en el Home"); }
    catch { toast.error("Error al cambiar estado"); }
  };

  const isConfigured = (id: number) => sagaConfig.some(s => s.collection_id === id);
  const isActive = (id: number) => activeSagas.includes(id);

  return (
    <div className="space-y-6">
      <div className="relative">
        <input type="text" value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar saga en TMDB (ej: Marvel, Batman, Jurassic…)" className="w-full bg-brand-card border border-brand-border rounded-2xl px-6 py-4 text-white focus:outline-none focus:border-brand-red transition-colors" />
        {loading && <div className="absolute right-5 top-1/2 -translate-y-1/2"><div className="w-5 h-5 border-2 border-brand-red border-t-transparent rounded-full animate-spin" /></div>}
      </div>

      {results.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {results.map(item => (
            <div key={item.id} className="bg-brand-card border border-brand-border rounded-2xl overflow-hidden flex flex-col group">
              <div className="aspect-[2/3] relative overflow-hidden bg-brand-surface">
                {item.poster_path ? <img src={item.poster_path} alt={item.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" /> : <div className="w-full h-full flex items-center justify-center text-gray-700 text-xs">Sin poster</div>}
                {isConfigured(item.id) && <div className="absolute top-2 left-2 bg-green-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">✓ Configurada</div>}
              </div>
              <div className="p-3 flex-1 flex flex-col gap-2">
                <div className="flex items-start justify-between gap-1">
                  <h3 className="text-white font-bold text-sm line-clamp-2 flex-1">{item.name}</h3>
                  <button onClick={() => handleToggle(item.id)} className={`flex-shrink-0 w-8 h-4 rounded-full relative transition-colors mt-0.5 ${isActive(item.id) ? "bg-brand-red" : "bg-gray-700"}`} title={isActive(item.id) ? "Desactivar del Home" : "Activar en el Home"}>
                    <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${isActive(item.id) ? "left-[18px]" : "left-0.5"}`} />
                  </button>
                </div>
                <p className="text-gray-500 text-[10px] font-mono">ID: {item.id}</p>
                <div className="flex flex-col gap-1.5 mt-auto">
                  {importResults[item.id] ? (
                    <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-2 text-center"><p className="text-green-400 text-[10px] font-bold">+{importResults[item.id].imported} nuevos / {importResults[item.id].existed} ya existían</p></div>
                  ) : (
                    <button onClick={() => handleImport(item.id)} disabled={importing[item.id]} className="w-full bg-brand-surface border border-brand-border hover:border-brand-red/50 text-white text-xs font-bold py-1.5 rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50">
                      {importing[item.id] ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> : "Importar"}
                    </button>
                  )}
                  <button onClick={() => setManageSaga({ id: item.id, name: item.name })} className="w-full text-gray-500 hover:text-white text-[10px] font-bold py-1 transition-all">Gestionar miembros</button>
                  <button onClick={() => handleReset(item.id)} className="w-full text-red-600 hover:text-red-400 text-[10px] font-bold py-1 transition-all">Reset</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-3 pt-2">
        <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider">Sagas configuradas en Home</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {sagaConfig.filter(s => s.collection_id).map(saga => (
            <div key={saga.collection_id} className="bg-brand-card border border-brand-border rounded-xl p-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <button onClick={() => handleToggle(saga.collection_id!)} className={`flex-shrink-0 w-9 h-5 rounded-full relative transition-colors ${isActive(saga.collection_id!) ? "bg-brand-red" : "bg-gray-700"}`}>
                  <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${isActive(saga.collection_id!) ? "left-[20px]" : "left-0.5"}`} />
                </button>
                <div><h4 className="text-white font-bold text-sm">{saga.label}</h4><p className="text-gray-500 text-xs font-mono">ID: {saga.collection_id}</p></div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setManageSaga({ id: saga.collection_id!, name: saga.label })} className="bg-brand-surface border border-brand-border hover:border-gray-600 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg">Gestionar</button>
                <button onClick={() => handleImport(saga.collection_id!)} disabled={importing[saga.collection_id!]} className="bg-brand-surface border border-brand-border hover:border-gray-600 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg disabled:opacity-50">Re-importar</button>
                <button onClick={() => handleReset(saga.collection_id!)} className="bg-red-900/20 border border-red-800/20 text-red-500 text-[10px] font-bold px-3 py-1.5 rounded-lg">Reset</button>
              </div>
            </div>
          ))}
        </div>
      </div>
      {manageSaga && <ManageModal collectionId={manageSaga.id} collectionName={manageSaga.name} onClose={() => setManageSaga(null)} />}
    </div>
  );
}

// ── Tab 3: Sincronizar BD ─────────────────────────────────────────────────────

function SyncTab({ sagaConfig }: { sagaConfig: SagaConfigRow[] }) {
  const qc = useQueryClient();
  const [syncMode, setSyncMode] = useState<SyncMode>("idle");
  const [progress, setProgress] = useState<SyncProgress | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const cancelRef = useRef<(() => void) | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  const refreshAll = useCallback(async () => {
    await Promise.all([qc.invalidateQueries({ queryKey: ["movies-all"] }), qc.invalidateQueries({ queryKey: ["series-all"] }), qc.invalidateQueries({ queryKey: ["movies"] }), qc.invalidateQueries({ queryKey: ["series"] })]);
  }, [qc]);

  const handleSyncAll = () => {
    const allIds = sagaConfig.filter(s => s.collection_id).map(s => s.collection_id!);
    if (allIds.length === 0) { toast.error("No hay sagas con collection_id configurado."); return; }
    if (!window.confirm(`¿Sincronizar collection_ids de TODAS las sagas (${allIds.length})?`)) return;
    setSyncMode("syncing-all");
    setProgress({ done: 0, total: allIds.length, lastTitle: "", updated: 0, errors: 0 });
    setLog([`🔄 Sincronizando TODAS las sagas (${allIds.length} colecciones)…`]);
    cancelRef.current = openSSE(
      `/api/admin/scan-collections-stream?ids=${allIds.join(",")}`,
      (data) => { setProgress({ done: Number(data.i ?? 0), total: Number(data.total ?? allIds.length), lastTitle: String(data.collection ?? ""), updated: Number(data.updated ?? 0), errors: Number(data.error ?? 0) }); setLog(l => { const line = `[${data.i}/${data.total}] ${data.collection ?? ""} — ${data.status ?? ""} (${data.movies_updated ?? 0} actualizadas)`; return l.length > 500 ? [...l.slice(-400), line] : [...l, line]; }); setTimeout(() => logEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50); },
      async (data) => { setLog(l => [...l, `✅ Sync completo — ${data.updated ?? 0} películas actualizadas, ${data.error ?? 0} errores`]); setSyncMode("idle"); toast.success(`Sync completo: ${data.updated ?? 0} actualizadas`); await refreshAll(); },
      (msg) => { setLog(l => [...l, `❌ Error SSE: ${msg}`]); setSyncMode("idle"); toast.error(msg); }
    );
  };

  const handleSyncDB = () => {
    if (!window.confirm("¿Reparar TODAS las películas en la BD consultando TMDB?\n\nPuede tardar varios minutos.")) return;
    setSyncMode("syncing-db");
    setProgress({ done: 0, total: 0, lastTitle: "", updated: 0, errors: 0 });
    setLog([`🛠 Reparando collection_ids en toda la BD…`]);
    cancelRef.current = openSSE(
      `/api/admin/sync-all-collections-stream`,
      (data) => { const status = String(data.status ?? ""); setProgress({ done: Number(data.i ?? 0), total: Number(data.total ?? 0), lastTitle: String(data.title ?? ""), updated: Number(data.updated ?? 0), errors: Number(data.error ?? 0) }); if (status === "updated" || status === "cleared") { setLog(l => { const detail = status === "updated" ? `→ col:${data.collection_id} ${data.collection ?? ""}` : `→ sin colección`; const line = `[${data.i}/${data.total}] ${data.title ?? ""} ${detail}`; return l.length > 500 ? [...l.slice(-400), line] : [...l, line]; }); setTimeout(() => logEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50); } },
      async (data) => { setLog(l => [...l, `✅ Reparación completa — ${data.updated ?? 0} actualizadas, ${data.error ?? 0} errores`]); setSyncMode("idle"); toast.success(`Reparación completa: ${data.updated ?? 0} actualizadas`); await refreshAll(); },
      (msg) => { setLog(l => [...l, `❌ Error SSE: ${msg}`]); setSyncMode("idle"); toast.error(msg); }
    );
  };

  const isBusy = syncMode !== "idle";

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="bg-brand-card border border-brand-border rounded-2xl p-6 space-y-4">
          <div><h3 className="text-white font-bold">🔄 Sincronizar sagas configuradas</h3><p className="text-gray-500 text-sm mt-1">Actualiza <code>collection_id</code> en películas ya importadas para las <strong className="text-gray-300">{sagaConfig.filter(s => s.collection_id).length} sagas</strong> configuradas.</p></div>
          <button onClick={handleSyncAll} disabled={isBusy} className="w-full bg-purple-900/40 border border-purple-700/50 text-purple-300 hover:border-purple-500 font-bold py-3 rounded-xl transition-all disabled:opacity-40 text-sm">Ejecutar sincronización</button>
        </div>
        <div className="bg-brand-card border border-brand-border rounded-2xl p-6 space-y-4">
          <div><h3 className="text-white font-bold">🛠 Reparar toda la BD</h3><p className="text-gray-500 text-sm mt-1">Recorre cada película en la BD y consulta TMDB para reparar <code>collection_id</code> incorrecto o faltante.</p></div>
          <button onClick={handleSyncDB} disabled={isBusy} className="w-full bg-orange-900/40 border border-orange-700/50 text-orange-300 hover:border-orange-500 font-bold py-3 rounded-xl transition-all disabled:opacity-40 text-sm">Ejecutar reparación</button>
        </div>
      </div>
      {isBusy && <button onClick={() => { cancelRef.current?.(); setSyncMode("idle"); setLog(l => [...l, "⛔ Cancelado"]); }} className="px-4 py-2 rounded-lg text-xs font-bold bg-brand-surface border border-brand-border text-gray-400 hover:text-white">⛔ Cancelar operación</button>}
      {isBusy && progress && <ProgressBar progress={progress} mode={syncMode} />}
      <LogPanel log={log} logEndRef={logEndRef} />
    </div>
  );
}

// ── Tab 4: Configuración de sagas ─────────────────────────────────────────────

const EMPTY_FORM = { id: "", label: "", collection_id: "", keywords: "", active: true };

function ConfigTab() {
  const qc = useQueryClient();
  const { data: sagas = [], isLoading } = useQuery({ queryKey: ["saga-config"], queryFn: getSagaConfig, staleTime: 0 });

  const [editing, setEditing] = useState<SagaConfigRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [dragOver, setDragOver] = useState<string | null>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: ["saga-config"] });

  // Open edit modal
  const openEdit = (saga: SagaConfigRow) => {
    setEditing(saga);
    setCreating(false);
    setForm({
      id: saga.id,
      label: saga.label,
      collection_id: saga.collection_id != null ? String(saga.collection_id) : "",
      keywords: saga.keywords.join(", "),
      active: saga.active,
    });
  };

  // Open create modal
  const openCreate = () => {
    setEditing(null);
    setCreating(true);
    setForm(EMPTY_FORM);
  };

  const closeModal = () => { setEditing(null); setCreating(false); };

  // Auto-generate id from label when creating
  const handleLabelChange = (val: string) => {
    setForm(f => ({ ...f, label: val, ...(creating ? { id: slugify(val) } : {}) }));
  };

  const handleSave = async () => {
    if (!form.label.trim()) { toast.error("El nombre es obligatorio."); return; }
    if (!form.id.trim()) { toast.error("El ID es obligatorio."); return; }
    setSaving(true);
    const payload = {
      id: form.id.trim(),
      label: form.label.trim(),
      collection_id: form.collection_id ? parseInt(form.collection_id) : null,
      keywords: form.keywords.split(",").map(k => k.trim()).filter(Boolean),
      active: form.active,
    };
    try {
      if (creating) {
        await createSagaConfig({ ...payload, sort_order: sagas.length });
        toast.success("Saga creada");
      } else if (editing) {
        await updateSagaConfig(editing.id, payload);
        toast.success("Saga actualizada");
      }
      await refresh();
      closeModal();
    } catch (e: any) { toast.error(e.message || "Error al guardar"); }
    finally { setSaving(false); }
  };

  const handleDelete = async (saga: SagaConfigRow) => {
    if (!confirm(`¿Eliminar "${saga.label}" de la configuración?\n\nEsto NO borra las películas de la BD, solo quita la saga del Home.`)) return;
    try { await deleteSagaConfig(saga.id); toast.success(`"${saga.label}" eliminada`); await refresh(); closeModal(); }
    catch (e: any) { toast.error(e.message || "Error al eliminar"); }
  };

  const handleToggleActive = async (saga: SagaConfigRow) => {
    try { await updateSagaConfig(saga.id, { active: !saga.active }); await refresh(); toast.success(saga.active ? "Saga desactivada" : "Saga activada"); }
    catch { toast.error("Error al cambiar estado"); }
  };

  const handleSeed = async () => {
    if (!confirm("¿Cargar las 27 sagas predeterminadas? Solo se añaden las que no existan todavía.")) return;
    setSeeding(true);
    try { const res = await seedSagaConfig(); toast.success(`${res.inserted} sagas cargadas`); await refresh(); }
    catch (e: any) { toast.error(e.message || "Error al hacer seed"); }
    finally { setSeeding(false); }
  };

  // Drag-to-reorder (optimistic, sends PUT to update sort_order)
  const handleDragStart = (e: React.DragEvent, id: string) => { e.dataTransfer.setData("saga_id", id); };
  const handleDrop = async (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    const draggedId = e.dataTransfer.getData("saga_id");
    if (!draggedId || draggedId === targetId) { setDragOver(null); return; }
    const list = [...sagas];
    const fromIdx = list.findIndex(s => s.id === draggedId);
    const toIdx = list.findIndex(s => s.id === targetId);
    if (fromIdx === -1 || toIdx === -1) { setDragOver(null); return; }
    list.splice(toIdx, 0, list.splice(fromIdx, 1)[0]);
    // Optimistic update via qc
    qc.setQueryData(["saga-config"], list);
    setDragOver(null);
    // Persist new order
    try {
      await Promise.all(list.map((s, i) => updateSagaConfig(s.id, { sort_order: i })));
    } catch { toast.error("Error al guardar orden"); await refresh(); }
  };

  const showModal = editing !== null || creating;

  return (
    <div className="space-y-6">
      {/* Header actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-gray-400 text-sm">
            Define qué sagas aparecen en el Home. Arrastra para reordenar.
          </p>
        </div>
        <div className="flex gap-2">
          {sagas.length === 0 && (
            <button onClick={handleSeed} disabled={seeding}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-purple-900/40 border border-purple-700/50 text-purple-300 hover:border-purple-500 transition-all disabled:opacity-40">
              {seeding ? "Cargando…" : "⚡ Cargar sagas predeterminadas"}
            </button>
          )}
          <button onClick={openCreate}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-brand-red border border-brand-red text-white hover:bg-red-700 transition-all flex items-center gap-2">
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M12 5v14m7-7H5" strokeLinecap="round" strokeLinejoin="round" /></svg>
            Nueva saga
          </button>
        </div>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="text-center text-gray-500 text-sm py-8 animate-pulse">Cargando sagas…</div>
      ) : sagas.length === 0 ? (
        <div className="text-center py-16 space-y-4">
          <p className="text-gray-500 text-sm">No hay sagas configuradas todavía.</p>
          <button onClick={handleSeed} disabled={seeding} className="px-5 py-2.5 rounded-xl text-sm font-bold bg-purple-900/40 border border-purple-700/50 text-purple-300 hover:border-purple-500 transition-all disabled:opacity-40">
            {seeding ? "Cargando…" : "⚡ Cargar las 27 sagas predeterminadas"}
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {sagas.map((saga, idx) => (
            <div
              key={saga.id}
              draggable
              onDragStart={e => handleDragStart(e, saga.id)}
              onDragOver={e => { e.preventDefault(); setDragOver(saga.id); }}
              onDragLeave={() => setDragOver(null)}
              onDrop={e => handleDrop(e, saga.id)}
              className={`flex items-center gap-3 bg-brand-card border rounded-xl px-4 py-3 transition-all cursor-grab active:cursor-grabbing ${dragOver === saga.id ? "border-brand-red bg-brand-red/5" : "border-brand-border hover:border-gray-600"}`}
            >
              {/* Drag handle */}
              <svg className="w-4 h-4 text-gray-600 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="9" cy="5" r="1" fill="currentColor" /><circle cx="9" cy="12" r="1" fill="currentColor" /><circle cx="9" cy="19" r="1" fill="currentColor" /><circle cx="15" cy="5" r="1" fill="currentColor" /><circle cx="15" cy="12" r="1" fill="currentColor" /><circle cx="15" cy="19" r="1" fill="currentColor" /></svg>

              {/* Order number */}
              <span className="text-gray-600 text-[10px] font-mono w-5 text-right flex-shrink-0">{idx + 1}</span>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-white font-bold text-sm">{saga.label}</span>
                  {saga.collection_id && <span className="text-gray-500 text-[10px] font-mono">TMDB #{saga.collection_id}</span>}
                  {!saga.collection_id && <span className="text-yellow-600 text-[10px]">solo keywords</span>}
                  <span className="text-gray-600 text-[10px] font-mono">/{saga.id}</span>
                </div>
                {saga.keywords.length > 0 && (
                  <p className="text-gray-600 text-[10px] truncate mt-0.5">{saga.keywords.slice(0, 6).join(", ")}{saga.keywords.length > 6 ? ` +${saga.keywords.length - 6}` : ""}</p>
                )}
              </div>

              {/* Active toggle */}
              <button onClick={() => handleToggleActive(saga)}
                className={`flex-shrink-0 w-9 h-5 rounded-full relative transition-colors ${saga.active ? "bg-green-600" : "bg-gray-700"}`}
                title={saga.active ? "Desactivar del Home" : "Activar en el Home"}>
                <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${saga.active ? "left-[20px]" : "left-0.5"}`} />
              </button>

              {/* Edit button */}
              <button onClick={() => openEdit(saga)}
                className="flex-shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-bold bg-brand-surface border border-brand-border text-gray-300 hover:text-white hover:border-gray-600 transition-all">
                Editar
              </button>

              {/* Delete button */}
              <button onClick={() => handleDelete(saga)}
                className="flex-shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-bold bg-red-900/20 border border-red-800/20 text-red-500 hover:bg-red-900/40 transition-all">
                Eliminar
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Edit / Create Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-brand-card border border-brand-border rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-brand-border flex items-center justify-between">
              <h2 className="text-lg font-black text-white">{creating ? "Nueva Saga" : `Editar: ${editing?.label}`}</h2>
              <button onClick={closeModal} className="text-gray-400 hover:text-white text-xl w-8 h-8 flex items-center justify-center">✕</button>
            </div>

            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              {/* Label */}
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1.5">Nombre <span className="text-red-400">*</span></label>
                <input value={form.label} onChange={e => handleLabelChange(e.target.value)} placeholder="Ej: Universo Marvel" className="w-full bg-brand-dark border border-brand-border rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-brand-red transition-colors" />
              </div>

              {/* ID */}
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1.5">ID único <span className="text-red-400">*</span></label>
                <input value={form.id} onChange={e => setForm(f => ({ ...f, id: e.target.value }))} placeholder="Ej: marvel" disabled={!creating} className={`w-full bg-brand-dark border border-brand-border rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-brand-red transition-colors font-mono ${!creating ? "opacity-50 cursor-not-allowed" : ""}`} />
                {creating && <p className="text-[10px] text-gray-600 mt-1">Solo letras, números y guiones. Se genera automáticamente del nombre.</p>}
              </div>

              {/* Collection ID */}
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1.5">TMDB Collection ID <span className="text-gray-600">(opcional)</span></label>
                <input value={form.collection_id} onChange={e => setForm(f => ({ ...f, collection_id: e.target.value }))} placeholder="Ej: 420" type="number" className="w-full bg-brand-dark border border-brand-border rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-brand-red transition-colors font-mono" />
                {form.collection_id && (
                  <a href={`https://www.themoviedb.org/collection/${form.collection_id}`} target="_blank" rel="noreferrer" className="text-[10px] text-brand-gold hover:underline mt-1 block">Ver en TMDB →</a>
                )}
              </div>

              {/* Keywords */}
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1.5">Keywords <span className="text-gray-600">(separadas por coma)</span></label>
                <textarea value={form.keywords} onChange={e => setForm(f => ({ ...f, keywords: e.target.value }))} placeholder="Ej: iron man, avengers, thor, hulk" rows={3} className="w-full bg-brand-dark border border-brand-border rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-brand-red transition-colors resize-none" />
                <p className="text-[10px] text-gray-600 mt-1">Se usan para encontrar películas sin collection_id asignado.</p>
              </div>

              {/* Active */}
              <div className="flex items-center justify-between bg-brand-surface border border-brand-border rounded-xl px-4 py-3">
                <div>
                  <p className="text-white text-sm font-bold">Visible en el Home</p>
                  <p className="text-gray-500 text-[11px]">Desactivar oculta la saga sin borrarla.</p>
                </div>
                <button onClick={() => setForm(f => ({ ...f, active: !f.active }))}
                  className={`flex-shrink-0 w-10 h-6 rounded-full relative transition-colors ${form.active ? "bg-green-600" : "bg-gray-700"}`}>
                  <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${form.active ? "left-5" : "left-1"}`} />
                </button>
              </div>
            </div>

            <div className="p-6 border-t border-brand-border flex items-center justify-between gap-3">
              {editing && (
                <button onClick={() => handleDelete(editing)} className="px-4 py-2.5 rounded-xl text-sm font-bold bg-red-900/20 border border-red-800/20 text-red-400 hover:bg-red-900/40 transition-all">
                  Eliminar saga
                </button>
              )}
              <div className="flex gap-3 ml-auto">
                <button onClick={closeModal} className="px-4 py-2.5 rounded-xl text-sm font-bold bg-brand-surface border border-brand-border text-gray-400 hover:text-white transition-all">Cancelar</button>
                <button onClick={handleSave} disabled={saving} className="px-6 py-2.5 rounded-xl text-sm font-bold bg-brand-red text-white hover:bg-red-700 transition-all disabled:opacity-50 flex items-center gap-2">
                  {saving && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                  {creating ? "Crear saga" : "Guardar cambios"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function SagaManager() {
  const [tab, setTab] = useState<Tab>("configured");
  const { data: sagaConfig = [] } = useQuery({
    queryKey: ["saga-config"],
    queryFn: getSagaConfig,
    staleTime: 5 * 60 * 1000,
  });

  return (
    <AdminLayout title="Gestión de Sagas">
      <div className="max-w-7xl mx-auto space-y-8 pb-20">
        {/* Header */}
        <div className="space-y-1">
          <h1 className="text-3xl font-black text-white tracking-tight">Gestión de Sagas</h1>
          <p className="text-gray-500 text-sm max-w-xl">Configura, edita y sincroniza las sagas que aparecen en el Home.</p>
        </div>

        {/* Tabs */}
        <div className="flex flex-wrap gap-2">
          <TabButton active={tab === "configured"} onClick={() => setTab("configured")}>📋 Sagas configuradas</TabButton>
          <TabButton active={tab === "explore"} onClick={() => setTab("explore")}>🔍 Explorar TMDB</TabButton>
          <TabButton active={tab === "sync"} onClick={() => setTab("sync")}>🔄 Sincronizar BD</TabButton>
          <TabButton active={tab === "config"} onClick={() => setTab("config")}>⚙️ Configuración</TabButton>
        </div>

        {tab === "configured" && <ConfiguredSagasTab sagaConfig={sagaConfig} />}
        {tab === "explore" && <ExploreTab />}
        {tab === "sync" && <SyncTab sagaConfig={sagaConfig} />}
        {tab === "config" && <ConfigTab />}
      </div>
    </AdminLayout>
  );
}
