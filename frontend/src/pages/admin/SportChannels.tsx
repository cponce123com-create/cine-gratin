import { useState, useEffect, useCallback } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import YouTubeSettingsSection from "@/components/admin/YouTubeSettingsSection";
import YouTubeChannelsSection from "@/components/admin/YouTubeChannelsSection";
import { TrashIcon } from "@/components/admin/icons";
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
  type SportMatch,
} from "@/lib/sports-api";

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, refreshKey]);

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
            Partidos importados <span className="text-gray-500 font-normal text-sm">({matches.length})</span>
          </h2>
          <p className="text-gray-500 text-sm">Todos los partidos guardados en la base de datos.</p>
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
              onClick={() => {
                setSearch("");
                setQuery("");
              }}
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
                    {m.published_at && <span>{new Date(m.published_at).toLocaleDateString("es-ES")}</span>}
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

        <YouTubeSettingsSection getSettings={getSportsSettings} saveSettings={saveSportsSettings} />
        <YouTubeChannelsSection
          variant="table"
          description="Añade canales y sincroniza sus partidos completos automáticamente."
          defaultKeyword="FULL MATCH"
          channelNamePlaceholder="Nombre (ej: UEFA)"
          channelUrlPlaceholder="https://www.youtube.com/@UEFA"
          keywordPlaceholder='Keyword (por defecto "FULL MATCH")'
          emptyMessage="No hay canales configurados. Añade uno arriba."
          getChannels={getSportChannels}
          addChannel={addSportChannel}
          deleteChannel={deleteSportChannel}
          syncChannel={syncSportChannel}
          syncAllChannels={syncAllSportChannels}
          onSynced={() => setRefreshKey((k) => k + 1)}
        />
        <MatchesSection refreshKey={refreshKey} />
      </div>
    </AdminLayout>
  );
}
