import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchPerson } from "./helpers";
import { FALLBACK_PERSON } from "./constants";

export function ActorModal({ personId, onClose }: { personId: number; onClose: () => void }) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [showAllCredits, setShowAllCredits] = useState(false);

  const { data: person, isLoading, error } = useQuery({
    queryKey: ["person", personId],
    queryFn: () => fetchPerson(personId),
    staleTime: 60 * 60 * 1000,
  });

  const age = person?.birthday && !person.deathday
    ? Math.floor((Date.now() - new Date(person.birthday).getTime()) / (365.25 * 24 * 3600 * 1000))
    : null;

  const creditsToShow = person
    ? showAllCredits ? person.all_credits : person.all_credits.slice(0, 10)
    : [];

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 overflow-y-auto"
      onClick={e => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div className="relative w-full max-w-3xl bg-brand-card border border-brand-border rounded-2xl overflow-hidden shadow-2xl my-8">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 w-8 h-8 rounded-full bg-black/60 hover:bg-black/80 flex items-center justify-center text-white text-lg transition-colors"
        >✕</button>

        {isLoading && (
          <div className="flex items-center justify-center h-64">
            <div className="w-8 h-8 rounded-full border-2 border-brand-red border-t-transparent animate-spin" />
          </div>
        )}
        {error && <div className="p-8 text-center text-red-400">No se pudo cargar el perfil del actor.</div>}

        {person && (
          <div className="flex flex-col sm:flex-row">
            <div className="sm:w-56 flex-shrink-0 bg-brand-surface">
              <img
                src={person.profile_url || FALLBACK_PERSON}
                alt={person.name}
                className="w-full aspect-[2/3] object-cover object-top"
                onError={e => { (e.currentTarget as HTMLImageElement).src = FALLBACK_PERSON; }}
              />
              <div className="p-4 space-y-3">
                {person.known_for_department && (
                  <div>
                    <p className="text-gray-500 text-[11px] uppercase tracking-wider">Conocido por</p>
                    <p className="text-white text-sm font-semibold">{person.known_for_department}</p>
                  </div>
                )}
                {person.birthday && (
                  <div>
                    <p className="text-gray-500 text-[11px] uppercase tracking-wider">Nacimiento</p>
                    <p className="text-white text-sm">
                      {new Date(person.birthday).toLocaleDateString("es-MX", { year: "numeric", month: "long", day: "numeric" })}
                      {age && <span className="text-gray-400"> ({age} años)</span>}
                    </p>
                  </div>
                )}
                {person.deathday && (
                  <div>
                    <p className="text-gray-500 text-[11px] uppercase tracking-wider">Fallecimiento</p>
                    <p className="text-white text-sm">
                      {new Date(person.deathday).toLocaleDateString("es-MX", { year: "numeric", month: "long", day: "numeric" })}
                    </p>
                  </div>
                )}
                {person.place_of_birth && (
                  <div>
                    <p className="text-gray-500 text-[11px] uppercase tracking-wider">Lugar de nacimiento</p>
                    <p className="text-white text-sm">{person.place_of_birth}</p>
                  </div>
                )}
              </div>
            </div>

            <div className="flex-1 p-5 overflow-y-auto max-h-[80vh] sm:max-h-[600px]">
              <h2 className="text-2xl font-black text-white mb-4">{person.name}</h2>

              {person.biography && (
                <div className="mb-5">
                  <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Biografía</h3>
                  <p className="text-gray-300 text-sm leading-relaxed line-clamp-6 hover:line-clamp-none transition-all cursor-pointer">
                    {person.biography}
                  </p>
                </div>
              )}

              {person.known_for.length > 0 && (
                <div className="mb-5">
                  <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Conocido por</h3>
                  <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                    {person.known_for.map(work => (
                      <div key={`${work.media_type}-${work.id}`} className="flex-shrink-0 w-20">
                        <div className="aspect-[2/3] rounded-lg overflow-hidden bg-brand-surface mb-1">
                          {work.poster_url
                            ? <img src={work.poster_url} alt={work.title} className="w-full h-full object-cover" loading="lazy" />
                            : <div className="w-full h-full flex items-center justify-center text-gray-600 text-[10px] text-center px-1">{work.title}</div>
                          }
                        </div>
                        <p className="text-[10px] text-gray-300 truncate leading-tight">{work.title}</p>
                        {work.year && <p className="text-[10px] text-gray-600">{work.year}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {person.all_credits.length > 0 && (
                <div>
                  <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                    Interpretación <span className="font-normal text-gray-600">({person.all_credits.length})</span>
                  </h3>
                  <div className="space-y-1">
                    {creditsToShow.map((c, i) => (
                      <div key={i} className="flex items-center gap-3 py-1.5 border-b border-brand-border/30 last:border-0">
                        <span className="text-gray-600 text-xs w-10 shrink-0 text-right">{c.year || "—"}</span>
                        <p className="text-sm text-white font-medium flex-1 truncate">{c.title}</p>
                        {c.character && <p className="text-xs text-gray-500 shrink-0 truncate max-w-[120px]">como {c.character}</p>}
                        <span className="text-[10px] text-gray-600 shrink-0 uppercase">{c.media_type === "tv" ? "Serie" : "Película"}</span>
                      </div>
                    ))}
                  </div>
                  {person.all_credits.length > 10 && (
                    <button
                      onClick={() => setShowAllCredits(v => !v)}
                      className="mt-3 text-brand-red hover:text-red-400 text-xs font-bold transition-colors"
                    >
                      {showAllCredits ? "Ver menos" : `Ver todos (${person.all_credits.length})`}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
