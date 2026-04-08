import { useState, useEffect, useCallback } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import {
  getEventChannels,
  addEventChannel,
  deleteEventChannel,
  syncEventChannel,
  syncAllEventChannels,
  getEventsSettings,
  saveEventsSettings,
  deleteEvent,
  getEvents,
  type EventChannel,
  type Event,
} from "@/lib/events-api";

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
    getEventsSettings()
      .then((s) => {
        if (s["youtube_api_key"]) setApiKey(s["youtube_api_key"]);
      })
      .catch(() => {});
  }, []);

  const handleSave = async () => {
    if (!apiKey.trim()) return;
    setLoading(true);
    try {
      await saveEventsSettings({ youtube_api_key: apiKey.trim() });
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
  const [channels, setChannels] = useState<EventChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<number | "all" | null>(null);
  const [syncResult, setSyncResult] = useState<{ msg: string; error?: boolean } | null>(null);

  // Add form state
  const [form, setForm] = useState({ name: "", url: "", keyword: "CONCIERTO" });
  const [adding, setAdding] = useState(false);
  const [formError, setFormError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setChannels(await getEventChannels());
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
      await addEventChannel(form);
      setForm({ name: "", url: "", keyword: "CONCIERTO" });
      await load();
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : "Error al añadir canal.");
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("¿Eliminar este canal y todos sus eventos?")) return;
    try {
      await deleteEventChannel(id);
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
      const r = await syncEventChannel(id);
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
      const r = await syncAllEventChannels();
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
            Añade canales y sincroniza sus eventos automáticamente.
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
            placeholder="Nombre (ej: Vivo Conciertos)"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            className="bg-brand-card border border-brand-border rounded-lg px-3 py-2 text-gray-200 placeholder-gray-600 text-sm focus:outline-none focus:border-gray-500"
          />
          <input
            type="text"
            placeholder="https://www.youtube.com/@VivoConciertos"
            value={form.url}
            onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
            className="bg-brand-card border border-brand-border rounded-lg px-3 py-2 text-gray-200 placeholder-gray-600 text-sm font-mono focus:outline-none focus:border-gray-500"
          />
          <input
            type="text"
            placeholder='Keyword (por defecto "CONCIERTO")'
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

      {/* Sync result message */}
      {syncResult && (
        <div
          className={`text-sm font-medium p-3 rounded-lg ${
            syncResult.error
              ? "bg-red-900/30 border border-red-800/40 text-red-400"
              : "bg-green-900/30 border border-green-800/40 text-green-400"
          }`}
        >
          {syncResult.msg}
        </div>
      )}

      {/* Channels list */}
      {loading ? (
        <div className="text-center py-8">
          <div className="w-5 h-5 rounded-full border-2 border-brand-red border-t-transparent animate-spin mx-auto" />
        </div>
      ) : channels.length === 0 ? (
        <p className="text-gray-500 text-sm text-center py-8">No hay canales añadidos.</p>
      ) : (
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
      )}
    </div>
  );
}

// ─── Events section ───────────────────────────────────────────────────────────

function EventsSection() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setEvents(await getEvents({ limit: 100 }));
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleDelete = async (id: number) => {
    if (!confirm("¿Eliminar este evento?")) return;
    setDeleting(id);
    try {
      await deleteEvent(id);
      await load();
    } catch {
      // silent
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="bg-brand-card border border-brand-border rounded-2xl p-6 space-y-4">
      <div>
        <h2 className="text-white font-bold text-base mb-1">Eventos Importados</h2>
        <p className="text-gray-500 text-sm">
          {events.length} eventos disponibles (mínimo 30 minutos)
        </p>
      </div>

      {loading ? (
        <div className="text-center py-8">
          <div className="w-5 h-5 rounded-full border-2 border-brand-red border-t-transparent animate-spin mx-auto" />
        </div>
      ) : events.length === 0 ? (
        <p className="text-gray-500 text-sm text-center py-8">No hay eventos importados.</p>
      ) : (
        <div className="max-h-96 overflow-y-auto space-y-2">
          {events.map((event) => (
            <div
              key={event.id}
              className="flex items-center justify-between bg-brand-surface border border-brand-border rounded-lg p-3"
            >
              <div className="min-w-0 flex-1">
                <p className="text-white font-semibold text-sm line-clamp-1">{event.title}</p>
                <p className="text-gray-500 text-xs">{event.channel_name}</p>
              </div>
              <button
                onClick={() => handleDelete(event.id)}
                disabled={deleting !== null}
                className="flex items-center gap-1 bg-red-900/30 border border-red-800/40 hover:bg-red-900/50 disabled:opacity-40 text-red-400 font-bold py-1 px-2 rounded text-xs transition-colors flex-shrink-0 ml-3"
              >
                {deleting === event.id ? (
                  <span className="w-3 h-3 border border-red-400 border-t-transparent rounded-full animate-spin block" />
                ) : (
                  <TrashIcon />
                )}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function EventChannels() {
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-black text-white">Gestionar Eventos</h1>
          <p className="text-gray-400 text-sm mt-1">
            Importa eventos de YouTube (conciertos, festivales, etc.) de mínimo 30 minutos.
          </p>
        </div>

        <SettingsSection />
        <ChannelsSection onSynced={() => setRefreshKey((k) => k + 1)} />
        <EventsSection key={refreshKey} />
      </div>
    </AdminLayout>
  );
}
