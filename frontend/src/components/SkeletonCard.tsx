export default function SkeletonCard() {
  return (
    <div className="flex-shrink-0 w-36 md:w-44 animate-pulse">
      <div className="aspect-[2/3] w-full rounded-lg bg-brand-surface" />
      <div className="mt-2 h-3 w-3/4 rounded bg-brand-surface" />
    </div>
  );
}

export function SkeletonGrid({ count = 12 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="animate-pulse">
          <div className="aspect-[2/3] w-full rounded-lg bg-brand-surface" />
          <div className="mt-2 h-3 w-3/4 rounded bg-brand-surface" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonHero() {
  return (
    <div className="relative w-full h-[70vh] min-h-[500px] animate-pulse bg-brand-surface">
      <div className="absolute bottom-12 left-8 space-y-4">
        <div className="h-10 w-64 rounded bg-brand-border" />
        <div className="h-4 w-96 rounded bg-brand-border" />
        <div className="h-4 w-72 rounded bg-brand-border" />
        <div className="flex gap-3 mt-4">
          <div className="h-10 w-28 rounded bg-brand-border" />
          <div className="h-10 w-28 rounded bg-brand-border" />
        </div>
      </div>
    </div>
  );
}
