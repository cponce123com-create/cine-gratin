import { useState } from "react";
import type { TmdbVideo } from "@/lib/types";
import { VIDEO_TYPE_COLORS } from "./constants";

export function VideoTypeLabel({ type }: { type: string }) {
  return (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${VIDEO_TYPE_COLORS[type] ?? "bg-gray-600"} text-white`}>
      {type}
    </span>
  );
}

export function VideoCard({ video }: { video: TmdbVideo }) {
  const [playing, setPlaying] = useState(false);
  const thumb = `https://img.youtube.com/vi/${video.key}/hqdefault.jpg`;

  if (playing) {
    return (
      <div className="relative aspect-video w-full rounded-xl overflow-hidden bg-black shadow-xl">
        <iframe
          src={`https://www.youtube.com/embed/${video.key}?autoplay=1`}
          className="absolute inset-0 w-full h-full"
          allowFullScreen
          allow="autoplay; encrypted-media; picture-in-picture"
          title={video.name}
        />
      </div>
    );
  }

  return (
    <button
      onClick={() => setPlaying(true)}
      className="group relative aspect-video w-full rounded-xl overflow-hidden bg-brand-surface shadow-xl border border-brand-border hover:border-red-500/50 transition-all"
    >
      <img src={thumb} alt={video.name} className="w-full h-full object-cover" />
      <div className="absolute inset-0 bg-black/40 group-hover:bg-black/20 transition-colors" />
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="w-12 h-12 rounded-full bg-brand-red/90 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
          <svg className="w-5 h-5 text-white ml-0.5" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
        </div>
      </div>
      <div className="absolute bottom-0 inset-x-0 p-2 bg-gradient-to-t from-black/90 to-transparent">
        <div className="flex items-start gap-1.5">
          <VideoTypeLabel type={video.type} />
          <p className="text-white text-xs font-medium leading-tight line-clamp-2 flex-1 text-left">{video.name}</p>
        </div>
      </div>
    </button>
  );
}
