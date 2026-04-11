import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";

const BASE_URL =
  (import.meta.env["VITE_API_URL"] as string | undefined) ||
  "https://cine-gratin.onrender.com";

const FALLBACK_POSTER =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='300' viewBox='0 0 200 300'%3E%3Crect width='200' height='300' fill='%231a1a1a'/%3E%3Ctext x='100' y='150' font-family='sans-serif' font-size='14' fill='%23555' text-anchor='middle' dominant-baseline='middle'%3ESin imagen%3C/text%3E%3C/svg%3E";

interface SagaMember {
  id: string;
  title: string;
  poster_url: string;
  year: number;
  type: "movie" | "series";
}

async function fetchSagaMembers(collectionId: string): Promise<SagaMember[]> {
  const res = await fetch(`${BASE_URL}/api/admin/saga-members/${collectionId}`);
  if (!res.ok) return [];
  return res.json();
}

export default function SagaPage() {
  const { id } = useParams<{ id: string }>();

  const { data: members = [], isLoading } = useQuery({
    queryKey: ["saga-members", id],
    queryFn: () => fetchSagaMembers(id!),
    enabled: Boolean(id),
    staleTime: 10 * 60 * 1000,
  });

  const sorted = [...members].sort((a, b) => (a.year || 0) - (b.year || 0));
  const movies = sorted.filter((m) => m.type === "movie");
  const series = sorted.filter((m) => m.type === "series");

  return (
    <div className="min-h-screen bg-brand-dark pb-20 pt-6">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">

        <Link
          to="/"
          className="inline-flex items-center gap-2 text-gray-400 hover:text-white transition-colors mb-8"
        >
          <ArrowLeft className="w-4 h-4" />
          Volver al inicio
        </Link>

        {isLoading ? (
          <div className="flex items-center justify-center py-24">
            <div className="w-8 h-8 border-2 border-brand-red border-t-transparent rounded-full animate-spin" />
          </div>
        ) : members.length === 0 ? (
          <div className="text-center py-24">
            <p className="text-gray-400 text-lg">No se encontró contenido para esta saga.</p>
          </div>
        ) : (
          <>
            <div className="mb-10">
              <h1 className="text-3xl sm:text-4xl font-black text-white flex items-center gap-3">
                <span className="w-2 h-9 bg-brand-red rounded-full" />
                Saga
              </h1>
              <p className="text-gray-400 mt-2">{members.length} títulos en esta colección</p>
            </div>

            {/* Películas */}
            {movies.length > 0 && (
              <section className="mb-12">
                {series.length > 0 && (
                  <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                    <span className="w-1.5 h-5 bg-brand-red rounded-full" />
                    Películas
                  </h2>
                )}
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-3 md:gap-4">
                  {movies.map((m) => (
                    <Link key={m.id} to={`/pelicula/${m.id}`} className="group">
                      <div className="relative overflow-hidden rounded-lg bg-brand-surface card-hover aspect-[2/3]">
                        <img
                          src={m.poster_url || FALLBACK_POSTER}
                          alt={m.title}
                          loading="lazy"
                          className="w-full h-full object-cover"
                          onError={(e) => { (e.currentTarget as HTMLImageElement).src = FALLBACK_POSTER; }}
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                        <div className="absolute bottom-0 w-full p-2 translate-y-full group-hover:translate-y-0 transition-transform">
                          <p className="text-white text-xs font-semibold line-clamp-2">{m.title}</p>
                          {m.year > 0 && <p className="text-gray-300 text-[10px]">{m.year}</p>}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {/* Series */}
            {series.length > 0 && (
              <section>
                {movies.length > 0 && (
                  <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                    <span className="w-1.5 h-5 bg-brand-red rounded-full" />
                    Series
                  </h2>
                )}
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-3 md:gap-4">
                  {series.map((s) => (
                    <Link key={s.id} to={`/serie/${s.id}`} className="group">
                      <div className="relative overflow-hidden rounded-lg bg-brand-surface card-hover aspect-[2/3]">
                        <img
                          src={s.poster_url || FALLBACK_POSTER}
                          alt={s.title}
                          loading="lazy"
                          className="w-full h-full object-cover"
                          onError={(e) => { (e.currentTarget as HTMLImageElement).src = FALLBACK_POSTER; }}
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                        <div className="absolute bottom-0 w-full p-2 translate-y-full group-hover:translate-y-0 transition-transform">
                          <p className="text-white text-xs font-semibold line-clamp-2">{s.title}</p>
                          {s.year > 0 && <p className="text-gray-300 text-[10px]">{s.year}</p>}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
