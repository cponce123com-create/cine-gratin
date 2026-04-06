import { useLocation } from "wouter";
import { ArrowLeft } from "lucide-react";

export default function Player() {
  const [location, setLocation] = useLocation();
  
  // Extract query params from URL manually since Wouter doesn't have a built-in hook for search params
  const searchParams = new URLSearchParams(window.location.search);
  const url = searchParams.get("url") || "";
  const title = searchParams.get("title") || "Reproductor";
  
  const isYouTube = url.includes("youtube.com") || url.includes("youtu.be");
  
  const handleBack = () => {
    window.history.back();
  };

  if (!url) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center text-white">
        <p className="text-xl mb-4">No se proporcionó URL de video.</p>
        <button onClick={handleBack} className="text-primary hover:underline">Volver</button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black text-white flex flex-col">
      {/* Top Bar (Auto-hides on idle could be added here, keeping simple for now) */}
      <div className="absolute top-0 w-full p-4 bg-gradient-to-b from-black/80 to-transparent z-10 flex items-center justify-between opacity-0 hover:opacity-100 transition-opacity duration-300">
        <button 
          onClick={handleBack}
          className="flex items-center gap-2 bg-black/50 hover:bg-black/80 px-4 py-2 rounded-full backdrop-blur-sm transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>Volver</span>
        </button>
        <h2 className="text-lg font-medium tracking-wide">{title}</h2>
        <div className="w-24"></div> {/* Spacer for balance */}
      </div>

      {/* Player Area */}
      <div className="flex-1 w-full h-full flex items-center justify-center bg-black">
        {isYouTube ? (
          <iframe
            src={url.replace("watch?v=", "embed/") + "?autoplay=1&rel=0"}
            title={title}
            className="w-full h-full border-0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          ></iframe>
        ) : (
          <video
            src={url}
            controls
            autoPlay
            className="w-full h-full outline-none"
            controlsList="nodownload"
          />
        )}
      </div>
    </div>
  );
}
