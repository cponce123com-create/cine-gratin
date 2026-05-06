import { useState, useEffect, useCallback } from "react";
import { SyncIcon, PlusIcon, TrashIcon } from "./icons";
import type { Channel, SyncResult } from "@/lib/channels-api";

interface Props {
  variant: "list" | "table";
  description: string;
  defaultKeyword: string;
  channelNamePlaceholder: string;
  channelUrlPlaceholder: string;
  keywordPlaceholder: string;
  emptyMessage: string;
  getChannels: () => Promise<Channel[]>;
  addChannel: (data: { name: string; url: string; keyword?: string }) => Promise<Channel>;
  deleteChannel: (id: number) => Promise<void>;
  syncChannel: (id: number) => Promise<SyncResult>;
  syncAllChannels: () => Promise<SyncResult>;
  onSynced: () => void;
}

export default function YouTubeChannelsSection({
  variant,
  description,
  defaultKeyword,
  channelNamePlaceholder,
  channelUrlPlaceholder,
  keywordPlaceholder,
  emptyMessage,
  getChannels,
  addChannel,
  deleteChannel,
  syncChannel,
  syncAllChannels,
  onSynced,
}: Props) {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<number | "all" | null>(null);
  const [syncResult, setSyncResult] = useState<{ msg: string; error?: boolean } | null>(null);

  // Add form state
  const [form, setForm] = useState({ name: "", url: "", keyword: defaultKeyword });
  const [adding, setAdding] = useState(false);
  const [formError, setFormError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setChannels(await getChannels());
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [getChannels]);

  useEffect(() => {
    load();
  }, [load]);

  // Keep defaultKeyword in sync when prop changes
  useEffect(() => {
    setForm((f) => ({ ...f, keyword: defaultKeyword }));
  }, [defaultKeyword]);

  const handleAdd = async () => {
    if (!form.name.trim() || !form.url.trim()) {
      setFormError("Nombre y URL son obligatorios.");
      return;
    }
    setAdding(true);
    setFormError("");
    try {
      await addChannel(form);
      setForm({ name: "", url: "", keyword: defaultKeyword });
      await load();
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : "Error al añadir canal.");
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (id: number) => {
    const msg = variant === "table"
      ? "¿Eliminar este canal y todos sus partidos?"
      : "¿Eliminar este canal y todos sus eventos?";
    if (!confirm(msg)) return;
    try {
      await deleteChannel(id);
      await load();
      onSynced();
    } catch {
      // silent
    }
  };

  const handleSync = async (id: number) => {
    setSyncing(id);
    setSyncResult(null);
    try {
      const r = await syncChannel(id);
      setSyncResult({
        msg: `✓ ${r.imported} importados, ${r.existed} ya existían`,
      });
      onSynced();
    } catch (e: unknown) {
      setSyncResult({
        msg: e instanceof Error ? e.message : "Error al sincronizar",
        error: true,
      });
    } finally {
      setSyncing(null);
    }
  };

  const handleSyncAll = async () => {
    setSyncing("all");
    setSyncResult(null);
    try {
      const r = await syncAllChannels();
      setSyncResult({
        msg: `✓ Sincronización completa: ${r.imported} importados, ${r.existed} ya existían${
          r.errors?.length ? ` — ${r.errors.length} errores` : ""
        }`,
      });
      onSynced();
    } catch (e: unknown) {
      setSyncResult({
        msg: e instanceof Error ? e.message : "Error al sincronizar",
        error: true,
      });
    } finally {
      setSyncing(null);
    }
  };

  // ─── Shared form ──────────────────────────────────────────────────────────

  const addForm = (
    <div className="bg-brand-surface border border-brand-border rounded-xl p-4 space-y-3">
      <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider">
        Añadir nuevo canal
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <input
          type="text"
          placeholder={channelNamePlaceholder}
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          className="bg-brand-card border border-brand-border rounded-lg px-3 py-2 text-gray-200 placeholder-gray-600 text-sm focus:outline-none focus:border-gray-500"
        />
        <input
          type="text"
          placeholder={channelUrlPlaceholder}
          value={form.url}
          onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
          className="bg-brand-card border border-brand-border rounded-lg px-3 py-2 text-gray-200 placeholder-gray-600 text-sm font-mono focus:outline-none focus:border-gray-500"
        />
        <input
          type="text"
          placeholder={keywordPlaceholder}
          value={form.keyword}
          onChange={(e) => setForm((f) => ({ ...f, keyword: e.target.value }))}
          className="bg-brand-card border border-brand-border rounded-lg px-3 py-2 text-gray-200 placeholder-gray-600 text-sm focus:outline-none focus:border-gray-500"
        />
      </div>
      {formError && <p className="text-red-400 text-xs">{formError}</p>}
      <button
        onClick={handleAdd}
        disabled={adding}
        className="flex items-center gap-2 bg-brand-red hover:bg-red-700 disabled:opacity-40 text-white font-bold py-2 px-4 rounded-lg transition-colors text-sm"
      >
        {adding ? (
          <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin block" />
        ) : (
          <PlusIcon />
        )}
        Añadir canal
      </button>
    </div>
  );

  // ─── Sync result banner ───────────────────────────────────────────────────

  const syncBanner = syncResult && (
    <div
      className={`text-sm font-medium p-3 rounded-lg border ${
        syncResult.error
          ? "bg-red-900/30 border-red-800/40 text-red-400"
          : "bg-green-900/30 border-green-800/40 text-green-400"
      }`}
    >
      {syncResult.msg}
    </div>
  );

  // ─── List variant ─────────────────────────────────────────────────────────

  const renderList = () => (
    <div className="space-y-2">
      {channels.map((ch) => (
        <div
          key={ch.id}
          className="flex items-center justify-between bg-brand-surface border border-brand-border rounded-lg p-3"
        >
          <div className="min-w-0 flex-1">
            <p className="text-white font-semibold text-sm">{ch.name}</p>
            <p className="text-gray-500 text-xs truncate">{ch.url}</p>
            <p className="text-gray-600 text-xs">Keyword: {ch.keyword}</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 ml-3">
            <button
              onClick={() => handleSync(ch.id)}
              disabled={syncing !== null}
              className="flex items-center gap-1 bg-green-900/30 border border-green-800/40 hover:bg-green-900/50 disabled:opacity-40 text-green-400 font-bold py-1 px-2 rounded text-xs transition-colors"
            >
              {syncing === ch.id ? (
                <span className="w-3 h-3 border border-green-400 border-t-transparent rounded-full animate-spin block" />
              ) : (
                <SyncIcon />
              )}
              Sincronizar
            </button>
            <button
              onClick={() => handleDelete(ch.id)}
              disabled={syncing !== null}
              className="flex items-center gap-1 bg-red-900/30 border border-red-800/40 hover:bg-red-900/50 disabled:opacity-40 text-red-400 font-bold py-1 px-2 rounded text-xs transition-colors"
            >
              <TrashIcon />
            </button>
          </div>
        </div>
      ))}
    </div>
  );

  // ─── Table variant ────────────────────────────────────────────────────────

  const renderTable = () => (
    <div className="border border-brand-border rounded-xl overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-brand-border bg-brand-surface/50">
            <th className="text-left px-4 py-3 text-gray-500 text-xs uppercase tracking-wider font-medium">
              Canal
            </th>
            <th className="text-left px-4 py-3 text-gray-500 text-xs uppercase tracking-wider font-medium hidden sm:table-cell">
              Keyword
            </th>
            <th className="text-right px-4 py-3 text-gray-500 text-xs uppercase tracking-wider font-medium">
              Acciones
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-brand-border">
          {channels.map((ch) => (
            <tr key={ch.id} className="hover:bg-brand-surface/30 transition-colors">
              <td className="px-4 py-3">
                <div className="text-gray-200 font-medium text-sm">{ch.name}</div>
                <div className="text-gray-600 text-xs font-mono truncate max-w-[220px]">
                  {ch.url}
                </div>
              </td>
              <td className="px-4 py-3 hidden sm:table-cell">
                <span className="text-xs bg-brand-surface border border-brand-border text-gray-400 px-2 py-1 rounded">
                  {ch.keyword}
                </span>
              </td>
              <td className="px-4 py-3 text-right">
                <div className="flex items-center justify-end gap-2">
                  <button
                    onClick={() => handleSync(ch.id)}
                    disabled={syncing !== null}
                    className="flex items-center gap-1.5 bg-brand-surface border border-brand-border hover:border-gray-500 disabled:opacity-40 text-gray-300 hover:text-white text-xs font-semibold py-1.5 px-3 rounded-lg transition-colors"
                  >
                    {syncing === ch.id ? (
                      <span className="w-3.5 h-3.5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin block" />
                    ) : (
                      <SyncIcon />
                    )}
                    Sincronizar
                  </button>
                  <button
                    onClick={() => handleDelete(ch.id)}
                    className="p-1.5 text-gray-600 hover:text-red-400 transition-colors rounded-lg hover:bg-red-900/20"
                  >
                    <TrashIcon />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  // ─── Loading / Empty / Content ────────────────────────────────────────────

  const renderBody = () => {
    if (loading) {
      return (
        <div className="flex justify-center py-8">
          <span className="w-5 h-5 rounded-full border-2 border-brand-red border-t-transparent animate-spin block" />
        </div>
      );
    }

    if (channels.length === 0) {
      return <p className="text-gray-500 text-sm text-center py-8">{emptyMessage}</p>;
    }

    return variant === "table" ? renderTable() : renderList();
  };

  // ─── Main render ──────────────────────────────────────────────────────────

  return (
    <div className="bg-brand-card border border-brand-border rounded-2xl p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-white font-bold text-base mb-1">Canales de YouTube</h2>
          <p className="text-gray-500 text-sm">{description}</p>
        </div>
        {channels.length > 0 && (
          <button
            onClick={handleSyncAll}
            disabled={syncing !== null}
            className="flex items-center gap-2 bg-green-900/30 border border-green-800/40 hover:bg-green-900/50 disabled:opacity-40 text-green-400 font-bold py-2 px-4 rounded-lg transition-colors text-sm"
          >
            {syncing === "all" ? (
              <span className="w-4 h-4 border-2 border-green-400 border-t-transparent rounded-full animate-spin block" />
            ) : (
              <SyncIcon />
            )}
            Sincronizar todos
          </button>
        )}
      </div>

      {addForm}
      {syncBanner}
      {renderBody()}
    </div>
  );
}
