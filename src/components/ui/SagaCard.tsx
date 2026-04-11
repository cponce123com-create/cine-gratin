import { Link } from "wouter";
import { Layers } from "lucide-react";
import { cn } from "@/lib/utils";

interface SagaCardProps {
  collectionId: number;
  name: string;
  coverUrl: string;
  itemCount: number;
  className?: string;
}

export function SagaCard({ collectionId, name, coverUrl, itemCount, className }: SagaCardProps) {
  return (
    <Link
      to={`/collection/${collectionId}`}
      className={cn(
        "group relative flex flex-col gap-2 overflow-hidden rounded-xl bg-card p-2 transition-all hover:bg-accent/50",
        className
      )}
    >
      <div className="relative aspect-[2/3] overflow-hidden rounded-lg shadow-md">
        {coverUrl ? (
          <img
            src={coverUrl}
            alt={name}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            onError={(e) => { (e.target as HTMLImageElement).src = "https://via.placeholder.com/400x600/1a1a1a/e5e5e5?text=Saga"; }}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-muted">
            <Layers className="h-12 w-12 text-muted-foreground/50" />
          </div>
        )}
        <div className="absolute right-2 top-2 rounded-md bg-black/60 px-2 py-1 text-xs font-medium text-white backdrop-blur-sm">
          Saga
        </div>
      </div>

      <div className="flex flex-col px-1 pb-1">
        <h3 className="line-clamp-1 text-sm font-semibold text-foreground group-hover:text-primary">
          {name}
        </h3>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Layers className="h-3 w-3" />
          <span>
            {itemCount} {itemCount === 1 ? "título" : "títulos"}
          </span>
        </div>
      </div>
    </Link>
  );
}
