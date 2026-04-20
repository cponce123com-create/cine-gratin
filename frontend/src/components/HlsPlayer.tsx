import { useEffect, useRef, useState } from "react";

// ─── Types ──────────────────────────────────────────────────────────────────────

interface HlsPlayerProps {
  /** React key (used by parent to force remount on channel change) */
  key?: string;
  /** HLS stream URL (.m3u8) */
  src: string;
  /** Channel display name */
  channelName: string;
  /** Optional channel logo URL */
  logo?: string;
  /** Called once when the channel fails definitively (timeout / fatal error) */
  onError?: () => void;
}

type PlayerState = "loading" | "playing" | "error";

// Minimal typed surface for the hls.js UMD bundle we load dynamically
interface HlsErrorData {
  fatal: boolean;
  type: string;
}

interface HlsInstance {
  loadSource(src: string): void;
  attachMedia(media: HTMLMediaElement): void;
  destroy(): void;
  on(event: string, cb: (evt: string, data: HlsErrorData) => void): void;
}

interface HlsStatic {
  new (cfg?: Record<string, unknown>): HlsInstance;
  isSupported(): boolean;
  readonly Events: Record<string, string>;
}

// ─── SVG icon ───────────────────────────────────────────────────────────────────

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
      {/* Antennas */}
      <line x1="22" y1="16" x2="12" y2="4" />
      <line x1="42" y1="16" x2="52" y2="4" />
      {/* Stand */}
      <line x1="24" y1="54" x2="20" y2="62" />
      <line x1="40" y1="54" x2="44" y2="62" />
      <line x1="18" y1="62" x2="46" y2="62" />
    </svg>
  );
}

// ─── Component ──────────────────────────────────────────────────────────────────

export default function HlsPlayer({ src, channelName, logo, onError }: HlsPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  // CRITICAL: hls instance lives in a ref, never in local scope, so the
  // cleanup function always has access to it even after async operations.
  const hlsRef   = useRef<HlsInstance | null>(null);

  const [state,    setState]    = useState<PlayerState>("loading");
  const [retryKey, setRetryKey] = useState(0);

  // ─── Core effect — runs when src or retryKey changes ───────────────────────
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    // ── STEP 1: destroy any previous hls instance SYNCHRONOUSLY ─────────────
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    // ── STEP 2: fully reset the video element so no audio bleeds through ─────
    video.pause();
    video.removeAttribute("src");
    video.load(); // forces the browser to release the media buffer

    setState("loading");

    // ── STEP 3: 12-second safety timeout ────────────────────────────────────
    let cancelled = false; // guard for async path
    const timeout = setTimeout(() => {
      if (!cancelled) {
        setState("error");
        onError?.();
      }
    }, 12_000);

    // ── STEP 4: Safari — native HLS ─────────────────────────────────────────
    // We feature-detect at runtime instead of caching, because supportsHlsNatively
    // is called inside the effect (no stale closure risk).
    const nativeHls =
      video.canPlayType("application/vnd.apple.mpegurl") !== "" ||
      video.canPlayType("application/x-mpegURL") !== "";

    if (nativeHls) {
      video.src = src;
      video.load();

      const onCanPlay = () => {
        if (cancelled) return;
        clearTimeout(timeout);
        setState("playing");
        video.play().catch(() => {/* autoplay policy — user will tap play */});
      };
      const onNativeError = () => {
        if (cancelled) return;
        clearTimeout(timeout);
        setState("error");
        onError?.();
      };

      video.addEventListener("canplay", onCanPlay,      { once: true });
      video.addEventListener("error",   onNativeError,  { once: true });

      return () => {
        cancelled = true;
        clearTimeout(timeout);
        video.removeEventListener("canplay", onCanPlay);
        video.removeEventListener("error",   onNativeError);
        video.pause();
        video.removeAttribute("src");
        video.load();
      };
    }

    // ── STEP 5: hls.js path (Chrome / Firefox / Edge / etc.) ────────────────
    // We use a dynamic import so the 400 kB bundle is code-split.
    // The import is kicked off asynchronously but the cleanup is guaranteed
    // to run because we track `cancelled` and hlsRef.current.
    void (async () => {
      let Hls: HlsStatic;
      try {
        const mod = await import("hls.js");
        Hls = (mod.default ?? mod) as unknown as HlsStatic;
      } catch {
        if (!cancelled) { clearTimeout(timeout); setState("error"); onError?.(); }
        return;
      }

      // Bail out if cleanup already ran while we were importing
      if (cancelled) return;

      if (!Hls.isSupported()) {
        clearTimeout(timeout);
        setState("error");
        onError?.();
        return;
      }

      // ── Create instance and save to ref IMMEDIATELY ──────────────────────
      const hls = new Hls({
        enableWorker:   true,
        lowLatencyMode: true,
        backBufferLength: 90,
      });
      hlsRef.current = hls; // ← ref updated before any event subscription

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (cancelled) return;
        clearTimeout(timeout);
        setState("playing");
        video.play().catch(() => {/* autoplay policy */});
      });

      hls.on(Hls.Events.ERROR, (_evt: string, data: HlsErrorData) => {
        if (!data.fatal || cancelled) return;
        clearTimeout(timeout);
        setState("error");
        // Destroy immediately so the dead instance does not keep buffering
        hls.destroy();
        hlsRef.current = null;
        onError?.();
      });

      hls.loadSource(src);
      hls.attachMedia(video);
    })();

    // ── STEP 6: cleanup — runs when src/retryKey changes OR on unmount ──────
    return () => {
      cancelled = true;
      clearTimeout(timeout);

      // Destroy the hls instance via ref (works even if async init is still
      // in flight — when it eventually stores the instance, we destroy it).
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }

      // Reset the video element — this is what stops the audio
      video.pause();
      video.removeAttribute("src");
      video.load(); // mandatory: releases the audio/video buffer in the browser
    };

  // retryKey is intentionally included so "Reintentar" re-runs the full setup.
  // onError is stable (useCallback in parent) so it won't cause extra runs.
  }, [src, retryKey, onError]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRetry = () => {
    setState("loading");
    setRetryKey((k: number) => k + 1);
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="relative w-full bg-black overflow-hidden" style={{ aspectRatio: "16/9" }}>

      {/* video element is always in the DOM — hls.js needs a stable reference */}
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        controls
        playsInline
        aria-label={`Reproduciendo ${channelName}`}
      />

      {/* ── LOADING overlay ───────────────────────────────────────────────── */}
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

      {/* ── ERROR overlay ─────────────────────────────────────────────────── */}
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

      {/* ── PLAYING overlays ──────────────────────────────────────────────── */}
      {state === "playing" && (
        <>
          {/* EN VIVO badge — top left */}
          <div className="absolute top-3 left-3 pointer-events-none">
            <span className="inline-flex items-center gap-1.5 bg-brand-red/90 backdrop-blur-sm text-white text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider shadow-lg">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              EN VIVO
            </span>
          </div>

          {/* Channel name + logo — top right */}
          <div className="absolute top-3 right-3 pointer-events-none flex items-center gap-2 max-w-[45%]">
            {logo && (
              <img
                src={logo}
                alt={channelName}
                className="w-6 h-6 object-contain rounded"
                onError={(e: { currentTarget: HTMLImageElement }) => {
                  e.currentTarget.style.display = "none";
                }}
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
