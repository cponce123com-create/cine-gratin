import { memo } from "react";
import { Link } from "react-router-dom";

interface SagaCardProps {
  collectionId: number;
  name: string;
  covers: string[];
}

const FALLBACK =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='300' viewBox='0 0 200 300'%3E%3Crect width='200' height='300' fill='%231a1a1a'/%3E%3C/svg%3E";

const SagaCard = memo(function SagaCard({ collectionId, name, covers }: SagaCardProps) {
  const filled = [...covers, FALLBACK, FALLBACK, FALLBACK, FALLBACK].slice(0, 4);

  return (
    <Link
      to={`/saga/${collectionId}`}
      className="group flex-shrink-0 w-36 md:w-44 cursor-pointer"
    >
      <div className="relative overflow-hidden rounded-lg bg-brand-surface card-hover aspect-[2/3]">
        {covers.length === 1 ? (
          <img
            src={covers[0] || FALLBACK}
            alt={name}
            loading="lazy"
            className="w-full h-full object-cover"
            onError={(e) => { (e.currentTarget as HTMLImageElement).src = FALLBACK; }}
          />
        ) : (
          <div className="grid grid-cols-2 grid-rows-2 w-full h-full gap-0.5">
            {filled.map((src, i) => (
              <img
                key={i}
                src={src}
                alt=""
                loading="lazy"
                className="w-full h-full object-cover"
                onError={(e) => { (e.currentTarget as HTMLImageElement).src = FALLBACK; }}
              />
            ))}
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
        <div className="absolute bottom-0 w-full p-2">
          <p className="text-white font-bold text-xs leading-tight line-clamp-2 drop-shadow">
            {name}
          </p>
        </div>
      </div>
    </Link>
  );
});

export default SagaCard;
