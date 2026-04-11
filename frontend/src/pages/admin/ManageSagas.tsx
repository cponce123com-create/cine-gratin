import React, { useState, useMemo, useRef, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import AdminLayout from "@/components/admin/AdminLayout";
import { getMovies, getSeries, updateCollection, importCollection, resetCollection } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { SAGA_SECTIONS } from "@/lib/homeConfig";
import type { Movie, Series } from "@/lib/types";

// ── Constants ─────────────────────────────────────────────────────────────────

const BASE_URL =
  (import.meta.env["VITE_API_URL"] as string | undefined) ||
  "https://cine-gratin.onrender.com";

// ── Types ─────────────────────────────────────────────────────────────────────

type MediaItem = (Movie | Series) & { _type: "movie" | "series" };

type SyncMode = "idle" | "importing" | "resetting" | "syncing" | "syncing-all";

interface SyncProgress {
  done: number;
  total: number;
  lastTitle: string;
  updated: number;
  errors: number;
}

// ── Helpers (must match Home.tsx logic exactly) ───────────────────────────────

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
    // Single-word: word-boundary check (same as Home.tsx) to avoid
    // "wick" matching "wicked", "bond" matching "bonding", etc.
    return new RegExp(`(?:^|\\s)${nk}(?:\\s|$)`).test(n);
  });
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token
    ? { "Content-Type": "application/json", Authorization: `Bearer ${token}` }
    : { "Content-Type": "application/json" };
}

// ── SSE helper: open a GET SSE stream and return a cancel fn ──────────────────

