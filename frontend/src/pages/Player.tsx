import { useSearchParams, useNavigate } from "react-router-dom";
import { useEffect, useRef } from "react";

/**
 * Origins allowed to be embedded.
 *
 * The player receives the media URL from the query string, so it must never
 * embed an arbitrary origin: that would turn the player into a frame for any
 * website. The list matches the providers used by the catalogue.
 */
const ALLOWED_EMBED_ORIGINS = [
  "https://www.youtube.com",
  "https://youtube.com",
  "https://www.youtube-nocookie.com",
  "https://youtube-nocookie.com",
  "https://youtu.be",
  "https://vidsrc.me",
  "https://vidsrc.xyz",
  "https://vidsrc.to",
  "https://vidsrc.mov",
  "https://www.2embed.cc",
  "https://2embed.org",
  "https://vidembed.io",
  "https://multiembed.mov",
];

/** Returns the URL when its origin is allowed, or null otherwise. */
function allowedUrl(url: string): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    const origin = parsed.origin.toLowerCase();
    const permitted = ALLOWED_EMBED_ORIGINS.some(
      (allowed) => origin === allowed || origin.endsWith(`.${allowed.replace(/^https?:\/\//, "")}`),
    );
    return permitted ? url : null;
  } catch {
    return null;
  }
}

function isYouTube(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return (
      hostname === "youtube.com" ||
      hostname.endsWith(".youtube.com") ||
      hostname === "youtu.be" ||
      hostname === "youtube-nocookie.com" ||
      hostname.endsWith(".youtube-nocookie.com")
    );
  } catch {
    return false;
  }
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

  // Only allowed origins are embedded; anything else is refused.
  const safeUrl = allowedUrl(rawUrl);
  const blocked = rawUrl.length > 0 && safeUrl === null;
  const youtube = safeUrl ? isYouTube(safeUrl) : false;
  const embedUrl = safeUrl ? (youtube ? toEmbedUrl(safeUrl) : safeUrl) : "";

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
      {blocked ? (
        <div className="flex-1 flex items-center justify-center px-6">
          <div className="text-center max-w-md">
            <p className="text-red-400 text-lg mb-2">Origen de reproducción no permitido</p>
            <p className="text-gray-400 text-sm mb-4">
              La URL solicitada no pertenece a ninguno de los proveedores de streaming compatibles.
            </p>
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="text-brand-red hover:text-red-400 underline text-sm focus-visible:ring-2 focus-visible:ring-brand-red"
            >
              Volver
            </button>
          </div>
        </div>
      ) : !rawUrl ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-gray-400 text-lg mb-4">No hay contenido para reproducir.</p>
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="text-brand-red hover:text-red-400 underline text-sm focus-visible:ring-2 focus-visible:ring-brand-red"
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
