import { useState } from "react";
import type { CastMember } from "@/lib/types";
import { FALLBACK_PERSON } from "./constants";
import { ActorModal } from "./ActorModal";

export function CastSection({ cast }: { cast: CastMember[] }) {
  const [selectedPersonId, setSelectedPersonId] = useState<number | null>(null);
  if (!cast || cast.length === 0) return null;

  return (
    <>
      <div className="mt-12">
        <h2 className="text-xl font-bold text-white mb-4">
          Reparto principal
          <span className="ml-2 text-sm font-normal text-gray-500">{cast.length}</span>
        </h2>
        <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
          {cast.map(member => (
            <button
              key={member.id}
              onClick={() => setSelectedPersonId(member.id)}
              className="flex-shrink-0 w-28 text-left group"
            >
              <div className="aspect-[2/3] rounded-xl overflow-hidden bg-brand-surface border border-brand-border group-hover:border-brand-red/60 transition-colors">
                <img
                  src={member.profile_url || FALLBACK_PERSON}
                  alt={member.name}
                  className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-300"
                  loading="lazy"
                  onError={e => { (e.currentTarget as HTMLImageElement).src = FALLBACK_PERSON; }}
                />
              </div>
              <p className="mt-1.5 text-xs font-bold text-white truncate group-hover:text-brand-red transition-colors">
                {member.name}
              </p>
              {member.character && (
                <p className="text-[10px] text-gray-500 truncate">{member.character}</p>
              )}
            </button>
          ))}
        </div>
      </div>

      {selectedPersonId !== null && (
        <ActorModal personId={selectedPersonId} onClose={() => setSelectedPersonId(null)} />
      )}
    </>
  );
}
