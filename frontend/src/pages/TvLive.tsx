import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Helmet } from "react-helmet-async";
import { toast } from "sonner";
import { useIptvChannels } from "@/hooks/useIptv";
import type { IptvSource } from "@/hooks/useIptv";
import type { IptvChannel } from "@/lib/iptv-api";
import HlsPlayer from "@/components/HlsPlayer";
import { SOURCE_TABS } from "@/components/tv/types";
import { ChannelInitial, LiveBadge, SearchIcon } from "@/components/tv/ChannelBadge";
import ChannelRow from "@/components/tv/ChannelRow";
import ChannelCard from "@/components/tv/ChannelCard";
import { SkeletonRows, SkeletonCards } from "@/components/tv/ChannelSkeleton";

export default function TvLive() {
  const [source, setSource]           = useState<IptvSource>("peru");
  const [rawSearch, setRawSearch]     = useState("");
  const [debouncedSearch, setDebounced] = useState("");
  const [selectedGroup, setGroup]     = useState("Todos");
  const [offlineIds, setOfflineIds]   = useState<Set<string>>(new Set());

  // selectedChannel guardado en ref Y state
  const [selectedChannel, _setSelectedChannel] = useState<IptvChannel | null>(null);
  const selectedChannelRef = useRef<IptvChannel | null>(null);
  const setSelectedChannel = useCallback((ch: IptvChannel | null) => {
    selectedChannelRef.current = ch;
    _setSelectedChannel(ch);
  }, []);

  const debounceRef     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listRef         = useRef<HTMLDivElement>(null);
  const mobilePlayerRef = useRef<HTMLDivElement>(null);
  const autoSelectedRef = useRef(false);

  // Debounce búsqueda
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebounced(rawSearch), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [rawSearch]);

  // Reset completo al cambiar source
  useEffect(() => {
    autoSelectedRef.current = false;
    setGroup("Todos");
    setSelectedChannel(null);
    setOfflineIds(new Set());
    setRawSearch("");
    setDebounced("");
  }, [source, setSelectedChannel]);

  const { channels, groups, isLoading, isError } = useIptvChannels(
    source,
    debouncedSearch,
    selectedGroup === "Todos" ? "" : selectedGroup
  );

  // Auto-selección: SOLO cuando termina de cargar, SOLO una vez por source
  const channelsRef = useRef<IptvChannel[]>([]);
  useEffect(() => { channelsRef.current = channels; }, [channels]);

  useEffect(() => {
    if (autoSelectedRef.current) return;
    if (isLoading) return;
    const list = channelsRef.current;
    if (list.length === 0) return;
    autoSelectedRef.current = true;
    const first = list.find((c) => !offlineIds.has(c.id)) ?? list[0];
    setSelectedChannel(first);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading]);

  // handleChannelError: estable, lee de refs
  const offlineIdsRef = useRef(offlineIds);
  useEffect(() => { offlineIdsRef.current = offlineIds; }, [offlineIds]);

  const handleChannelError = useCallback(() => {
    const current  = selectedChannelRef.current;
    const list     = channelsRef.current;
    const offline  = offlineIdsRef.current;
    if (!current) return;

    const newOffline = new Set([...offline, current.id]);
    setOfflineIds(newOffline);

    const idx  = list.findIndex((c) => c.id === current.id);
    const next = list.slice(idx + 1).find((c) => !newOffline.has(c.id));

    if (next) {
      toast.warning("Canal no disponible, cambiando al siguiente...", { duration: 3000, icon: "📡" });
      setSelectedChannel(next);
    } else {
      toast.error("No hay más canales disponibles.", { duration: 4000 });
    }
  }, [setSelectedChannel]);

  const selectChannel = useCallback((ch: IptvChannel) => {
    setSelectedChannel(ch);
    if (window.innerWidth < 768 && mobilePlayerRef.current) {
      setTimeout(() => {
        mobilePlayerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 50);
    }
  }, [setSelectedChannel]);

  const clearFilters = useCallback(() => {
    setRawSearch("");
    setDebounced("");
    setGroup("Todos");
  }, []);

  const availableCount = useMemo(
    () => channels.filter((c) => !offlineIds.has(c.id)).length,
    [channels, offlineIds]
  );

  const displayedGroups = useMemo(() => ["Todos", ...groups], [groups]);

  // ─── Subviews ─────────────────────────────────────────────────────────────

  const sourceTabs = (
    <div className="flex gap-2 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: "none" }}>
      {SOURCE_TABS.map((tab) => (
        <button key={tab.id} onClick={() => setSource(tab.id)}
          className={["flex-shrink-0 rounded-full text-xs font-medium py-1.5 px-3 border transition-colors whitespace-nowrap",
            source === tab.id
              ? "bg-brand-red text-white border-brand-red"
              : "bg-brand-surface text-gray-400 border-brand-border hover:text-white hover:border-gray-500",
          ].join(" ")}>
          {tab.label}
        </button>
      ))}
    </div>
  );

  const searchBox = (
    <div className="relative">
      <input type="text" value={rawSearch}
        onChange={(e) => setRawSearch(e.target.value)}
        placeholder="Buscar canal..."
        className="w-full bg-brand-surface border border-brand-border rounded-lg px-4 py-2.5 pl-10 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-gray-500 transition-colors"
      />
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"><SearchIcon /></span>
      {rawSearch && (
        <button onClick={() => setRawSearch("")}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white text-xl leading-none">
          &times;
        </button>
      )}
    </div>
  );

  const groupPills = groups.length > 1 ? (
    <div className="flex gap-2 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: "none" }}>
      {displayedGroups.map((g) => (
        <button key={g} onClick={() => setGroup(g)}
          className={["flex-shrink-0 rounded-full text-xs font-medium py-1 px-2.5 border transition-colors whitespace-nowrap",
            selectedGroup === g
              ? "bg-brand-gold/20 text-brand-gold border-brand-gold/50"
              : "bg-transparent text-gray-500 border-brand-border hover:text-white hover:border-gray-500",
          ].join(" ")}>
          {g}
        </button>
      ))}
    </div>
  ) : null;

  const playerSection = (
    <div className="bg-brand-card border border-brand-border rounded-xl overflow-hidden shadow-xl">
      {selectedChannel ? (
        <>
          <HlsPlayer
            key={selectedChannel.url}
            src={selectedChannel.url}
            channelName={selectedChannel.name}
            logo={selectedChannel.logo}
            onError={handleChannelError}
          />
          <div className="px-4 py-3 bg-brand-surface/40 border-t border-brand-border flex items-center gap-3">
            <div className="w-9 h-9 rounded-md overflow-hidden bg-brand-surface border border-brand-border flex-shrink-0">
              {selectedChannel.logo ? (
                <img src={selectedChannel.logo} alt={selectedChannel.name}
                  className="w-full h-full object-contain"
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
              ) : (
                <ChannelInitial name={selectedChannel.name} />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-bold text-sm truncate">{selectedChannel.name}</p>
              <p className="text-gray-500 text-xs truncate">{selectedChannel.group}</p>
            </div>
            <LiveBadge offline={offlineIds.has(selectedChannel.id)} />
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center justify-center gap-4 bg-brand-dark" style={{ aspectRatio: "16/9" }}>
          <div className="text-5xl opacity-20">📺</div>
          <p className="text-gray-600 text-sm">Selecciona un canal para reproducir</p>
        </div>
      )}
      <p className="text-[10px] text-gray-600 text-center px-4 py-2 border-t border-brand-border/50">
        Algunos canales pueden no estar disponibles por restricciones de red (CORS). Prueba otro canal.
      </p>
    </div>
  );

  const channelList = (isMobile: boolean) => {
    if (isLoading) return isMobile ? <SkeletonCards /> : <SkeletonRows />;

    if (isError) return (
      <div className="flex flex-col items-center justify-center py-12 px-4 text-center gap-3">
        <span className="text-4xl">📡</span>
        <p className="text-gray-400 text-sm font-medium">No se pudieron cargar los canales.</p>
      </div>
    );

    if (channels.length === 0) return (
      <div className="flex flex-col items-center justify-center py-12 px-4 text-center gap-3">
        <span className="text-4xl">🔍</span>
        <p className="text-gray-400 text-sm font-medium">No se encontraron canales.</p>
        {(rawSearch || selectedGroup !== "Todos") && (
          <button onClick={clearFilters}
            className="mt-1 px-3 py-1.5 bg-brand-surface border border-brand-border rounded-lg text-xs text-gray-300 hover:text-white transition-colors">
            Limpiar filtros
          </button>
        )}
      </div>
    );

    if (isMobile) return (
      <div className="grid grid-cols-2 gap-2 p-2">
        {channels.map((ch) => (
          <ChannelCard key={ch.id} channel={ch}
            isSelected={selectedChannel?.id === ch.id}
            isOffline={offlineIds.has(ch.id)}
            onSelect={selectChannel} />
        ))}
      </div>
    );

    return (
      <div ref={listRef} className="overflow-y-auto h-[calc(100vh-340px)] min-h-[320px]">
        {channels.map((ch) => (
          <ChannelRow key={ch.id} channel={ch}
            isSelected={selectedChannel?.id === ch.id}
            isOffline={offlineIds.has(ch.id)}
            onSelect={selectChannel} />
        ))}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-brand-dark pt-16 pb-16">
      <Helmet><title>TV en Vivo — Cine Gratín</title></Helmet>

      {/* MOBILE */}
      <div className="md:hidden flex flex-col">
        <div className="px-4 pt-4 pb-3 border-b border-brand-border">
          <h1 className="text-2xl font-black text-white mb-3">📺 TV en Vivo</h1>
          <div className="mb-3">{sourceTabs}</div>
          {searchBox}
        </div>
        <div ref={mobilePlayerRef} className="sticky top-16 z-30 bg-brand-dark border-b border-brand-border shadow-2xl">
          {playerSection}
        </div>
        {(groups.length > 1 || !isLoading) && (
          <div className="px-3 pt-3 pb-2 space-y-2 border-b border-brand-border">
            {groupPills}
            {!isLoading && (
              <p className="text-[11px] text-gray-600 px-1">
                {availableCount} canal{availableCount !== 1 ? "es" : ""} disponible{availableCount !== 1 ? "s" : ""}
              </p>
            )}
          </div>
        )}
        {channelList(true)}
      </div>

      {/* DESKTOP */}
      <div className="hidden md:block max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 pt-6">
        <div className="mb-5">
          <div className="flex items-baseline gap-4 mb-3 flex-wrap">
            <h1 className="text-3xl font-black text-white">📺 TV en Vivo</h1>
            {!isLoading && (
              <span className="text-gray-500 text-sm">
                {availableCount} canal{availableCount !== 1 ? "es" : ""} disponible{availableCount !== 1 ? "s" : ""}
              </span>
            )}
          </div>
          <div className="mb-4">{sourceTabs}</div>
          <div className="flex flex-col gap-3">
            <div className="max-w-sm">{searchBox}</div>
            {groupPills}
          </div>
        </div>
        <div className="flex gap-5">
          <div className="w-80 xl:w-96 flex-shrink-0">
            <div className="bg-brand-card border border-brand-border rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-brand-border bg-brand-surface/30">
                <h2 className="text-sm font-bold text-white">Canales</h2>
                {!isLoading && channels.length > 0 && (
                  <span className="text-[10px] text-gray-600">{channels.length} resultados</span>
                )}
              </div>
              {channelList(false)}
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="sticky top-20">{playerSection}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
