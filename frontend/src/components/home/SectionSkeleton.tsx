export default function SectionSkeleton({ title }: { title: string }) {
  return (
    <div className="px-4 sm:px-6 lg:px-8 mb-10">
      <div className="flex items-center gap-3 mb-4">
        <span className="w-2 h-7 bg-brand-surface rounded-full animate-pulse" />
        <div className="h-6 w-48 bg-brand-surface rounded animate-pulse" />
      </div>
      <div className="flex gap-4 overflow-hidden">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex-shrink-0 w-36 md:w-44 animate-pulse">
            <div className="aspect-[2/3] w-full rounded-lg bg-brand-surface" />
            <div className="mt-2 h-3 w-3/4 rounded bg-brand-surface" />
          </div>
        ))}
      </div>
    </div>
  );
}
