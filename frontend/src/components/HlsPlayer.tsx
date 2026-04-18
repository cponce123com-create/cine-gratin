import { useEffect, useRef, useState, useCallback } from "react";

// ─── Internal types ─────────────────────────────────────────────────────────────

interface HlsPlayerProps {
  /** HLS stream URL (.m3u8) */
  src: string;
  /** Channel display name */
  channelName: string;
  /** Optional channel logo URL */
  logo?: string;
  /** Called when the channel fails definitively (timeout / fatal error) */
  onError?: () => void;
}

type PlayerState = "loading" | "playing" | "error";

// Minimal HLS instance interface — avoids depending on UMD-generated typedefs
interface HlsInstance {
  loadSource(src: string): void;
  attachMedia(media: HTMLMediaElement): void;
  destroy(): void;
  recoverMediaError(): void;
  startLoad(): void;
  on(event: string, cb: (evt: string, data: HlsErrorPayload) => void): void;
}

interface HlsErrorPayload {
  fatal: boolean;
  type: string;
}

interface HlsConstructor {
  new (config?: Record<string, unknown>): HlsInstance;
  isSupported(): boolean;
  readonly Events: Record<string, string>;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function supportsHlsNatively(): boolean {
  if (typeof document === "undefined") return false;
  const v = document.createElement("video");
  return (
    v.canPlayType("application/vnd.apple.mpegurl") !== "" ||
    v.canPlayType("application/x-mpegURL") !== ""
  );
}

// ─── SVG icons ─────────────────────────────────────────────────────────────────

function NoSignalIcon() {
  return (
    <svg
      viewBox="0 0 64 64"
      className="w-16 h-16 text-gray-600"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* TV body */}
      <rect x="4" y="16" width="56" height="38" rx="4" />
      {/* Screen X */}
      <line x1="18" y1="26" x2="46" y2="46" />
      <line x1="46" y1="26" x2="18" y2="46" />
      {/* Antenna left */}
      <line x1="22" y1="16" x2="12" y2="4" />
      {/* Antenna right */}
      <line x1="42" y1="16" x2="52" y2="4" />
      {/* Stand */}
      <line x1="24" y1="54" x2="20" y2="62" />
      <line x1="40" y1="54" x2="44" y2="62" />
      <line x1="18" y1="62" x2="46" y2="62" />
    </svg>
  );
}

// ─── Component ─────────────────────────────────────────────────────────────────

