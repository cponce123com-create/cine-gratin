export function SkeletonRows() {
  return (
    <div className="space-y-0.5 p-1">
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-3 py-2.5 animate-pulse">
          <div className="w-10 h-10 rounded-md bg-brand-surface flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-3 bg-brand-surface rounded w-3/4" />
            <div className="h-2.5 bg-brand-surface rounded w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SkeletonCards() {
  return (
    <div className="grid grid-cols-2 gap-2 p-2">
      {Array.from({ length: 12 }).map((_, i) => (
        <div key={i} className="flex flex-col gap-2 p-2 rounded-xl bg-brand-card border border-brand-border animate-pulse">
          <div className="w-full aspect-square rounded-lg bg-brand-surface" />
          <div className="h-2.5 bg-brand-surface rounded w-4/5 mx-auto" />
          <div className="h-2 bg-brand-surface rounded w-3/5 mx-auto" />
        </div>
      ))}
    </div>
  );
}
