import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchIptvChannels, type IptvChannel } from "@/lib/iptv-api";
import HlsPlayer from "@/components/HlsPlayer";
import SectionSkeleton from "./SectionSkeleton";

/**
 * Keywords used to filter channels from the Free-TV playlist
 * that are relevant for World Cup / football / sports.
 */
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
  "golpe",
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
  "tdt",
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

/** Check if a channel name or group matches any sport keyword */
function isSportChannel(ch: IptvChannel): boolean {
  const text = `${ch.name} ${ch.group}`.toLowerCase();
  return SPORT_KEYWORDS.some((kw) => text.includes(kw));
}

// ─── External web resources from the user's links ──────────────────────────────

interface ExternalLink {
  label: string;
  url: string;
  description: string;
}

const EXTERNAL_LINKS: ExternalLink[] = [
  {
    label: "🌐 Airwave TV",
    url: "https://mrpentestrz.github.io/airwavetv",
    description: "Canales TV online desde el navegador",
  },
  {
    label: "📡 HumansTV",
    url: "https://mutmainx.github.io/HumansTV",
    description: "TV gratuita online",
  },
];

// ─── Component ─────────────────────────────────────────────────────────────────

export default function WorldCupSection() {
  const [selectedChannel, setSelectedChannel] = useState<IptvChannel | null>(null);

  const { data: allChannels = [], isLoading } = useQuery({
    queryKey: ["iptv", "worldcup"],
    queryFn: () => fetchIptvChannels("worldcup"),
    staleTime: 15 * 60 * 1000,
    retry: 1,
  });

  const sportChannels = useMemo(() => {
    return allChannels
      .filter(isSportChannel)
      .sort((a, b) => a.group.localeCompare(b.group, "es"))
      .slice(0, 30);
  }, [allChannels]);

  // Group by category for display
  const groupedChannels = useMemo(() => {
    const groups = new Map<string, IptvChannel[]>();
    for (const ch of sportChannels) {
      const key = ch.group || "General";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(ch);
    }
    return Array.from(groups.entries());
  }, [sportChannels]);

  const handleChannelClick = (ch: IptvChannel) => {
    setSelectedChannel(ch);
  };

  const handleClosePlayer = () => {
    setSelectedChannel(null);
  };

  const handleNextChannel = () => {
    if (!selectedChannel) return;
    const idx = sportChannels.findIndex((c) => c.id === selectedChannel.id);
    if (idx < sportChannels.length - 1) {
      setSelectedChannel(sportChannels[idx + 1]);
    }
  };

  if (isLoading) return <SectionSkeleton title="⚽ Mundial de Fútbol — Canales Deportivos" />;
  if (sportChannels.length === 0 && !isLoading) return null;

  return (
    <section className="mb-10">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-4 px-4 sm:px-6 lg:px-8">
        <h2 className="text-lg sm:text-xl font-bold text-white flex items-center gap-3">
          <span className="w-2 h-7 bg-brand-red rounded-full" />⚽ Mundial de Fútbol — Canales Deportivos
        </h2>
        <span className="text-xs text-gray-500 bg-brand-surface/50 px-2.5 py-1 rounded-full border border-brand-border">
          {sportChannels.length} canales
        </span>
      </div>

      {/* ── External web resources ─────────────────────────────────────────── */}
      <div className="mb-4 px-4 sm:px-6 lg:px-8">
        <div className="flex flex-wrap gap-2">
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
      </div>

      {/* ── Inline Player ──────────────────────────────────────────────────── */}
      {selectedChannel && (
        <div className="mx-4 sm:mx-6 lg:mx-8 mb-6">
          <div className="bg-brand-card border border-brand-border rounded-xl overflow-hidden shadow-xl">
            <HlsPlayer
              key={selectedChannel.url}
              src={selectedChannel.url}
              channelName={selectedChannel.name}
              logo={selectedChannel.logo}
              onError={handleNextChannel}
            />
            <div className="px-4 py-3 bg-brand-surface/40 border-t border-brand-border flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-md overflow-hidden bg-brand-surface border border-brand-border flex-shrink-0">
                  {selectedChannel.logo ? (
                    <img
                      src={selectedChannel.logo}
                      alt={selectedChannel.name}
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
                  <p className="text-white font-bold text-sm truncate">{selectedChannel.name}</p>
                  <p className="text-gray-500 text-xs truncate">{selectedChannel.group}</p>
                </div>
              </div>
              <button
                onClick={handleClosePlayer}
                className="text-gray-400 hover:text-white text-sm font-medium flex-shrink-0 ml-3"
              >
                ✕ Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Channels grid by group ─────────────────────────────────────────── */}
      <div className="px-4 sm:px-6 lg:px-8 space-y-5">
        {groupedChannels.map(([group, channels]) => (
          <div key={group}>
            <h3 className="text-sm font-semibold text-gray-400 mb-2 uppercase tracking-wider">{group}</h3>
            <div className="flex gap-2 overflow-x-auto carousel-scroll pb-2">
              {channels.map((ch) => (
                <button
                  key={ch.id}
                  onClick={() => handleChannelClick(ch)}
                  className={[
                    "flex-shrink-0 flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border transition-all text-left",
                    selectedChannel?.id === ch.id
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
    </section>
  );
}
