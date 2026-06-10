import { useState, useEffect, useCallback } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import YouTubeSettingsSection from "@/components/admin/YouTubeSettingsSection";
import YouTubeChannelsSection from "@/components/admin/YouTubeChannelsSection";
import { TrashIcon } from "@/components/admin/icons";
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
  type Event,
} from "@/lib/events-api";

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
        <p className="text-gray-500 text-sm">{events.length} eventos disponibles (mínimo 30 minutos)</p>
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

        <YouTubeSettingsSection getSettings={getEventsSettings} saveSettings={saveEventsSettings} />
        <YouTubeChannelsSection
          variant="list"
          description="Añade canales y sincroniza sus eventos automáticamente."
          defaultKeyword="CONCIERTO"
          channelNamePlaceholder="Nombre (ej: Vivo Conciertos)"
          channelUrlPlaceholder="https://www.youtube.com/@VivoConciertos"
          keywordPlaceholder='Keyword (por defecto "CONCIERTO")'
          emptyMessage="No hay canales añadidos."
          getChannels={getEventChannels}
          addChannel={addEventChannel}
          deleteChannel={deleteEventChannel}
          syncChannel={syncEventChannel}
          syncAllChannels={syncAllEventChannels}
          onSynced={() => setRefreshKey((k) => k + 1)}
        />
        <EventsSection key={refreshKey} />
      </div>
    </AdminLayout>
  );
}