function openSSE(
  url: string,
  onProgress: (data: Record<string, unknown>) => void,
  onDone: (data: Record<string, unknown>) => void,
  onError: (msg: string) => void
): () => void {
  // Attach token as query param because EventSource doesn't support custom headers
  const token = getToken();
  const fullUrl = token ? `${url}${url.includes("?") ? "&" : "?"}token=${token}` : url;
  const es = new EventSource(`${BASE_URL}${fullUrl}`);

  es.addEventListener("progress", (e) => {
    try { onProgress(JSON.parse((e as MessageEvent).data) as Record<string, unknown>); } catch { /* ignore */ }
  });
  es.addEventListener("done", (e) => {
    es.close();
    try { onDone(JSON.parse((e as MessageEvent).data) as Record<string, unknown>); } catch { onDone({}); }
  });
  es.addEventListener("error", (e) => {
    es.close();
    try { onError(JSON.parse((e as MessageEvent & { data?: string }).data ?? "{}").message ?? "Error desconocido"); } catch { onError("Error en stream"); }
  });
  es.onerror = () => { es.close(); onError("Conexión SSE perdida"); };

  return () => es.close();
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ManageSagas() {
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

  const [selectedSagaId, setSelectedSagaId] = useState(SAGA_SECTIONS[0]?.id ?? "");
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [syncMode, setSyncMode] = useState<SyncMode>("idle");
  const [progress, setProgress] = useState<SyncProgress | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const cancelRef = useRef<(() => void) | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  const saga = SAGA_SECTIONS.find((s) => s.id === selectedSagaId)!;

  const allItems: MediaItem[] = useMemo(() => [
    ...(movies as Movie[]).map((m) => ({ ...m, _type: "movie" as const })),
    ...(series as Series[]).map((s) => ({ ...s, _type: "series" as const })),
  ], [movies, series]);

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
      ? allItems.filter(
          (item) =>
            item.title.toLowerCase().includes(sq) &&
            !assigned.some((a) => a.id === item.id) &&
            !keywordOnly.some((k) => k.id === item.id)
        )
      : [];

    return { assigned, keywordOnly, searchResults };
  }, [allItems, saga, search]);

  // ── Invalidate queries after any mutation ───────────────────────────────────

  const refreshAll = useCallback(async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["movies-all"] }),
      qc.invalidateQueries({ queryKey: ["series-all"] }),
      qc.invalidateQueries({ queryKey: ["movies"] }),
      qc.invalidateQueries({ queryKey: ["series"] }),
    ]);
  }, [qc]);

  // ── Manual assign / remove ──────────────────────────────────────────────────

  const doUpdate = async (
    items: MediaItem[],
    collectionId: number | null,
    collectionName: string | null
  ) => {
    const ids = new Set(items.map((i) => String(i.id)));
    setSavingIds(ids);
    try {
      await updateCollection(
        items.map((item) => ({
          id: String(item.id),
          type: item._type,
          collection_id: collectionId,
          collection_name: collectionName,
        }))
      );
      await refreshAll();
      toast.success(
        collectionId === -1
          ? "Excluido de sagas"
          : collectionId
          ? "Asignado a saga"
          : "Quitado de saga"
      );
    } catch (e) {
      toast.error("Error al actualizar");
    } finally {
      setSavingIds(new Set());
    }
  };

  const removeFromSaga = (item: MediaItem) => doUpdate([item], null, null);
  const excludeFromSagas = (item: MediaItem) => doUpdate([item], -1, null);
  const assignToSaga = (item: MediaItem) =>
    doUpdate([item], saga.collection_id ?? null, saga.label);
  const assignAllKeyword = () =>
    doUpdate(keywordOnly, saga.collection_id ?? null, saga.label);

  // ── TMDB Import: pull all movies for this collection from TMDB ──────────────

  const handleImport = async () => {
    if (!saga.collection_id) {
      toast.error("Esta saga no tiene collection_id de TMDB configurado.");
      return;
    }
    setSyncMode("importing");
    setProgress(null);
    setLog([`▶ Importando colección ${saga.collection_id} — ${saga.label}…`]);
    try {
      const result = await importCollection(saga.collection_id);
      setLog((l) => [
        ...l,
        `✅ Importadas: ${result.imported} | Ya existían: ${result.existed} | Total TMDB: ${result.total}`,
        ...(result.titles.length > 0 ? [`   Nuevas: ${result.titles.join(", ")}`] : []),
      ]);
      toast.success(`Importación completa: ${result.imported} nuevas, ${result.existed} ya existían`);
      await refreshAll();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setLog((l) => [...l, `❌ Error: ${msg}`]);
      toast.error(msg);
    } finally {
      setSyncMode("idle");
    }
  };

  // ── Reset + Re-import: delete all from this collection, then re-import ──────

  const handleReset = async () => {
    if (!saga.collection_id) {
      toast.error("Esta saga no tiene collection_id de TMDB configurado.");
      return;
    }
    if (
      !window.confirm(
        `¿Eliminar TODAS las películas/series de "${saga.label}" (collection_id ${saga.collection_id}) y volver a importar desde TMDB?\n\nEsta acción no se puede deshacer.`
      )
    )
      return;

    setSyncMode("resetting");
    setProgress(null);
    setLog([`🗑 Eliminando entradas de colección ${saga.collection_id}…`]);
    try {
      const del = await resetCollection(saga.collection_id);
      setLog((l) => [
        ...l,
        `   Eliminadas: ${del.deleted_movies} películas, ${del.deleted_series} series`,
        `▶ Re-importando desde TMDB…`,
      ]);

      const result = await importCollection(saga.collection_id);
      setLog((l) => [
        ...l,
        `✅ Importadas: ${result.imported} | Ya existían: ${result.existed} | Total TMDB: ${result.total}`,
        ...(result.titles.length > 0 ? [`   Títulos: ${result.titles.join(", ")}`] : []),
      ]);
      toast.success(`Reset completo. ${result.imported} importadas.`);
      await refreshAll();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setLog((l) => [...l, `❌ Error: ${msg}`]);
      toast.error(msg);
    } finally {
      setSyncMode("idle");
    }
  };

  // ── Sync: update collection_id on existing movies via SSE ──────────────────

  const handleSyncSaga = () => {
    if (!saga.collection_id) {
      toast.error("Esta saga no tiene collection_id de TMDB configurado.");
      return;
    }
    setSyncMode("syncing");
    setProgress({ done: 0, total: 0, lastTitle: "", updated: 0, errors: 0 });
    setLog([`🔄 Sincronizando collection_ids para "${saga.label}"…`]);

    cancelRef.current = openSSE(
      `/api/admin/scan-collections-stream?ids=${saga.collection_id}`,
      (data) => {
        const title = String(data.collection ?? data.title ?? "");
        const updated = Number(data.updated ?? 0);
        const errors = Number(data.error ?? 0);
        const done = Number(data.i ?? 0);
        const total = Number(data.total ?? 0);
        setProgress({ done, total, lastTitle: title, updated, errors });
        setLog((l) => {
          const line = `[${done}/${total}] ${title} — ${String(data.status ?? "")}`;
          return l.length > 200 ? [...l.slice(-150), line] : [...l, line];
        });
        setTimeout(() => logEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
      },
      async (data) => {
        setLog((l) => [
          ...l,
          `✅ Sincronización completa — ${Number(data.updated ?? 0)} películas actualizadas, ${Number(data.error ?? 0)} errores`,
        ]);
        setSyncMode("idle");
        toast.success("Sincronización completa");
        await refreshAll();
      },
      (msg) => {
        setLog((l) => [...l, `❌ Error SSE: ${msg}`]);
        setSyncMode("idle");
        toast.error(msg);
      }
    );
  };

  // ── Sync ALL movies in DB against TMDB (full collection_id repair) ────────────

  const handleSyncAllDB = () => {
    if (
      !window.confirm(
        `¿Sincronizar collection_ids de TODAS las películas en la BD consultando TMDB una a una?\n\nEsto puede tardar varios minutos dependiendo del tamaño de la BD.`
      )
    )
      return;

    setSyncMode("syncing-all");
    setProgress({ done: 0, total: 0, lastTitle: "", updated: 0, errors: 0 });
    setLog([`🔄 Escaneando TODAS las películas en BD para actualizar collection_ids…`]);

    cancelRef.current = openSSE(
      `/api/admin/sync-all-collections-stream`,
      (data) => {
        const title = String(data.title ?? "");
        const updated = Number(data.updated ?? 0);
        const errors = Number(data.error ?? 0);
        const done = Number(data.i ?? 0);
        const total = Number(data.total ?? 0);
        setProgress({ done, total, lastTitle: title, updated, errors });
        const status = String(data.status ?? "");
        if (status === "updated" || status === "cleared") {
          const detail = status === "updated"
            ? `→ col:${Number(data.collection_id ?? 0)} ${String(data.collection ?? "")}`
            : `→ sin colección (limpiado)`;
          setLog((l) => {
            const line = `[${done}/${total}] ${title} ${detail}`;
            return l.length > 500 ? [...l.slice(-400), line] : [...l, line];
          });
          setTimeout(() => logEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
        }
      },
      async (data) => {
        setLog((l) => [
          ...l,
          `✅ Escaneo completo — ${Number(data.updated ?? 0)} actualizadas, ${Number(data.skipped ?? 0)} sin cambio, ${Number(data.error ?? 0)} errores`,
        ]);
        setSyncMode("idle");
        toast.success(`Sync BD completo: ${Number(data.updated ?? 0)} colecciones actualizadas`);
        await refreshAll();
      },
      (msg) => {
        setLog((l) => [...l, `❌ Error SSE: ${msg}`]);
        setSyncMode("idle");
        toast.error(msg);
      }
    );
  };



  const handleSyncAll = () => {
    const allIds = SAGA_SECTIONS.filter((s) => s.collection_id).map((s) => s.collection_id!);
    if (allIds.length === 0) {
      toast.error("No hay sagas con collection_id configurado.");
      return;
    }
    if (
      !window.confirm(
        `¿Sincronizar los collection_ids de TODAS las sagas (${allIds.length}) en la base de datos?\n\nEsto actualiza qué películas ya en la BD pertenecen a cada colección.`
      )
    )
      return;

    setSyncMode("syncing-all");
    setProgress({ done: 0, total: allIds.length, lastTitle: "", updated: 0, errors: 0 });
    setLog([`🔄 Sincronizando TODAS las sagas (${allIds.length} colecciones)…`]);

    cancelRef.current = openSSE(
      `/api/admin/scan-collections-stream?ids=${allIds.join(",")}`,
      (data) => {
        const title = String(data.collection ?? data.title ?? "");
        const updated = Number(data.updated ?? 0);
        const errors = Number(data.error ?? 0);
        const done = Number(data.i ?? 0);
        const total = Number(data.total ?? allIds.length);
        setProgress({ done, total, lastTitle: title, updated, errors });
        setLog((l) => {
          const line = `[${done}/${total}] ${title} — ${String(data.status ?? "")} (${Number(data.movies_updated ?? 0)} actualizadas)`;
          return l.length > 500 ? [...l.slice(-400), line] : [...l, line];
        });
        setTimeout(() => logEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
      },
      async (data) => {
        setLog((l) => [
          ...l,
          `✅ Sync TODAS completo — ${Number(data.updated ?? 0)} películas actualizadas en total, ${Number(data.error ?? 0)} errores`,
        ]);
        setSyncMode("idle");
        toast.success(`Sync completo: ${Number(data.updated ?? 0)} películas actualizadas`);
        await refreshAll();
      },
      (msg) => {
        setLog((l) => [...l, `❌ Error SSE: ${msg}`]);
        setSyncMode("idle");
        toast.error(msg);
      }
    );
  };

  const handleCancel = () => {
    cancelRef.current?.();
    cancelRef.current = null;
    setSyncMode("idle");
    setLog((l) => [...l, "⛔ Cancelado por el usuario"]);
    toast.info("Operación cancelada");
  };

  const isBusy = syncMode !== "idle";
  const isLoading = loadingMovies || loadingSeries;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-white">Gestión de Sagas</h1>
            <p className="text-gray-400 text-sm mt-1">
              Controla qué películas y series pertenecen a cada saga. Usa TMDB para sincronizar colecciones completas.
            </p>
          </div>
          {/* Global buttons */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleSyncAll}
              disabled={isBusy}
              className="px-4 py-2 rounded-lg text-xs font-bold bg-brand-surface border border-brand-border text-purple-400 hover:text-purple-300 hover:border-purple-600 transition-colors disabled:opacity-40"
            >
              🔄 Sincronizar TODAS las sagas
            </button>
            <button
              onClick={handleSyncAllDB}
              disabled={isBusy}
              className="px-4 py-2 rounded-lg text-xs font-bold bg-brand-surface border border-brand-border text-orange-400 hover:text-orange-300 hover:border-orange-600 transition-colors disabled:opacity-40"
              title="Recorre toda la BD y consulta TMDB para reparar collection_ids incorrectos o faltantes"
            >
              🛠 Reparar toda la BD (TMDB)
            </button>
          </div>
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="text-center text-gray-500 text-sm py-6 animate-pulse">
            Cargando películas y series…
          </div>
        )}

        {/* Saga selector */}
        <div className="flex flex-wrap gap-2">
          {SAGA_SECTIONS.map((sec) => {
            const count = allItems.filter(
              (i) => i.collection_id === sec.collection_id && i.collection_id != null
            ).length;
            return (
              <button
                key={sec.id}
                onClick={() => { setSelectedSagaId(sec.id); setSearch(""); setLog([]); setProgress(null); }}
                className={`px-3 py-1.5 rounded-full text-xs font-bold transition-colors border ${
                  selectedSagaId === sec.id
                    ? "bg-brand-red border-brand-red text-white"
                    : "bg-brand-surface border-brand-border text-gray-400 hover:text-white"
                }`}
              >
                {sec.label}
                {count > 0 && (
                  <span className="ml-1.5 text-[10px] opacity-70">({count})</span>
                )}
              </button>
            );
          })}
        </div>

        {saga && (
          <>
            {/* Saga info + action buttons */}
            <div className="bg-brand-card border border-brand-border rounded-xl p-4 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-white">{saga.label}</h2>
                  {saga.collection_id ? (
                    <span className="text-xs text-gray-500">
                      TMDB collection_id:{" "}
                      <a
                        href={`https://www.themoviedb.org/collection/${saga.collection_id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-brand-gold font-mono hover:underline"
                      >
                        {saga.collection_id}
                      </a>
                    </span>
                  ) : (
                    <span className="text-xs text-yellow-600">
                      ⚠ Sin collection_id — solo coincidencia por palabras clave
                    </span>
                  )}
                </div>
                <div className="flex gap-2 text-sm">
                  <span className="text-green-400 font-bold">{assigned.length} asignadas</span>
                  {keywordOnly.length > 0 && (
                    <span className="text-yellow-400 font-bold">
                      {keywordOnly.length} sin asignar
                    </span>
                  )}
                </div>
              </div>

              {/* TMDB Action buttons */}
              {saga.collection_id && (
                <div className="flex flex-wrap gap-2 pt-1 border-t border-brand-border/40">
                  <button
                    onClick={handleImport}
                    disabled={isBusy}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold bg-green-900/40 border border-green-700/50 text-green-400 hover:text-green-300 hover:border-green-500 transition-colors disabled:opacity-40"
                  >
                    ⬇ Importar desde TMDB
                  </button>
                  <button
                    onClick={handleSyncSaga}
                    disabled={isBusy}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-900/40 border border-blue-700/50 text-blue-400 hover:text-blue-300 hover:border-blue-500 transition-colors disabled:opacity-40"
                  >
                    🔄 Sincronizar collection_ids
                  </button>
                  <button
                    onClick={handleReset}
                    disabled={isBusy}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold bg-red-900/40 border border-red-700/50 text-red-400 hover:text-red-300 hover:border-red-600 transition-colors disabled:opacity-40"
                  >
                    🗑 Reset + Re-importar
                  </button>
                  {isBusy && (
                    <button
                      onClick={handleCancel}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold bg-brand-surface border border-brand-border text-gray-400 hover:text-white transition-colors"
                    >
                      ⛔ Cancelar
                    </button>
                  )}
                </div>
              )}

              {/* Button explanations */}
              {saga.collection_id && !isBusy && (
                <p className="text-[11px] text-gray-600 leading-relaxed">
                  <span className="text-green-600">Importar:</span> Descarga de TMDB las películas que faltan en la BD. ·{" "}
                  <span className="text-blue-600">Sincronizar:</span> Actualiza el campo{" "}
                  <code>collection_id</code> en películas ya existentes. ·{" "}
                  <span className="text-red-600">Reset:</span> Elimina todo y vuelve a importar desde cero.
                </p>
              )}
            </div>

            {/* Progress bar */}
            {isBusy && progress && progress.total > 0 && (
              <div className="bg-brand-card border border-brand-border rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between text-xs text-gray-400">
                  <span className="font-bold text-white animate-pulse">
                    {syncMode === "importing"
                      ? "Importando…"
                      : syncMode === "resetting"
                      ? "Reiniciando…"
                      : syncMode === "syncing-all"
                      ? "Sincronizando todas las sagas…"
                      : "Sincronizando…"}
                  </span>
                  <span>
                    {progress.done}/{progress.total}
                  </span>
                </div>
                <div className="w-full bg-brand-surface rounded-full h-2 overflow-hidden">
                  <div
                    className="h-full bg-brand-red rounded-full transition-all duration-300"
                    style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }}
                  />
                </div>
                <div className="flex gap-4 text-xs text-gray-500">
                  {progress.lastTitle && <span className="truncate flex-1">{progress.lastTitle}</span>}
                  <span className="text-green-500 shrink-0">{progress.updated} actualizadas</span>
                  {progress.errors > 0 && (
                    <span className="text-red-500 shrink-0">{progress.errors} errores</span>
                  )}
                </div>
              </div>
            )}

            {/* SSE / operation log */}
            {log.length > 0 && (
              <div className="bg-brand-dark border border-brand-border rounded-xl p-3 max-h-48 overflow-y-auto font-mono text-[11px] leading-relaxed text-gray-400 space-y-0.5">
                {log.map((line, i) => (
                  <div
                    key={i}
                    className={
                      line.startsWith("✅")
                        ? "text-green-400"
                        : line.startsWith("❌")
                        ? "text-red-400"
                        : line.startsWith("⛔")
                        ? "text-yellow-400"
                        : line.startsWith("🗑")
                        ? "text-orange-400"
                        : ""
                    }
                  >
                    {line}
                  </div>
                ))}
                <div ref={logEndRef} />
              </div>
            )}

            {/* Assigned items — these are what actually appear on the home page */}
            <Section
              title={`Títulos en saga — visibles en el home (${assigned.length})`}
              color="green"
              emptyMsg={
                saga.collection_id
                  ? "Ningún título tiene este collection_id asignado aún. Usa 'Candidatos' para asignarlos."
                  : "No hay títulos asignados a esta saga."
              }
            >
              {assigned.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  saving={savingIds.has(String(item.id))}
                  actions={[
                    { label: "Quitar", color: "red", onClick: () => removeFromSaga(item) },
                    { label: "Excluir de sagas", color: "yellow", onClick: () => excludeFromSagas(item) },
                  ]}
                />
              ))}
            </Section>

            {/* Keyword candidates — NOT shown on home (need assignment to appear) */}
            {keywordOnly.length > 0 && (
              <Section
                title={`Candidatos por título — pendientes de asignar (${keywordOnly.length})`}
                color="yellow"
                emptyMsg=""
                headerAction={
                  saga.collection_id ? (
                    <button
                      onClick={assignAllKeyword}
                      disabled={savingIds.size > 0 || isBusy}
                      className="text-xs font-bold text-brand-gold hover:text-yellow-300 transition-colors disabled:opacity-50"
                    >
                      Asignar todos →
                    </button>
                  ) : undefined
                }
              >
                <p className="text-xs text-yellow-500/80 mb-3 -mt-1">
                  {saga.collection_id
                    ? "Estos títulos coinciden por nombre pero aún no tienen collection_id asignado — NO aparecen en el home. Asígnalos para incluirlos, o exclúyelos si no corresponden."
                    : "Estos títulos coinciden por palabras clave. Aparecen en el home, pero puedes excluirlos si no corresponden."}
                </p>
                {keywordOnly.map((item) => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    saving={savingIds.has(String(item.id))}
                    actions={[
                      ...(saga.collection_id
                        ? [
                            {
                              label: "Asignar",
                              color: "green" as const,
                              onClick: () => assignToSaga(item),
                            },
                          ]
                        : []),
                      { label: "Excluir", color: "yellow", onClick: () => excludeFromSagas(item) },
                    ]}
                  />
                ))}
              </Section>
            )}

            {/* Search & add */}
            <div className="bg-brand-card border border-brand-border rounded-xl p-4 space-y-3">
              <h3 className="text-sm font-bold text-white">Buscar y agregar manualmente</h3>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar película o serie por título…"
                className="w-full bg-brand-dark border border-brand-border rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-brand-red"
              />
              {searchResults.length > 0 && (
                <div className="space-y-1 max-h-64 overflow-y-auto">
                  {searchResults.slice(0, 30).map((item) => (
                    <ItemRow
                      key={item.id}
                      item={item}
                      saving={savingIds.has(String(item.id))}
                      compact
                      actions={[
                        ...(saga.collection_id
                          ? [
                              {
                                label: "Agregar",
                                color: "green" as const,
                                onClick: () => assignToSaga(item),
                              },
                            ]
                          : []),
                        {
                          label: "Excluir",
                          color: "yellow",
                          onClick: () => excludeFromSagas(item),
                        },
                      ]}
                    />
                  ))}
                </div>
              )}
              {search.trim() && searchResults.length === 0 && (
                <p className="text-xs text-gray-500">Sin resultados fuera de esta saga.</p>
              )}
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Section({
  title,
  color,
  emptyMsg,
  children,
  headerAction,
}: {
  title: string;
  color: "green" | "yellow";
  emptyMsg: string | React.ReactNode;
  children?: React.ReactNode;
  headerAction?: React.ReactNode;
}) {
  const border = color === "green" ? "border-green-800/40" : "border-yellow-800/40";
  const dot = color === "green" ? "bg-green-500" : "bg-yellow-500";
  return (
    <div className={`bg-brand-card border ${border} rounded-xl p-4 space-y-2`}>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${dot}`} />
          <h3 className="text-sm font-bold text-white">{title}</h3>
        </div>
        {headerAction}
      </div>
      {!React.Children.count(children) && emptyMsg ? (
        <p className="text-xs text-gray-500">{emptyMsg}</p>
      ) : (
        children
      )}
    </div>
  );
}

function ItemRow({
  item,
  saving,
  actions,
  compact = false,
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
    <div
      className={`flex items-center gap-3 ${compact ? "py-1" : "py-2"} border-b border-brand-border/40 last:border-0`}
    >
      {item.poster_url && !compact && (
        <img
          src={item.poster_url}
          alt={item.title}
          className="w-8 h-12 object-cover rounded flex-shrink-0 bg-brand-surface"
        />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white truncate font-medium">{item.title}</p>
        <p className="text-xs text-gray-500">
          {item.year} · {item._type === "movie" ? "Película" : "Serie"}
          {item.collection_id && item.collection_id !== -1 ? (
            <span className="text-brand-gold ml-1">· col:{item.collection_id}</span>
          ) : item.collection_id === -1 ? (
            <span className="text-red-700 ml-1">· excluida</span>
          ) : null}
        </p>
      </div>
      <div className="flex gap-3 flex-shrink-0">
        {saving ? (
          <span className="text-xs text-gray-500 animate-pulse">Guardando…</span>
        ) : (
          actions.map((a) => (
            <button
              key={a.label}
              onClick={a.onClick}
              className={`text-xs font-bold transition-colors ${colorMap[a.color]}`}
            >
              {a.label}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