export default function HlsPlayer({ src, channelName, logo, onError }: HlsPlayerProps) {
  const videoRef    = useRef<HTMLVideoElement>(null);
  const hlsRef      = useRef<HlsInstance | null>(null);
  const timeoutRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firedError  = useRef(false);

  const [state, setState]       = useState<PlayerState>("loading");
  const [retryKey, setRetryKey] = useState(0);
  const nativeHls = supportsHlsNatively();

  // Track whether error callback was already fired for this (src, retryKey) pair
  useEffect(() => { firedError.current = false; }, [src, retryKey]);

  const markError = useCallback(() => {
    setState("error");
    if (!firedError.current) {
      firedError.current = true;
      onError?.();
    }
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
  }, [onError]);

  const startTimeout = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    // 12-second timeout: if nothing plays, consider it failed
    timeoutRef.current = setTimeout(() => {
      if (state !== "playing") markError();
    }, 12_000);
  }, [state, markError]);

  const setupHls = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !src) return;

    setState("loading");
    startTimeout();

    // ── Safari / native HLS ───────────────────────────────────────────────
    if (nativeHls) {
      video.src = src;
      video.load();
      const onCanPlay = () => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        setState("playing");
        video.play().catch(() => { /* autoplay blocked — user taps play */ });
      };
      const onNativeError = () => markError();
      video.addEventListener("canplay",  onCanPlay,      { once: true });
      video.addEventListener("error",    onNativeError,  { once: true });
      return;
    }

    // ── hls.js (Chrome / Firefox / Edge / etc.) ───────────────────────────
    try {
      const mod = await import("hls.js");
      const Hls = (mod.default ?? mod) as unknown as HlsConstructor;

      if (!Hls.isSupported()) {
        console.warn("[HlsPlayer] hls.js not supported in this browser");
        markError();
        return;
      }

      // Destroy previous instance if any
      if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }

      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 30,
        maxBufferLength: 60,
      });
      hlsRef.current = hls;

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        setState("playing");
        video.play().catch(() => { /* autoplay blocked */ });
      });

      hls.on(Hls.Events.ERROR, (_evt: string, data: HlsErrorPayload) => {
        if (!data.fatal) return;
        console.warn("[HlsPlayer] Fatal HLS error:", data.type);
        if (data.type === "networkError") {
          hls.startLoad();
        } else if (data.type === "mediaError") {
          hls.recoverMediaError();
        } else {
          markError();
        }
      });

      hls.loadSource(src);
      hls.attachMedia(video);
    } catch (err) {
      console.warn("[HlsPlayer] Could not initialise hls.js:", err);
      markError();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, nativeHls, retryKey]);

  useEffect(() => {
    void setupHls();

    return () => {
      // ── Cleanup on unmount or src change ───────────────────────────────
      if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
      if (hlsRef.current)     { hlsRef.current.destroy(); hlsRef.current = null; }
      if (videoRef.current)   { videoRef.current.src = ""; videoRef.current.load(); }
    };
  }, [setupHls]);

  const handleRetry = () => {
    firedError.current = false;
    setState("loading");
    setRetryKey((k: number) => k + 1);
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="relative w-full bg-black overflow-hidden" style={{ aspectRatio: "16/9" }}>

      {/* Always-rendered video element (hls.js needs it in the DOM) */}
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        controls
        playsInline
        aria-label={`Reproduciendo ${channelName}`}
      />

      {/* ── LOADING overlay ─────────────────────────────────────────────── */}
      {state === "loading" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-brand-dark/95 gap-4 pointer-events-none">
          <div className="relative">
            <div className="w-14 h-14 rounded-full border-[3px] border-brand-surface" />
            <div className="absolute inset-0 w-14 h-14 rounded-full border-[3px] border-brand-red border-t-transparent animate-spin" />
          </div>
          <div className="text-center px-4">
            <p className="text-white text-sm font-semibold">Conectando al canal…</p>
            <p className="text-gray-500 text-xs mt-1 truncate max-w-[240px]">{channelName}</p>
          </div>
        </div>
      )}

      {/* ── ERROR overlay ───────────────────────────────────────────────── */}
      {state === "error" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-brand-dark gap-5 p-6">
          <NoSignalIcon />
          <div className="text-center">
            <p className="text-white font-bold text-base mb-1">Canal no disponible</p>
            <p className="text-gray-400 text-xs max-w-[280px] leading-relaxed">
              Este canal no puede reproducirse desde el navegador por restricciones de red.
            </p>
          </div>
          <div className="flex gap-3 flex-wrap justify-center">
            <button
              onClick={handleRetry}
              className="px-4 py-2 bg-brand-surface border border-brand-border hover:border-gray-500 text-white text-sm font-medium rounded-lg transition-colors"
            >
              Reintentar
            </button>
            {onError && (
              <button
                onClick={onError}
                className="px-4 py-2 bg-brand-red hover:bg-red-700 text-white text-sm font-semibold rounded-lg transition-colors"
              >
                Probar otro canal
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── PLAYING — overlays ──────────────────────────────────────────── */}
      {state === "playing" && (
        <>
          {/* EN VIVO badge — top left */}
          <div className="absolute top-3 left-3 pointer-events-none">
            <span className="inline-flex items-center gap-1.5 bg-brand-red/90 backdrop-blur-sm text-white text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider shadow-lg">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              EN VIVO
            </span>
          </div>

          {/* Channel name — top right */}
          <div className="absolute top-3 right-3 pointer-events-none flex items-center gap-2 max-w-[45%]">
            {logo && (
              <img
                src={logo}
                alt={channelName}
                className="w-6 h-6 object-contain rounded"
                onError={(e: { currentTarget: HTMLImageElement }) => { e.currentTarget.style.display = "none"; }}
              />
            )}
            <span className="text-white/70 text-[10px] font-medium truncate bg-black/40 backdrop-blur-sm px-2 py-0.5 rounded">
              {channelName}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
