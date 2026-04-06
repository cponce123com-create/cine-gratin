import { useSearchParams, useNavigate } from "react-router-dom";
import { useEffect, useRef } from "react";

function isYouTube(url: string): boolean {
  return (
    url.includes("youtube.com") ||
    url.includes("youtu.be") ||
    url.includes("youtube-nocookie.com")
  );
}

function toEmbedUrl(url: string): string {
  if (url.includes("/embed/")) return url;
  const watchMatch = url.match(/[?&]v=([^&]+)/);
  if (watchMatch) return `https://www.youtube.com/embed/${watchMatch[1]}?autoplay=1`;
  const shortMatch = url.match(/youtu\.be\/([^?]+)/);
  if (shortMatch) return `https://www.youtube.com/embed/${shortMatch[1]}?autoplay=1`;
  return url;
}

export default function Player() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);

  const rawUrl = params.get("url") ?? "";
  const title = params.get("title") ?? "Reproduciendo";
  const label = params.get("label") ?? "";

  const youtube = isYouTube(rawUrl);
  const embedUrl = youtube ? toEmbedUrl(rawUrl) : rawUrl;

  // Auto-focus video on mount
  useEffect(() => {
    if (videoRef.current) videoRef.current.focus();
  }, []);

  // Keyboard: Escape exits
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") navigate(-1);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [navigate]);

  return (
    <div className="fixed inset-0 bg-black flex flex-col z-50">
      {/* Top bar */}
      <div className="flex items-center gap-4 px-4 py-3 bg-gradient-to-b from-black/80 to-transparent z-10 absolute top-0 left-0 right-0">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-gray-300 hover:text-white transition-colors group"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="text-sm font-medium">Volver</span>
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-white font-semibold text-sm truncate">{title}</p>
          {label && <p className="text-gray-400 text-xs truncate">{label}</p>}
        </div>
      </div>

      {/* Player */}
      {!rawUrl ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-gray-400 text-lg mb-4">No hay contenido para reproducir.</p>
            <button
              onClick={() => navigate(-1)}
              className="text-brand-red hover:text-red-400 underline text-sm"
            >
              Volver
            </button>
          </div>
        </div>
      ) : youtube ? (
        <iframe
          src={embedUrl}
          title={title}
          className="flex-1 w-full h-full border-0"
          allowFullScreen
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
        />
      ) : (
        <video
          ref={videoRef}
          src={embedUrl}
          controls
          autoPlay
          className="flex-1 w-full h-full bg-black"
          style={{ outline: "none" }}
          onError={() => {
            // If video fails, we still show controls so the user can see the error
          }}
        >
          Tu navegador no soporta este formato de video.
        </video>
      )}
    </div>
  );
}
