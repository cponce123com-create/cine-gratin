export function ChannelInitial({ name }: { name: string }) {
  return (
    <div className="w-full h-full flex items-center justify-center bg-brand-surface">
      <span className="text-brand-gold font-black text-lg leading-none">
        {(name || "?")[0].toUpperCase()}
      </span>
    </div>
  );
}

export function LiveBadge({ offline = false }: { offline?: boolean }) {
  if (offline) {
    return (
      <span className="inline-flex items-center gap-1 bg-gray-700/60 text-gray-400 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide flex-shrink-0 whitespace-nowrap">
        Sin señal
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 bg-brand-red/15 text-brand-red text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide flex-shrink-0 whitespace-nowrap">
      <span className="w-1.5 h-1.5 rounded-full bg-brand-red animate-pulse" />
      EN VIVO
    </span>
  );
}

export function SearchIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  );
}
