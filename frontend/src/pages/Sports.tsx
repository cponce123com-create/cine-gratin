import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Helmet } from "react-helmet-async";
import { getSportMatches } from "@/lib/sports-api";
import { fetchIptvChannels, type IptvChannel } from "@/lib/iptv-api";
import HlsPlayer from "@/components/HlsPlayer";
import { SkeletonGrid } from "@/components/SkeletonCard";
import { SearchIcon, PlayIcon } from "@/components/icons";

// ─── Constants ─────────────────────────────────────────────────────────────────

const FALLBACK_THUMBNAIL =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='320' height='180' viewBox='0 0 320 180'%3E%3Crect width='320' height='180' fill='%231a1a1a'/%3E%3Ctext x='160' y='90' font-family='sans-serif' font-size='14' fill='%23555' text-anchor='middle' dominant-baseline='middle'%3ESin imagen%3C/text%3E%3C/svg%3E";

/** Keywords to filter Free-TV playlist for sports / World Cup channels */
const SPORT_KEYWORDS = [
  "fútbol",
  "futbol",
  "football",
  "soccer",
  "deportes",
  "sports",
  "sport",
  "espn",
  "fox sports",
  "tyc sports",
  "dsports",
  "directv sports",
  "gol",
  "bein sports",
  "bein",
  "movistar deportes",
  "movistar",
  "dazn",
  "world cup",
  "copa",
  "liga",
  "champions",
  "mundial",
  "fifa",
  "teledeporte",
  "tele deporte",
  "red bull tv",
  "wwe",
  "ufc",
  "nfl",
  "nba",
  "mlb",
  "f1",
];

const EXTERNAL_LINKS = [
  { label: "🌐 Airwave TV", url: "https://mrpentestrz.github.io/airwavetv" },
  { label: "📡 HumansTV", url: "https://mutmainx.github.io/HumansTV" },
];

// ─── Filter helper ─────────────────────────────────────────────────────────────

function isSportChannel(ch: IptvChannel): boolean {
  const text = `${ch.name} ${ch.group}`.toLowerCase();
  return SPORT_KEYWORDS.some((kw) => text.includes(kw));
}

// ─── Component ─────────────────────────────────────────────────────────────────

