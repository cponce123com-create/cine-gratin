import { useState, useEffect, useRef, useCallback } from "react";
import { Tv, Signal, AlertTriangle, Loader2, RefreshCw, Globe, Volume2, VolumeX, Maximize2, Play } from "lucide-react";
import Hls from "hls.js";
import { PageTransition } from "@/components/layout/PageTransition";

interface Channel {
  name: string;
  logo: string;
  country: string;
  countryCode: string;
  url: string;
  group: string;
}

const COUNTRY_MAP: Record<string, string> = {
  PE: "Perú",
  MX: "México",
  CO: "Colombia",
  AR: "Argentina",
  ES: "España",
  BO: "Bolivia",
  CL: "Chile",
  EC: "Ecuador",
  PY: "Paraguay",
  UY: "Uruguay",
  VE: "Venezuela",
  CU: "Cuba",
  DO: "Rep. Dominicana",
  GT: "Guatemala",
  HN: "Honduras",
  SV: "El Salvador",
  NI: "Nicaragua",
  CR: "Costa Rica",
  PA: "Panamá",
  US: "EE.UU.",
};

const FILTER_COUNTRIES = ["Todos", "México", "España", "Argentina", "Colombia", "Perú", "Internacional"];

function parseM3U(text: string): Channel[] {
  const lines = text.split(/\r?\n/);
  const channels: Channel[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line.startsWith("#EXTINF")) continue;

    const getAttr = (attr: string) => {
      const match = line.match(new RegExp(`${attr}="([^"]*)"`, "i"));
      return match ? match[1] : "";
    };

    const nameMatch = line.match(/,(.+)$/);
    const name = nameMatch ? nameMatch[1].trim() : "";
    if (!name) continue;

    const logo = getAttr("tvg-logo");
    const countryCode = (getAttr("tvg-country") || "").toUpperCase();
    const group = getAttr("group-title");

    // Find stream URL on the next non-empty line
    let url = "";
    for (let j = i + 1; j < lines.length && j < i + 5; j++) {
      const nextLine = lines[j].trim();
      if (nextLine && !nextLine.startsWith("#")) {
        url = nextLine;
        break;
      }
    }

    if (!url) continue;

    let country = COUNTRY_MAP[countryCode] || "";
    if (!country && group) {
      const knownCountry = Object.values(COUNTRY_MAP).find(c =>
        group.toLowerCase().includes(c.toLowerCase())
      );
      country = knownCountry || "Internacional";
    }
    if (!country) country = "Internacional";

    channels.push({ name, logo, country, countryCode, url, group });
  }

  return channels;
}

function getFilterCountry(country: string): string {
  if (["México"].includes(country)) return "México";
  if (["España"].includes(country)) return "España";
  if (["Argentina"].includes(country)) return "Argentina";
  if (["Colombia"].includes(country)) return "Colombia";
  if (["Perú"].includes(country)) return "Perú";
  return "Internacional";
}

