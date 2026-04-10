import React, { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import AdminLayout from "@/components/admin/AdminLayout";
import { getMovies, getSeries, updateCollection } from "@/lib/api";
import { SAGA_SECTIONS } from "@/lib/homeConfig";
import type { Movie, Series } from "@/lib/types";

// ── Helpers (same logic as Home.tsx) ─────────────────────────────────────────

function normalizeStr(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/&/g, "and").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}
function matchesKeywords(title: string, keywords: string[]): boolean {
  const n = normalizeStr(title);
  return keywords.some((k) => n.includes(normalizeStr(k)));
}

type MediaItem = (Movie | Series) & { _type: "movie" | "series" };

// ── Main component ────────────────────────────────────────────────────────────

export default function ManageSagas() {
  const qc = useQueryClient();
  const { data: movies = [] } = useQuery({ queryKey: ["movies"], queryFn: () => getMovies() });
  const { data: series = [] } = useQuery({ queryKey: ["series"], queryFn: () => getSeries() });

  const [selectedSagaId, setSelectedSagaId] = useState(SAGA_SECTIONS[0]?.id ?? "");
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");

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
      ? allItems.filter((item) =>
          item.title.toLowerCase().includes(sq) &&
          !assigned.some((a) => a.id === item.id) &&
          !keywordOnly.some((k) => k.id === item.id)
        )
      : [];

    return { assigned, keywordOnly, searchResults };
  }, [allItems, saga, search]);

  const doUpdate = async (items: MediaItem[], collectionId: number | null, collectionName: string | null) => {
    const ids = new Set(items.map((i) => String(i.id)));
    setSavingIds(ids);
    try {
      await updateCollection(items.map((item) => ({
        id: String(item.id),
        type: item._type,
        collection_id: collectionId,
        collection_name: collectionName,
      })));
      await qc.invalidateQueries({ queryKey: ["movies"] });
      await qc.invalidateQueries({ queryKey: ["series"] });
      toast.success(collectionId === -1 ? "Excluido de sagas" : collectionId ? "Asignado a saga" : "Quitado de saga");
    } catch (e) {
      console.error("doUpdate error:", e);
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

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-black text-white">Gestión de Sagas</h1>
          <p className="text-gray-400 text-sm mt-1">
            Controla qué películas y series pertenecen a cada saga o colección.
          </p>
        </div>

        {/* Saga selector */}
        <div className="flex flex-wrap gap-2">
          {SAGA_SECTIONS.map((sec) => (
            <button
              key={sec.id}
              onClick={() => { setSelectedSagaId(sec.id); setSearch(""); }}
              className={`px-3 py-1.5 rounded-full text-xs font-bold transition-colors border ${
                selectedSagaId === sec.id
                  ? "bg-brand-red border-brand-red text-white"
                  : "bg-brand-surface border-brand-border text-gray-400 hover:text-white"
              }`}
            >
              {sec.label}
            </button>
          ))}
        </div>

        {saga && (
          <>
            {/* Saga info */}
            <div className="bg-brand-card border border-brand-border rounded-xl p-4 flex items-center justify-between gap-4 flex-wrap">
              <div>
                <h2 className="text-lg font-bold text-white">{saga.label}</h2>
                {saga.collection_id && (
                  <span className="text-xs text-gray-500">
                    TMDB collection_id: <span className="text-brand-gold font-mono">{saga.collection_id}</span>
                  </span>
                )}
              </div>
              <div className="flex gap-4 text-sm">
                <span className="text-green-400 font-bold">{assigned.length} asignadas</span>
                {keywordOnly.length > 0 && (
                  <span className="text-yellow-400 font-bold">{keywordOnly.length} sin asignar (keyword)</span>
                )}
              </div>
            </div>

            {/* Assigned items */}
            <Section
              title={`Asignadas por colección (${assigned.length})`}
              color="green"
              emptyMsg="No hay títulos asignados a esta saga por collection_id."
            >
              {assigned.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  saving={savingIds.has(String(item.id))}
                  actions={[
                    { label: "Quitar de saga", color: "red", onClick: () => removeFromSaga(item) },
                    { label: "Excluir de sagas", color: "yellow", onClick: () => excludeFromSagas(item) },
                  ]}
                />
              ))}
            </Section>

            {/* Keyword-only items */}
            {keywordOnly.length > 0 && (
              <Section
                title={`Por palabras clave — sin collection_id (${keywordOnly.length})`}
                color="yellow"
                emptyMsg=""
                headerAction={
                  saga.collection_id ? (
                    <button
                      onClick={assignAllKeyword}
                      disabled={savingIds.size > 0}
                      className="text-xs font-bold text-brand-gold hover:text-yellow-300 transition-colors disabled:opacity-50"
                    >
                      Asignar todos →
                    </button>
                  ) : undefined
                }
              >
                <p className="text-xs text-yellow-500/80 mb-3 -mt-1">
                  Estos títulos aparecen en la saga porque su nombre coincide con las palabras clave, pero no tienen
                  collection_id asignado. Asígnalos para confirmarlos, o exclúyelos si no corresponden.
                </p>
                {keywordOnly.map((item) => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    saving={savingIds.has(String(item.id))}
                    actions={[
                      ...(saga.collection_id
                        ? [{ label: "Asignar a saga", color: "green" as const, onClick: () => assignToSaga(item) }]
                        : []),
                      { label: "Excluir de sagas", color: "yellow", onClick: () => excludeFromSagas(item) },
                    ]}
                  />
                ))}
              </Section>
            )}

            {/* Search & add */}
            <div className="bg-brand-card border border-brand-border rounded-xl p-4 space-y-3">
              <h3 className="text-sm font-bold text-white">Buscar y agregar</h3>
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
                          ? [{ label: "Agregar a saga", color: "green" as const, onClick: () => assignToSaga(item) }]
                          : []),
                        { label: "Excluir de sagas", color: "yellow", onClick: () => excludeFromSagas(item) },
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
  title, color, emptyMsg, children, headerAction,
}: {
  title: string;
  color: "green" | "yellow";
  emptyMsg: string;
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
      ) : children}
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
    <div className={`flex items-center gap-3 ${compact ? "py-1" : "py-2"} border-b border-brand-border/40 last:border-0`}>
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
          {item.collection_id && item.collection_id !== -1
            ? <span className="text-brand-gold ml-1">· col:{item.collection_id}</span>
            : null}
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

