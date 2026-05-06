import { useState } from "react";
import type { TmdbReview } from "@/lib/types";

export function ReviewCard({ review }: { review: TmdbReview }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = review.content.length > 280;
  const text = expanded || !isLong ? review.content : review.content.slice(0, 280) + "…";
  const dateStr = review.created_at
    ? new Date(review.created_at).toLocaleDateString("es-MX", { year: "numeric", month: "long" })
    : null;

  return (
    <div className="bg-brand-surface border border-brand-border rounded-xl p-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-brand-red/20 border border-brand-red/30 flex items-center justify-center text-sm font-bold text-brand-red">
            {review.author[0]?.toUpperCase() ?? "?"}
          </div>
          <div>
            <p className="text-white font-semibold text-sm">{review.author}</p>
            {dateStr && <p className="text-gray-500 text-xs">{dateStr}</p>}
          </div>
        </div>
        {review.rating !== null && review.rating !== undefined && (
          <span className="flex items-center gap-1 text-brand-gold font-bold text-sm flex-shrink-0">
            ★ {Number(review.rating).toFixed(1)}
          </span>
        )}
      </div>
      <p className="text-gray-300 text-sm leading-relaxed">{text}</p>
      {isLong && (
        <button onClick={() => setExpanded(v => !v)} className="mt-2 text-brand-red hover:text-red-400 text-xs font-medium transition-colors">
          {expanded ? "Leer menos" : "Leer más"}
        </button>
      )}
    </div>
  );
}
