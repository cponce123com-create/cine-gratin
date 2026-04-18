import { useEffect, useRef, useState, useCallback } from "react";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface HlsPlayerProps {
  src: string;
  channelName: string;
}

type PlayerState = "loading" | "playing" | "error";

// HLS instance type — using a minimal interface so we don't depend
// on generated typedefs from the UMD bundle during typecheck
interface HlsInstance {
  loadSource(src: string): void;
  attachMedia(media: HTMLMediaElement): void;
  destroy(): void;
  recoverMediaError(): void;
  startLoad(): void;
  on(event: string, cb: (event: string, data: HlsErrorData) => void): void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly Events: Record<string, string>;
}

interface HlsErrorData {
  fatal: boolean;
  type: string;
}

// Constructor interface (what hls.js exports as default)
interface HlsConstructor {
  new (config?: Record<string, unknown>): HlsInstance;
  isSupported(): boolean;
  readonly Events: Record<string, string>;
}

// ─── Native HLS detection ──────────────────────────────────────────────────────

/**
 * Returns true if the current browser can play HLS natively (e.g. Safari).
 * In that case we skip hls.js entirely and use <video src> directly.
 */
function canPlayHlsNatively(): boolean {
  if (typeof document === "undefined") return false;
  const video = document.createElement("video");
  return (
    video.canPlayType("application/vnd.apple.mpegurl") !== "" ||
    video.canPlayType("application/x-mpegURL") !== ""
  );
}

// ─── Component ─────────────────────────────────────────────────────────────────

export default function HlsPlayer({ src, channelName }: HlsPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<HlsInstance | null>(null);
  const [state, setState] = useState<PlayerState>("loading");
  const [retryKey, setRetryKey] = useState(0);
  const nativeHls = canPlayHlsNatively();

  const setupHls = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !src) return;

    setState("loading");

    // ── Native HLS (Safari) ────────────────────────────────────────────────
    if (nativeHls) {
      video.src = src;
      video.load();
      const onCanPlay = () => setState("playing");
      const onError = () => setState("error");
      video.addEventListener("canplay", onCanPlay, { once: true });
      video.addEventListener("error", onError, { once: true });
      return;
    }

    // ── hls.js (all other browsers) ───────────────────────────────────────
    try {
      // Dynamic import — Vite will code-split this automatically
      const HlsModule = await import("hls.js");
      // The UMD bundle exports Hls on .default (ESM) or directly (CJS)
      const Hls = (HlsModule.default ?? HlsModule) as unknown as HlsConstructor;

      if (!Hls.isSupported()) {
        console.warn("[HlsPlayer] hls.js is not supported in this browser");
        setState("error");
        return;
      }

      // Destroy any previous instance before creating a new one
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }

      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 30,
      });
      hlsRef.current = hls;

      hls.on(Hls.Events.MANIFEST_PARSED, (_evt: string, _data: HlsErrorData) => {
        setState("playing");
        video.play().catch(() => {
          // Autoplay may be blocked — user can click play manually
        });
      });

      hls.on(Hls.Events.ERROR, (_evt: string, data: HlsErrorData) => {
        if (data.fatal) {
          console.warn("[HlsPlayer] Fatal HLS error:", data.type);
          if (data.type === "networkError") {
            hls.startLoad();
          } else if (data.type === "mediaError") {
            hls.recoverMediaError();
          } else {
            setState("error");
          }
        }
      });

      hls.loadSource(src);
      hls.attachMedia(video);
    } catch (err) {
      console.warn("[HlsPlayer] Failed to initialise hls.js:", err);
      setState("error");
    }
  }, [src, nativeHls, retryKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    void setupHls();

    return () => {
      // Cleanup hls.js instance to prevent memory leaks
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      // Unload native video src to free resources
      if (videoRef.current) {
        videoRef.current.src = "";
        videoRef.current.load();
      }
    };
  }, [setupHls]);

  const handleRetry = () => {
    setState("loading");
    setRetryKey((k: number) => k + 1);
  };

  return (
    <div className="relative w-full bg-black rounded-xl overflow-hidden" style={{ aspectRatio: "16/9" }}>
      {/* Video element — always rendered so ref is available */}
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        controls
        playsInline
        autoPlay
        muted={false}
        aria-label={`Reproduciendo ${channelName}`}
      />

      {/* Loading overlay */}
      {state === "loading" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-brand-dark/90 gap-3">
          <div className="w-10 h-10 rounded-full border-[3px] border-brand-red border-t-transparent animate-spin" />
          <p className="text-gray-400 text-sm font-medium">Conectando al canal…</p>
          <p className="text-gray-600 text-xs max-w-xs text-center">{channelName}</p>
        </div>
      )}

      {/* Error overlay */}
      {state === "error" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-brand-dark/95 gap-4 p-6">
          {/* TV broken icon */}
          <div className="text-5xl">📺</div>
          <div className="text-center">
            <p className="text-white font-semibold text-base mb-1">Canal no disponible</p>
            <p className="text-gray-400 text-xs max-w-xs leading-relaxed">
              Este canal no pudo cargar. Puede ser por restricciones de red (CORS) o que el stream esté offline.
            </p>
          </div>
          <button
            onClick={handleRetry}
            className="px-5 py-2 bg-brand-red hover:bg-red-700 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            Reintentar
          </button>
          <p className="text-gray-600 text-xs">Prueba seleccionando otro canal</p>
        </div>
      )}

      {/* Channel name watermark when playing */}
      {state === "playing" && (
        <div className="absolute top-3 left-3 flex items-center gap-2 pointer-events-none">
          <span className="flex items-center gap-1.5 bg-brand-red/90 text-white text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wide">
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
            EN VIVO
          </span>
        </div>
      )}
    </div>
  );
}
