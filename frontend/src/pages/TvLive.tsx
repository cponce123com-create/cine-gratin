import { useState, useEffect, useRef, useMemo } from "react";
import { Helmet } from "react-helmet-async";
import { useIptvChannels, type IptvSource } from "@/hooks/useIptv";
import type { IptvChannel } from "@/lib/iptv-api";
import HlsPlayer from "@/components/HlsPlayer";

// ─── Fallback SVG logo ──────────────────────────────────────────────────────────

const FALLBACK_LOGO =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='48' height='48' viewBox='0 0 48 48'%3E%3Crect width='48' height='48' fill='%231A1A1A' rx='6'/%3E%3Ctext x='24' y='32' font-family='sans-serif' font-size='22' text-anchor='middle' fill='%23555'%3E📺%3C/text%3E%3C/svg%3E";

// ─── Source selector config ─────────────────────────────────────────────────────

const SOURCES: { id: IptvSource; label: string }[] = [
  { id: "peru", label: "🇵🇪 Perú" },
  { id: "spanish", label: "🌎 En Español" },
];

// ─── Sub-components ─────────────────────────────────────────────────────────────

function LiveBadge() {
  return (
    <span className="inline-flex items-center gap-1 bg-brand-red/10 text-brand-red text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide flex-shrink-0">
      <span className="w-1.5 h-1.5 rounded-full bg-brand-red animate-pulse" />
      EN VIVO
    </span>
  );
}

interface ChannelCardProps {
  channel: IptvChannel;
  isSelected: boolean;
  onClick: () => void;
}