export default function TvLive() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("Todos");
  const [selected, setSelected] = useState<Channel | null>(null);
  const [streamError, setStreamError] = useState(false);
  const [streamLoading, setStreamLoading] = useState(false);
  const [muted, setMuted] = useState(false);
  const [liveChannels, setLiveChannels] = useState<Set<string>>(new Set());

  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadChannels() {
      // Try via backend proxy first (avoids CORS), then direct
      const tryUrls = [
        "/api/m3u-proxy",
        "https://iptv-org.github.io/iptv/languages/spa.m3u",
      ];

      for (const url of tryUrls) {
        try {
          const r = await fetch(url, { signal: controller.signal });
          if (!r.ok) continue;
          const text = await r.text();
          if (!text.includes("#EXTINF")) continue;
          const parsed = parseM3U(text);
          if (parsed.length > 0) {
            setChannels(parsed);
            setLoading(false);
            return;
          }
        } catch {
          if (controller.signal.aborted) return;
        }
      }

      setError("No se pudo cargar la lista de canales. Intenta de nuevo.");
      setLoading(false);
    }

    loadChannels();
    return () => controller.abort();
  }, []);

  const playChannel = useCallback((channel: Channel) => {
    setSelected(channel);
    setStreamError(false);
    setStreamLoading(true);
  }, []);

  useEffect(() => {
    if (!selected || !videoRef.current) return;

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    const video = videoRef.current;
    const url = selected.url;

    setStreamError(false);
    setStreamLoading(true);

    if (Hls.isSupported()) {
      const hls = new Hls({
        maxBufferLength: 15,
        maxMaxBufferLength: 30,
        enableWorker: false,
      });
      hlsRef.current = hls;
      hls.loadSource(url);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setStreamLoading(false);
        video.play().catch(() => {});
        setLiveChannels(prev => new Set([...prev, selected.url]));
      });

      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (data.fatal) {
          setStreamError(true);
          setStreamLoading(false);
        }
      });
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = url;
      video.addEventListener("loadedmetadata", () => {
        setStreamLoading(false);
        video.play().catch(() => {});
        setLiveChannels(prev => new Set([...prev, selected.url]));
      }, { once: true });
      video.addEventListener("error", () => {
        setStreamError(true);
        setStreamLoading(false);
      }, { once: true });
    } else {
      setStreamError(true);
      setStreamLoading(false);
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [selected]);

  const handleFullscreen = () => {
    if (videoRef.current) {
      videoRef.current.requestFullscreen().catch(() => {});
    }
  };

  const filteredChannels = filter === "Todos"
    ? channels
    : channels.filter(ch => getFilterCountry(ch.country) === filter);

  return (
    <PageTransition>
      <div className="min-h-screen pt-24 pb-12 px-4 md:px-8">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-red-500/20 flex items-center justify-center">
              <Tv className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-foreground tracking-tight">TV en Vivo</h1>
              <p className="text-muted-foreground text-sm">Canales de habla hispana en señal abierta</p>
            </div>
            <div className="ml-auto flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-full px-3 py-1.5">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span className="text-red-400 text-xs font-bold uppercase tracking-wider">En Vivo</span>
            </div>
          </div>

          {/* Player */}
          {selected && (
            <div className="mb-6 bg-black rounded-2xl overflow-hidden border border-border shadow-2xl">
              <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card">
                <img
                  src={selected.logo}
                  alt={selected.name}
                  className="w-8 h-8 object-contain rounded"
                  onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
                <div>
                  <h2 className="text-foreground font-bold text-sm">{selected.name}</h2>
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                    <span className="text-red-400 text-xs font-bold">EN VIVO</span>
                    <span className="text-muted-foreground text-xs">· {selected.country}</span>
                  </div>
                </div>
                <div className="ml-auto flex items-center gap-2">
                  <button
                    onClick={() => setMuted(m => !m)}
                    className="p-2 rounded-lg bg-secondary hover:bg-secondary/80 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={handleFullscreen}
                    className="p-2 rounded-lg bg-secondary hover:bg-secondary/80 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Maximize2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setSelected(null)}
                    className="p-2 rounded-lg bg-secondary hover:bg-secondary/80 text-muted-foreground hover:text-foreground transition-colors text-xs font-bold"
                  >
                    ✕
                  </button>
                </div>
              </div>

              <div className="relative bg-black" style={{ aspectRatio: "16/9" }}>
                {streamLoading && !streamError && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 z-10">
                    <Loader2 className="w-8 h-8 text-primary animate-spin" />
                    <p className="text-muted-foreground text-sm">Conectando al canal...</p>
                  </div>
                )}
                {streamError && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 z-10">
                    <AlertTriangle className="w-8 h-8 text-amber-400" />
                    <p className="text-foreground font-medium">Canal no disponible en este momento</p>
                    <p className="text-muted-foreground text-sm">La señal puede estar temporalmente fuera del aire</p>
                    <button
                      onClick={() => playChannel(selected)}
                      className="flex items-center gap-2 mt-2 bg-primary/20 hover:bg-primary/30 text-primary px-4 py-2 rounded-lg text-sm font-bold transition-colors"
                    >
                      <RefreshCw className="w-4 h-4" /> Reintentar
                    </button>
                  </div>
                )}
                <video
                  ref={videoRef}
                  className="w-full h-full"
                  muted={muted}
                  controls={!streamError && !streamLoading}
                  playsInline
                />
              </div>
            </div>
          )}

          {/* Filters */}
          <div className="flex gap-2 flex-wrap mb-5">
            {FILTER_COUNTRIES.map(country => (
              <button
                key={country}
                onClick={() => setFilter(country)}
                className={`px-4 py-1.5 rounded-full text-sm font-bold transition-all border ${
                  filter === country
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-secondary text-muted-foreground border-border hover:border-primary/50 hover:text-foreground"
                }`}
              >
                {country}
              </button>
            ))}
            {!loading && (
              <span className="ml-auto text-muted-foreground text-xs self-center font-mono">
                {filteredChannels.length} canales
              </span>
            )}
          </div>

          {/* Content */}
          {loading && (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
              <p className="text-muted-foreground">Cargando canales...</p>
            </div>
          )}

          {error && (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <AlertTriangle className="w-8 h-8 text-amber-400" />
              <p className="text-foreground font-medium">{error}</p>
              <button
                onClick={() => window.location.reload()}
                className="flex items-center gap-2 bg-secondary hover:bg-secondary/80 text-foreground px-4 py-2 rounded-lg text-sm font-bold transition-colors"
              >
                <RefreshCw className="w-4 h-4" /> Reintentar
              </button>
            </div>
          )}

          {!loading && !error && filteredChannels.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <Globe className="w-8 h-8 text-muted-foreground" />
              <p className="text-muted-foreground">No hay canales disponibles para este filtro</p>
            </div>
          )}

          {!loading && !error && filteredChannels.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
              {filteredChannels.map((ch, i) => {
                const isActive = selected?.url === ch.url;
                const isLive = liveChannels.has(ch.url);

                return (
                  <button
                    key={i}
                    onClick={() => playChannel(ch)}
                    className={`group relative flex flex-col items-center gap-2 p-3 rounded-xl border transition-all duration-200 text-left ${
                      isActive
                        ? "bg-primary/10 border-primary shadow-lg shadow-primary/20"
                        : "bg-card border-border hover:border-primary/50 hover:bg-card/80 hover:shadow-lg hover:shadow-primary/10"
                    }`}
                    style={{
                      boxShadow: isActive ? "0 0 20px rgba(0,212,255,0.15)" : undefined,
                    }}
                  >
                    {/* Live badge */}
                    {(isActive || isLive) && (
                      <div className="absolute top-1.5 right-1.5 flex items-center gap-1 bg-red-500/90 rounded-full px-1.5 py-0.5">
                        <span className="w-1 h-1 rounded-full bg-white animate-pulse" />
                        <span className="text-white text-[9px] font-bold">LIVE</span>
                      </div>
                    )}

                    {/* Logo */}
                    <div className="w-12 h-12 flex items-center justify-center bg-secondary rounded-lg overflow-hidden flex-shrink-0">
                      {ch.logo ? (
                        <img
                          src={ch.logo}
                          alt={ch.name}
                          className="w-full h-full object-contain p-1"
                          loading="lazy"
                          onError={e => {
                            const el = e.target as HTMLImageElement;
                            el.style.display = "none";
                            const parent = el.parentElement;
                            if (parent) {
                              const icon = document.createElement("div");
                              icon.className = "flex items-center justify-center w-full h-full";
                              icon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-muted-foreground"><rect x="2" y="7" width="20" height="15" rx="2" ry="2"/><polyline points="17 2 12 7 7 2"/></svg>`;
                              parent.appendChild(icon);
                            }
                          }}
                        />
                      ) : (
                        <Tv className="w-6 h-6 text-muted-foreground" />
                      )}
                    </div>

                    {/* Channel info */}
                    <div className="text-center w-full">
                      <p className={`text-xs font-bold truncate leading-tight ${isActive ? "text-primary" : "text-foreground group-hover:text-primary"} transition-colors`}>
                        {ch.name}
                      </p>
                      <p className="text-muted-foreground text-[10px] mt-0.5 truncate">{ch.country}</p>
                    </div>

                    {/* Play icon on hover */}
                    {!isActive && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity">
                        <div className="w-8 h-8 rounded-full bg-primary/80 flex items-center justify-center">
                          <Play className="w-4 h-4 text-black fill-black" />
                        </div>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Legal notice */}
          <div className="mt-10 p-4 bg-card border border-border rounded-xl text-center">
            <p className="text-muted-foreground text-xs">
              <Signal className="w-3 h-3 inline mr-1 mb-0.5" />
              Solo señales abiertas y de acceso libre. No contiene canales de pago ni contenido protegido.
            </p>
          </div>
        </div>
      </div>
    </PageTransition>
  );
}