export default function Sports() {
  // ── YouTube events ───────────────────────────────────────────────────────────
  const {
    data: youtubeItems,
    isLoading: youtubeLoading,
    error: youtubeError,
  } = useQuery({
    queryKey: ["sports-matches"],
    queryFn: () => getSportMatches({ limit: 100 }),
    staleTime: 5 * 60 * 1000,
  });

  const [ytSearch, setYtSearch] = useState("");
  const [selectedYtId, setSelectedYtId] = useState<string | null>(null);

  const filteredYt = useMemo(() => {
    let list = youtubeItems ?? [];
    if (ytSearch.trim()) {
      const q = ytSearch.toLowerCase();
      list = list.filter((e) => e.title.toLowerCase().includes(q));
    }
    return list;
  }, [youtubeItems, ytSearch]);

  const selectedYtItem = useMemo(
    () => youtubeItems?.find((e) => e.yt_id === selectedYtId),
    [youtubeItems, selectedYtId],
  );

  // ── IPTV World Cup channels ───────────────────────────────────────────────────
  const { data: iptvChannels = [], isLoading: iptvLoading } = useQuery({
    queryKey: ["iptv", "worldcup"],
    queryFn: () => fetchIptvChannels("worldcup"),
    staleTime: 15 * 60 * 1000,
    retry: 1,
  });

  const [selectedIptvChannel, setSelectedIptvChannel] = useState<IptvChannel | null>(null);

  const sportChannels = useMemo(() => {
    return iptvChannels
      .filter(isSportChannel)
      .sort((a, b) => a.group.localeCompare(b.group, "es"))
      .slice(0, 40);
  }, [iptvChannels]);

  const groupedIptvChannels = useMemo(() => {
    const groups = new Map<string, IptvChannel[]>();
    for (const ch of sportChannels) {
      const key = ch.group || "General";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(ch);
    }
    return Array.from(groups.entries());
  }, [sportChannels]);

  const handleIptvChannelClick = (ch: IptvChannel) => {
    setSelectedIptvChannel(ch);
    setSelectedYtId(null);
  };

  const handleIptvNext = () => {
    if (!selectedIptvChannel) return;
    const idx = sportChannels.findIndex((c) => c.id === selectedIptvChannel.id);
    if (idx < sportChannels.length - 1) {
      setSelectedIptvChannel(sportChannels[idx + 1]);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-brand-dark pt-20 pb-16">
      <Helmet>
        <title>Eventos Deportivos — Cine Gratín</title>
      </Helmet>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-black text-white mb-2">Eventos Deportivos</h1>
        <p className="text-gray-400 text-sm mb-8">
          {youtubeItems ? `${filteredYt.length} eventos disponibles` : "Cargando..."}
        </p>

        {/* ── EXTERNAL LINKS ───────────────────────────────────────────────── */}
        <div className="flex flex-wrap gap-2 mb-8">
          {EXTERNAL_LINKS.map((link) => (
            <a
              key={link.url}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-3 py-1.5 bg-brand-surface border border-brand-border rounded-lg text-xs text-gray-300 hover:text-white hover:border-gray-500 transition-colors"
            >
              {link.label}
              <span className="text-gray-600">↗</span>
            </a>
          ))}
        </div>

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* ── WORLD CUP / IPTV SECTION ────────────────────────────────────── */}
        {/* ═══════════════════════════════════════════════════════════════════ */}

        {!iptvLoading && sportChannels.length > 0 && (
          <div className="mb-12">
            {/* Inline player */}
            {selectedIptvChannel && (
              <div className="mb-6">
                <div className="bg-brand-card border border-brand-border rounded-xl overflow-hidden shadow-xl">
                  <HlsPlayer
                    key={selectedIptvChannel.url}
                    src={selectedIptvChannel.url}
                    channelName={selectedIptvChannel.name}
                    logo={selectedIptvChannel.logo}
                    onError={handleIptvNext}
                  />
                  <div className="px-4 py-3 bg-brand-surface/40 border-t border-brand-border flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-md overflow-hidden bg-brand-surface border border-brand-border flex-shrink-0">
                        {selectedIptvChannel.logo ? (
                          <img
                            src={selectedIptvChannel.logo}
                            alt={selectedIptvChannel.name}
                            className="w-full h-full object-contain"
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).style.display = "none";
                            }}
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-lg">⚽</div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-white font-bold text-sm truncate">{selectedIptvChannel.name}</p>
                        <p className="text-gray-500 text-xs truncate">{selectedIptvChannel.group}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => setSelectedIptvChannel(null)}
                      className="text-gray-400 hover:text-white text-sm font-medium flex-shrink-0 ml-3"
                    >
                      ✕ Cerrar
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Section header */}
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-white flex items-center gap-3">
                <span className="w-2 h-7 bg-brand-red rounded-full" />⚽ Mundial de Fútbol — Canales en Vivo
              </h2>
              <span className="text-xs text-gray-500 bg-brand-surface/50 px-2.5 py-1 rounded-full border border-brand-border">
                {sportChannels.length} canales
              </span>
            </div>

            {/* Channel groups */}
            <div className="space-y-5">
              {groupedIptvChannels.map(([group, channels]) => (
                <div key={group}>
                  <h3 className="text-sm font-semibold text-gray-400 mb-2 uppercase tracking-wider">
                    {group}
                  </h3>
                  <div className="flex gap-2 overflow-x-auto carousel-scroll pb-2">
                    {channels.map((ch) => (
                      <button
                        key={ch.id}
                        onClick={() => handleIptvChannelClick(ch)}
                        className={[
                          "flex-shrink-0 flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border transition-all text-left",
                          selectedIptvChannel?.id === ch.id
                            ? "bg-brand-red/15 border-brand-red text-white"
                            : "bg-brand-surface border-brand-border text-gray-300 hover:text-white hover:border-gray-500",
                        ].join(" ")}
                      >
                        <div className="w-8 h-8 rounded-lg overflow-hidden bg-brand-card border border-brand-border/50 flex-shrink-0">
                          {ch.logo ? (
                            <img
                              src={ch.logo}
                              alt={ch.name}
                              className="w-full h-full object-contain"
                              onError={(e) => {
                                (e.currentTarget as HTMLImageElement).style.display = "none";
                              }}
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-base">📺</div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold truncate max-w-[160px]">{ch.name}</p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-500/70" />
                            <span className="text-[10px] text-gray-500 font-medium">En vivo</span>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* ── YOUTUBE EVENTS SECTION ──────────────────────────────────────── */}
        {/* ═══════════════════════════════════════════════════════════════════ */}

        {/* Separator */}
        <div className="flex items-center gap-4 mb-8">
          <div className="h-px flex-1 bg-brand-border" />
          <span className="text-xs text-gray-600 font-medium">VIDEOS DE EVENTOS DEPORTIVOS</span>
          <div className="h-px flex-1 bg-brand-border" />
        </div>

        {/* Search */}
        <div className="mb-8">
          <div className="relative max-w-md">
            <input
              type="text"
              value={ytSearch}
              onChange={(e) => setYtSearch(e.target.value)}
              placeholder="Buscar evento..."
              className="w-full bg-brand-surface border border-brand-border rounded-lg px-4 py-2.5 pl-10 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-gray-500 transition-colors"
            />
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
              <SearchIcon />
            </span>
            {ytSearch && (
              <button
                onClick={() => setYtSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
              >
                &times;
              </button>
            )}
          </div>
        </div>

        {/* YouTube player */}
        {selectedYtId && selectedYtItem && (
          <div className="mb-12 bg-black rounded-xl overflow-hidden shadow-2xl ring-1 ring-white/10">
            <div className="aspect-video w-full relative">
              <iframe
                src={`https://www.youtube.com/embed/${selectedYtId}?autoplay=1`}
                title="YouTube video player"
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                className="absolute inset-0 w-full h-full"
              />
            </div>
            <div className="p-4 bg-brand-surface/50 flex justify-between items-center">
              <h2 className="text-lg font-bold text-white">{selectedYtItem.title}</h2>
              <button
                onClick={() => setSelectedYtId(null)}
                className="text-gray-400 hover:text-white text-sm font-medium"
              >
                Cerrar reproductor
              </button>
            </div>
          </div>
        )}

        {/* Loading */}
        {youtubeLoading && <SkeletonGrid />}

        {/* Error */}
        {youtubeError && (
          <div className="text-center py-20">
            <p className="text-red-400 text-lg">No se pudieron cargar los eventos deportivos.</p>
          </div>
        )}

        {/* Empty state */}
        {!youtubeLoading && !youtubeError && filteredYt.length === 0 && (
          <div className="text-center py-20">
            <p className="text-gray-400 text-lg">No hay eventos que coincidan.</p>
            <button
              onClick={() => setYtSearch("")}
              className="mt-4 text-brand-red hover:text-red-400 text-sm underline"
            >
              Limpiar búsqueda
            </button>
          </div>
        )}

        {/* YouTube grid */}
        {!youtubeLoading && !youtubeError && filteredYt.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredYt.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  setSelectedYtId(item.yt_id);
                  setSelectedIptvChannel(null);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                className="group block text-left"
              >
                <div className="aspect-video w-full rounded-lg overflow-hidden bg-brand-surface card-hover relative">
                  <img
                    src={item.thumbnail || FALLBACK_THUMBNAIL}
                    alt={item.title}
                    loading="lazy"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).src = FALLBACK_THUMBNAIL;
                    }}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <div className="w-12 h-12 bg-brand-red rounded-full flex items-center justify-center shadow-lg transform scale-90 group-hover:scale-100 transition-transform">
                      <PlayIcon />
                    </div>
                  </div>
                </div>
                <div className="mt-3">
                  <p className="text-sm text-gray-200 font-bold line-clamp-2 group-hover:text-brand-red transition-colors">
                    {item.title}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-gray-500 font-medium">{item.channel_name}</span>
                    {item.published_at && (
                      <span className="text-[10px] text-gray-600">
                        • {new Date(item.published_at).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