function ChannelCard({ channel, isSelected, onClick }: ChannelCardProps) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors group ${
        isSelected
          ? "bg-brand-surface border border-brand-red/50 shadow-lg shadow-brand-red/10"
          : "hover:bg-brand-surface/60 border border-transparent"
      }`}
    >
      {/* Channel logo */}
      <div className="w-10 h-10 rounded-md overflow-hidden bg-brand-surface flex-shrink-0 border border-brand-border flex items-center justify-center">
        <img
          src={channel.logo || FALLBACK_LOGO}
          alt={channel.name}
          className="w-full h-full object-contain"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).src = FALLBACK_LOGO;
          }}
          loading="lazy"
        />
      </div>

      {/* Channel info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p
            className={`text-sm font-semibold truncate flex-1 ${
              isSelected ? "text-white" : "text-gray-300 group-hover:text-white"
            } transition-colors`}
          >
            {channel.name}
          </p>
          <LiveBadge />
        </div>
        <p className="text-[11px] text-gray-500 truncate mt-0.5">{channel.group}</p>
      </div>
    </button>
  );
}

function SearchIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────────

export default function TvLive() {
  const [source, setSource] = useState<IptvSource>("peru");
  const [rawSearch, setRawSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedGroup, setSelectedGroup] = useState("");
  const [selectedChannel, setSelectedChannel] = useState<IptvChannel | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const groupScrollRef = useRef<HTMLDivElement>(null);

  // Debounce search input by 300ms
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(rawSearch);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [rawSearch]);

  // Reset group/channel when source changes
  useEffect(() => {
    setSelectedGroup("");
    setSelectedChannel(null);
    setRawSearch("");
    setDebouncedSearch("");
  }, [source]);

  const { channels, groups, isLoading, isError } = useIptvChannels(
    source,
    debouncedSearch,
    selectedGroup
  );

  // Auto-select first channel when list loads or filters change
  useEffect(() => {
    if (channels.length > 0 && !selectedChannel) {
      setSelectedChannel(channels[0]);
    }
    // If selected channel is no longer in filtered list, keep it anyway
    // (user may want to keep watching while searching)
  }, [channels]); // eslint-disable-line react-hooks/exhaustive-deps

  // Memoize "all groups" pill label
  const allGroupsLabel = "Todos";

  const displayedGroups = useMemo(() => [allGroupsLabel, ...groups], [groups]);

  return (
    <div className="min-h-screen bg-brand-dark pt-20 pb-16">
      <Helmet>
        <title>TV en Vivo — Cine Gratín</title>
      </Helmet>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* ── Page header ─────────────────────────────────────────────── */}
        <div className="mb-6">
          <h1 className="text-3xl font-black text-white mb-1">📺 TV en Vivo</h1>
          <p className="text-gray-400 text-sm">
            {isLoading
              ? "Cargando canales…"
              : channels.length > 0
              ? `${channels.length} canal${channels.length !== 1 ? "es" : ""} disponible${channels.length !== 1 ? "s" : ""}`
              : "No se encontraron canales"}
          </p>
        </div>

        {/* ── Source tabs ──────────────────────────────────────────────── */}
        <div className="flex gap-2 mb-5">
          {SOURCES.map((s) => (
            <button
              key={s.id}
              onClick={() => setSource(s.id)}
              className={`px-4 py-2 rounded-full text-sm font-semibold transition-colors border ${
                source === s.id
                  ? "bg-brand-red border-brand-red text-white"
                  : "bg-transparent border-brand-border text-gray-400 hover:text-white hover:border-gray-500"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* ── Search ───────────────────────────────────────────────────── */}
        <div className="relative max-w-sm mb-5">
          <input
            type="text"
            value={rawSearch}
            onChange={(e) => setRawSearch(e.target.value)}
            placeholder="Buscar canal…"
            className="w-full bg-brand-surface border border-brand-border rounded-lg px-4 py-2.5 pl-10 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-gray-500 transition-colors"
          />
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
            <SearchIcon />
          </span>
          {rawSearch && (
            <button
              onClick={() => setRawSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white text-lg leading-none"
            >
              &times;
            </button>
          )}
        </div>

        {/* ── Category pills ────────────────────────────────────────────── */}
        {groups.length > 0 && (
          <div
            ref={groupScrollRef}
            className="flex gap-2 overflow-x-auto pb-2 mb-6 scrollbar-thin scrollbar-thumb-brand-border"
            style={{ scrollbarWidth: "thin" }}
          >
            {displayedGroups.map((g) => {
              const active = g === allGroupsLabel ? selectedGroup === "" : selectedGroup === g;
              return (
                <button
                  key={g}
                  onClick={() => setSelectedGroup(g === allGroupsLabel ? "" : g)}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors border whitespace-nowrap ${
                    active
                      ? "bg-brand-gold/20 border-brand-gold/50 text-brand-gold"
                      : "bg-transparent border-brand-border text-gray-400 hover:text-white hover:border-gray-500"
                  }`}
                >
                  {g}
                </button>
              );
            })}
          </div>
        )}

        {/* ── Main content: two-column layout ─────────────────────────── */}
        <div className="flex flex-col lg:flex-row gap-6">
          {/* ── Channel list (left on desktop, top on mobile) ─────────── */}
          <div className="lg:w-80 xl:w-96 flex-shrink-0 order-2 lg:order-1">
            <div className="bg-brand-card border border-brand-border rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-brand-border bg-brand-surface/30">
                <h2 className="text-sm font-bold text-white">Canales</h2>
              </div>

              {/* Loading skeleton */}
              {isLoading && (
                <div className="p-3 space-y-2">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3 p-2.5 rounded-lg animate-pulse">
                      <div className="w-10 h-10 rounded-md bg-brand-surface flex-shrink-0" />
                      <div className="flex-1 space-y-1.5">
                        <div className="h-3 bg-brand-surface rounded w-3/4" />
                        <div className="h-2.5 bg-brand-surface rounded w-1/2" />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Error state */}
              {isError && !isLoading && (
                <div className="px-4 py-10 text-center">
                  <p className="text-gray-400 text-sm">No se pudieron cargar los canales.</p>
                  <p className="text-gray-600 text-xs mt-1">Verifica tu conexión e inténtalo nuevamente.</p>
                </div>
              )}

              {/* Empty state */}
              {!isLoading && !isError && channels.length === 0 && (
                <div className="px-4 py-10 text-center">
                  <p className="text-2xl mb-3">📡</p>
                  <p className="text-gray-400 text-sm font-medium">No hay canales</p>
                  <p className="text-gray-600 text-xs mt-1 leading-relaxed">
                    {debouncedSearch || selectedGroup
                      ? "Prueba con otro término o categoría."
                      : "Algunos canales pueden no estar disponibles por restricciones de red. Prueba otro canal."}
                  </p>
                  {(debouncedSearch || selectedGroup) && (
                    <button
                      onClick={() => {
                        setRawSearch("");
                        setDebouncedSearch("");
                        setSelectedGroup("");
                      }}
                      className="mt-3 text-brand-red hover:text-red-400 text-xs underline"
                    >
                      Limpiar filtros
                    </button>
                  )}
                </div>
              )}

              {/* Channel list */}
              {!isLoading && !isError && channels.length > 0 && (
                <div className="overflow-y-auto max-h-[60vh] lg:max-h-[calc(100vh-280px)] p-2 space-y-0.5">
                  {channels.map((ch, idx) => (
                    <ChannelCard
                      key={`${ch.url}-${idx}`}
                      channel={ch}
                      isSelected={selectedChannel?.url === ch.url}
                      onClick={() => setSelectedChannel(ch)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── Player (right on desktop, bottom on mobile) ─────────────── */}
          <div className="flex-1 order-1 lg:order-2">
            <div className="lg:sticky lg:top-24">
              {selectedChannel ? (
                <div className="bg-brand-card border border-brand-border rounded-xl overflow-hidden">
                  {/* Player */}
                  <HlsPlayer
                    src={selectedChannel.url}
                    channelName={selectedChannel.name}
                  />

                  {/* Channel info bar */}
                  <div className="px-4 py-3 bg-brand-surface/30 border-t border-brand-border flex items-center gap-3">
                    {/* Logo */}
                    <div className="w-9 h-9 rounded-md overflow-hidden bg-brand-surface border border-brand-border flex-shrink-0 flex items-center justify-center">
                      <img
                        src={selectedChannel.logo || FALLBACK_LOGO}
                        alt={selectedChannel.name}
                        className="w-full h-full object-contain"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).src = FALLBACK_LOGO;
                        }}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-bold text-sm truncate">{selectedChannel.name}</p>
                      <p className="text-gray-500 text-xs truncate">{selectedChannel.group}</p>
                    </div>
                    <LiveBadge />
                  </div>
                </div>
              ) : (
                /* Placeholder when no channel selected yet */
                <div className="bg-brand-card border border-brand-border rounded-xl overflow-hidden">
                  <div
                    className="flex flex-col items-center justify-center bg-brand-dark gap-4"
                    style={{ aspectRatio: "16/9" }}
                  >
                    <div className="text-5xl opacity-30">📺</div>
                    <p className="text-gray-600 text-sm">Selecciona un canal para reproducir</p>
                  </div>
                </div>
              )}

              {/* CORS notice */}
              <p className="mt-3 text-[11px] text-gray-600 leading-relaxed text-center">
                Algunos canales pueden no estar disponibles por restricciones de red (CORS).{" "}
                Prueba otro canal si el actual no carga.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
