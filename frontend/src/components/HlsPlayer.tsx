import { useEffect, useRef, useState } from "react";

// ─── Types ──────────────────────────────────────────────────────────────────

interface HlsPlayerProps {
  src: string;
  channelName: string;
  logo?: string;
  onError?: () => void;
}

type PlayerState = "loading" | "playing" | "error";

interface HlsInstance {
  loadSource(src: string): void;
  attachMedia(media: HTMLMediaElement): void;
  destroy(): void;
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

// ─── Helpers ────────────────────────────────────────────────────────────────

function supportsHlsNatively(): boolean {
  if (typeof document === "undefined") return false;
  const v = document.createElement("video");
  return (
    v.canPlayType("application/vnd.apple.mpegurl") !== "" ||
    v.canPlayType("application/x-mpegURL") !== ""
  );
}

function resetVideo(video: HTMLVideoElement) {
  video.pause();
  video.removeAttribute("src");
  while (video.firstChild) video.removeChild(video.firstChild);
  video.load();
}

// ─── Icons ──────────────────────────────────────────────────────────────────

function NoSignalIcon() {
  return (
    <svg viewBox="0 0 64 64" className="w-16 h-16 text-gray-600"
      fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="16" width="56" height="38" rx="4" />
      <line x1="18" y1="26" x2="46" y2="46" />
      <line x1="46" y1="26" x2="18" y2="46" />
      <line x1="22" y1="16" x2="12" y2="4" />
      <line x1="42" y1="16" x2="52" y2="4" />
      <line x1="24" y1="54" x2="20" y2="62" />
      <line x1="40" y1="54" x2="44" y2="62" />
      <line x1="18" y1="62" x2="46" y2="62" />
    </svg>
  );
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function HlsPlayer({ src, channelName, logo, onError }: HlsPlayerProps) {
  const videoRef   = useRef<HTMLVideoElement>(null);
  const hlsRef     = useRef<HlsInstance | null>(null);
  // cancelRef: se pone en true en el cleanup para que el import() async
  // no ejecute nada si src ya cambió antes de que terminara de cargar.
  // ESTE es el fix del doble audio: el import("hls.js") es async, y sin
  // cancelRef, la instancia hls se crea DESPUÉS del cleanup, nunca se destruye,
  // y queda reproduciéndose en paralelo con la nueva.
  const cancelRef  = useRef(false);
  const onErrorRef = useRef(onError);

  useEffect(() => { onErrorRef.current = onError; }, [onError]);

  const [status, setStatus] = useState<PlayerState>("loading");

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    // 1. Cancelar cualquier import() async pendiente del efecto anterior
    cancelRef.current = false;

    // 2. Destruir instancia HLS anterior SINCRÓNICAMENTE (si ya existía)
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    // 3. Resetear el elemento <video> completamente (libera buffer de audio)
    resetVideo(video);
    setStatus("loading");

    const timeout = setTimeout(() => {
      if (!cancelRef.current) setStatus("error");
    }, 12000);

    // ── Safari / iOS: HLS nativo ──────────────────────────────────────────
    if (supportsHlsNatively()) {
      video.src = src;
      video.load();

      const onCanPlay = () => {
        if (cancelRef.current) return;
        clearTimeout(timeout);
        setStatus("playing");
        video.play().catch(() => {});
      };
      const onNativeError = () => {
        if (cancelRef.current) return;
        clearTimeout(timeout);
        setStatus("error");
        onErrorRef.current?.();
      };

      video.addEventListener("canplay", onCanPlay, { once: true });
      video.addEventListener("error",   onNativeError, { once: true });

      return () => {
        cancelRef.current = true;
        clearTimeout(timeout);
        video.removeEventListener("canplay", onCanPlay);
        video.removeEventListener("error",   onNativeError);
        resetVideo(video);
      };
    }

    // ── Resto de browsers: hls.js (import async) ─────────────────────────
    // NOTA: el .then() se ejecuta en el siguiente tick o después.
    // El cleanup return() se ejecuta SINCRÓNICAMENTE cuando src cambia.
    // cancelRef.current = true en el cleanup evita que el .then() haga algo.
    import("hls.js").then((mod) => {
      if (cancelRef.current) return; // src ya cambió, ignorar

      const Hls = (mod.default ?? mod) as unknown as HlsConstructor;

      if (!Hls.isSupported()) {
        clearTimeout(timeout);
        setStatus("error");
        onErrorRef.current?.();
        return;
      }

      const hls = new Hls({
        enableWorker:     true,
        lowLatencyMode:   true,
        backBufferLength: 30,
      });

      hlsRef.current = hls; // guardar ANTES de suscribir eventos

      hls.loadSource(src);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (cancelRef.current) return;
        clearTimeout(timeout);
        video.play()
          .then(() => { if (!cancelRef.current) setStatus("playing"); })
          .catch(() => { if (!cancelRef.current) setStatus("error"); });
      });

      hls.on(Hls.Events.ERROR, (_evt, data: HlsErrorPayload) => {
        if (cancelRef.current || !data.fatal) return;
        clearTimeout(timeout);
        setStatus("error");
        onErrorRef.current?.();
      });

    }).catch(() => {
      if (cancelRef.current) return;
      clearTimeout(timeout);
      setStatus("error");
      onErrorRef.current?.();
    });

    // ── Cleanup SÍNCRONO ─────────────────────────────────────────────────
    return () => {
      cancelRef.current = true;   // cancela el import() si aún no terminó
      clearTimeout(timeout);
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      resetVideo(video);
    };

  }, [src]); // solo src — onError se maneja via ref

  const handleRetry = () => {
    setStatus("loading");
    const video = videoRef.current;
    if (!video) return;
    resetVideo(video);
    video.src = src;
    video.load();
    video.play().catch(() => {});
  };

  return (
    <div className="relative w-full bg-black overflow-hidden" style={{ aspectRatio: "16/9" }}>
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        controls
        playsInline
        aria-label={`Reproduciendo ${channelName}`}
      />

      {status === "loading" && (
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

      {status === "error" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-brand-dark gap-5 p-6">
          <NoSignalIcon />
          <div className="text-center">
            <p className="text-white font-bold text-base mb-1">Canal no disponible</p>
            <p className="text-gray-400 text-xs max-w-[280px] leading-relaxed">
              Este canal no puede reproducirse desde el navegador por restricciones de red.
            </p>
          </div>
          <div className="flex gap-3 flex-wrap justify-center">
            <button onClick={handleRetry}
              className="px-4 py-2 bg-brand-surface border border-brand-border hover:border-gray-500 text-white text-sm font-medium rounded-lg transition-colors">
              Reintentar
            </button>
            {onError && (
              <button onClick={onError}
                className="px-4 py-2 bg-brand-red hover:bg-red-700 text-white text-sm font-semibold rounded-lg transition-colors">
                Probar otro canal
              </button>
            )}
          </div>
        </div>
      )}

      {status === "playing" && (
        <>
          <div className="absolute top-3 left-3 pointer-events-none">
            <span className="inline-flex items-center gap-1.5 bg-brand-red/90 backdrop-blur-sm text-white text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider shadow-lg">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              EN VIVO
            </span>
          </div>
          <div className="absolute top-3 right-3 pointer-events-none flex items-center gap-2 max-w-[45%]">
            {logo && (
              <img src={logo} alt={channelName} className="w-6 h-6 object-contain rounded"
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
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
