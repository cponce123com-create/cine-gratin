import { useState, useEffect, useCallback } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import {
  getSportChannels,
  addSportChannel,
  deleteSportChannel,
  syncSportChannel,
  syncAllSportChannels,
  getSportsSettings,
  saveSportsSettings,
  deleteSportMatch,
  getSportMatches,
  type SportChannel,
  type SportMatch,
} from "@/lib/sports-api";

// ─── Icons ────────────────────────────────────────────────────────────────────

function SyncIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" strokeLinecap="round" />
      <path d="M21 3v5h-5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" strokeLinecap="round" />
      <path d="M8 16H3v5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="3 6 5 6 21 6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M19 6l-1 14H6L5 6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 11v6M14 11v6" strokeLinecap="round" />
      <path d="M9 6V4h6v2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="12" y1="5" x2="12" y2="19" strokeLinecap="round" />
      <line x1="5" y1="12" x2="19" y2="12" strokeLinecap="round" />
    </svg>
  );
}

function KeyIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="7.5" cy="15.5" r="5.5" />
      <path d="M21 2l-9.6 9.6" strokeLinecap="round" />
      <path d="M15.5 7.5l3 3L22 7l-3-3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─── Settings section ─────────────────────────────────────────────────────────

function SettingsSection() {
  const [apiKey, setApiKey] = useState("");
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [show, setShow] = useState(false);

  useEffect(() => {
    getSportsSettings()
      .then((s) => {
        if (s["youtube_api_key"]) setApiKey(s["youtube_api_key"]);
      })
      .catch(() => {});
  }, []);

  const handleSave = async () => {
    if (!apiKey.trim()) return;
    setLoading(true);
    try {
      await saveSportsSettings({ youtube_api_key: apiKey.trim() });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-brand-card border border-brand-border rounded-2xl p-6 space-y-4">
      <div className="flex items-center gap-2">
        <KeyIcon />
        <h2 className="text-white font-bold text-base">API Key de YouTube</h2>
      </div>
      <p className="text-gray-500 text-sm">
        Necesitas una API Key de{" "}
        <a
          href="https://console.cloud.google.com"
          target="_blank"
          rel="noreferrer"
          className="text-brand-red hover:underline"
        >
          Google Cloud Console
        </a>{" "}
        con <strong className="text-gray-400">YouTube Data API v3</strong> habilitada.
      </p>
      <div className="flex gap-2">
        <input
          type={show ? "text" : "password"}
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="AIzaSy..."
          className="flex-1 bg-brand-surface border border-brand-border rounded-lg px-4 py-2.5 text-gray-200 placeholder-gray-600 text-sm font-mono focus:outline-none focus:border-gray-500"
        />
        <button
          onClick={() => setShow((v) => !v)}
          className="px-3 text-gray-500 hover:text-gray-300 border border-brand-border rounded-lg bg-brand-surface transition-colors text-xs"
        >
          {show ? "Ocultar" : "Ver"}
        </button>
        <button
          onClick={handleSave}
          disabled={loading || !apiKey.trim()}
          className="flex items-center gap-2 bg-brand-red hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold py-2 px-4 rounded-lg transition-colors text-sm"
        >
          {loading ? (
            <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin block" />
          ) : saved ? (
            "✓ Guardada"
          ) : (
            "Guardar"
          )}
        </button>
      </div>
    </div>
  );
}

// ─── Channels section ─────────────────────────────────────────────────────────

function ChannelsSection({
  onSynced,
}: {
  onSynced: () => void;
}) {
  const [channels, setChannels] = useState<SportChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<number | "all" | null>(null);
  const [syncResult, setSyncResult] = useState<{ msg: string; error?: boolean } | null>(null);

  // Add form state
  const [form, setForm] = useState({ name: "", url: "", keyword: "FULL MATCH" });
  const [adding, setAdding] = useState(false);
  const [formError, setFormError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setChannels(await getSportChannels());
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleAdd = async () => {
    if (!form.name.trim() || !form.url.trim()) {
      setFormError("Nombre y URL son obligatorios.");
      return;
    }
    setAdding(true);
    setFormError("");
    try {
      await addSportChannel(form);
      setForm({ name: "", url: "", keyword: "FULL MATCH" });
      await load();
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : "Error al añadir canal.");
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("¿Eliminar este canal y todos sus partidos?")) return;
    try {
      await deleteSportChannel(id);
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
      const r = await syncSportChannel(id);
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
      const r = await syncAllSportChannels();
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

  return (
    <div className="bg-brand-card border border-brand-border rounded-2xl p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-white font-bold text-base mb-1">Canales de YouTube</h2>
          <p className="text-gray-500 text-sm">
            Añade canales y sincroniza sus partidos completos automáticamente.
          </p>
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

      {/* Add form */}
      <div className="bg-brand-surface border border-brand-border rounded-xl p-4 space-y-3">
        <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider">
          Añadir nuevo canal
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <input
            type="text"
            placeholder="Nombre (ej: UEFA)"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            className="bg-brand-card border border-brand-border rounded-lg px-3 py-2 text-gray-200 placeholder-gray-600 text-sm focus:outline-none focus:border-gray-500"
          />
          <input
            type="text"
            placeholder="https://www.youtube.com/@UEFA"
            value={form.url}
            onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
            className="bg-brand-card border border-brand-border rounded-lg px-3 py-2 text-gray-200 placeholder-gray-600 text-sm font-mono focus:outline-none focus:border-gray-500"
          />
          <input
            type="text"
            placeholder='Keyword (por defecto "FULL MATCH")'
            value={form.keyword}
            onChange={(e) => setForm((f) => ({ ...f, keyword: e.target.value }))}
            className="bg-brand-card border border-brand-border rounded-lg px-3 py-2 text-gray-200 placeholder-gray-600 text-sm focus:outline-none focus:border-gray-500"
          />
        </div>
        {formError && (
          <p className="text-red-400 text-xs">{formError}</p>
        )}
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

      {/* Sync result */}
      {syncResult && (
        <div
          className={`px-4 py-3 rounded-lg text-sm border ${
            syncResult.error
              ? "bg-red-900/20 border-red-800/40 text-red-400"
              : "bg-green-900/20 border-green-800/40 text-green-400"
          }`}
        >
          {syncResult.msg}
        </div>
      )}

      {/* Channels list */}
      {loading ? (
        <div className="flex justify-center py-8">
          <span className="w-8 h-8 border-2 border-brand-red border-t-transparent rounded-full animate-spin block" />
        </div>
      ) : channels.length === 0 ? (
        <div className="text-center py-8 text-gray-600 text-sm">
          No hay canales configurados. Añade uno arriba.
        </div>
      ) : (
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
      )}
    </div>
  );
}

// ─── Matches section ──────────────────────────────────────────────────────────

function MatchesSection({ refreshKey }: { refreshKey: number }) {
  const [matches, setMatches] = useState<SportMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getSportMatches({ q: query || undefined, limit: 100 });
      setMatches(data);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [query, refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    load();
  }, [load]);

  const handleDelete = async (id: number) => {
    if (!confirm("¿Eliminar este partido del catálogo?")) return;
    await deleteSportMatch(id);
    setMatches((prev) => prev.filter((m) => m.id !== id));
  };

  return (
    <div className="bg-brand-card border border-brand-border rounded-2xl p-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-white font-bold text-base mb-1">
            Partidos importados{" "}
            <span className="text-gray-500 font-normal text-sm">({matches.length})</span>
          </h2>
          <p className="text-gray-500 text-sm">
            Todos los partidos guardados en la base de datos.
          </p>
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && setQuery(search)}
            placeholder="Buscar partido..."
            className="bg-brand-surface border border-brand-border rounded-lg px-3 py-2 text-gray-200 placeholder-gray-600 text-sm focus:outline-none focus:border-gray-500 w-48"
          />
          <button
            onClick={() => setQuery(search)}
            className="bg-brand-surface border border-brand-border hover:border-gray-500 text-gray-300 hover:text-white text-sm font-semibold py-2 px-3 rounded-lg transition-colors"
          >
            Buscar
          </button>
          {query && (
            <button
              onClick={() => { setSearch(""); setQuery(""); }}
              className="text-gray-500 hover:text-gray-300 text-sm transition-colors"
            >
              Limpiar
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <span className="w-8 h-8 border-2 border-brand-red border-t-transparent rounded-full animate-spin block" />
        </div>
      ) : matches.length === 0 ? (
        <div className="text-center py-8 text-gray-600 text-sm">
          {query ? "No se encontraron partidos con ese filtro." : "No hay partidos importados aún."}
        </div>
      ) : (
        <div className="border border-brand-border rounded-xl overflow-hidden">
          <div className="max-h-[500px] overflow-y-auto divide-y divide-brand-border">
            {matches.map((m) => (
              <div
                key={m.id}
                className="flex items-center gap-4 px-4 py-3 hover:bg-brand-surface/30 transition-colors"
              >
                {m.thumbnail && (
                  <img
                    src={m.thumbnail}
                    alt=""
                    className="w-16 h-10 object-cover rounded flex-shrink-0 bg-brand-surface"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-gray-200 text-sm font-medium truncate">{m.title}</div>
                  <div className="text-gray-600 text-xs flex gap-3 mt-0.5">
                    <span>{m.channel_name}</span>
                    {m.published_at && (
                      <span>{new Date(m.published_at).toLocaleDateString("es-ES")}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <a
                    href={`https://www.youtube.com/watch?v=${m.yt_id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-gray-500 hover:text-brand-red transition-colors font-mono"
                  >
                    {m.yt_id}
                  </a>
                  <button
                    onClick={() => handleDelete(m.id)}
                    className="p-1.5 text-gray-600 hover:text-red-400 transition-colors rounded-lg hover:bg-red-900/20"
                  >
                    <TrashIcon />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SportChannels() {
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-black text-white">⚽ Deportes — Partidos de Fútbol</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            Importa partidos completos desde canales de YouTube automáticamente.
          </p>
        </div>

        <SettingsSection />
        <ChannelsSection onSynced={() => setRefreshKey((k) => k + 1)} />
        <MatchesSection refreshKey={refreshKey} />
      </div>
    </AdminLayout>
  );
}
