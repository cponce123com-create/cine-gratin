import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Helmet } from "react-helmet-async";
import { searchMovies, searchSeries } from "@/lib/api";

const FALLBACK_POSTER =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='300' viewBox='0 0 200 300'%3E%3Crect width='200' height='300' fill='%231a1a1a'/%3E%3Ctext x='100' y='150' font-family='sans-serif' font-size='14' fill='%23555' text-anchor='middle' dominant-baseline='middle'%3ESin imagen%3C/text%3E%3C/svg%3E";

type Tab = "todas" | "peliculas" | "series";

export default function Search() {
  const { query = "" } = useParams<{ query: string }>();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("todas");
  const [inputVal, setInputVal] = useState(query);

  const { data: movies = [], isLoading: loadingM } = useQuery({
    queryKey: ["search-movies", query],
    queryFn: () => searchMovies(query, 30),
    enabled: query.length > 0,
    staleTime: 2 * 60 * 1000,
  });

  const { data: series = [], isLoading: loadingS } = useQuery({
    queryKey: ["search-series", query],
    queryFn: () => searchSeries(query, 20),
    enabled: query.length > 0,
    staleTime: 2 * 60 * 1000,
  });

  const loading = loadingM || loadingS;
  const total = movies.length + series.length;

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputVal.trim()) navigate(`/search/${encodeURIComponent(inputVal.trim())}`);
  };

  return (
    <div className="min-h-screen bg-brand-dark pt-20 pb-16">
      <Helmet>
        <title>Buscar: {query} — Cine Gratín</title>
      </Helmet>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Search form */}
        <form onSubmit={handleSearch} className="mb-8">
          <div className="relative max-w-xl">
            <input
              type="text"
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              placeholder="Buscar películas y series..."
              className="w-full bg-brand-surface border border-brand-border rounded-xl px-5 py-3 pl-12 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-gray-400 transition-colors"
              autoFocus
            />
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">
              <SearchIcon />
            </span>
            {inputVal && (
              <button
                type="button"
                onClick={() => setInputVal("")}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
              >
                &times;
              </button>
            )}
          </div>
        </form>

        {/* Header */}
        {query && (
          <div className="mb-6">
            <h1 className="text-2xl font-black text-white">
              Resultados para{" "}
              <span className="text-brand-red">&ldquo;{query}&rdquo;</span>
            </h1>
            {!loading && (
              <p className="text-gray-500 text-sm mt-1">
                {total} resultado{total !== 1 ? "s" : ""} encontrado{total !== 1 ? "s" : ""}
              </p>
            )}
          </div>
        )}

        {/* Tabs */}
        {!loading && total > 0 && (
          <div className="flex gap-2 mb-6">
            {(["todas", "peliculas", "series"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`text-sm font-semibold px-4 py-1.5 rounded-full border transition-all ${
                  tab === t
                    ? "bg-brand-red border-red-700 text-white"
                    : "bg-brand-surface border-brand-border text-gray-400 hover:text-white hover:border-gray-500"
                }`}
              >
                {t === "todas" ? "Todas" : t === "peliculas" ? `Películas (${movies.length})` : `Series (${series.length})`}
              </button>
            ))}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 rounded-full border-2 border-brand-red border-t-transparent animate-spin" />
          </div>
        )}

        {/* No results */}
        {!loading && query && total === 0 && (
          <div className="text-center py-20">
            <p className="text-gray-400 text-lg">No se encontraron resultados.</p>
            <p className="text-gray-600 text-sm mt-2">Intenta con otro título o género.</p>
          </div>
        )}

        {/* Movies grid */}
        {!loading && (tab === "todas" || tab === "peliculas") && movies.length > 0 && (
          <section className="mb-10">
            {tab === "todas" && (
              <h2 className="text-lg font-bold text-white mb-4">
                Películas <span className="text-gray-500 font-normal text-sm">({movies.length})</span>
              </h2>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {movies.map((m) => (
                <Link key={m.id} to={`/pelicula/${m.id}`} className="group block">
                  <div className="aspect-[2/3] w-full rounded-lg overflow-hidden bg-brand-surface card-hover">
                    <img
                      src={m.poster_url || FALLBACK_POSTER}
                      alt={m.title}
                      loading="lazy"
                      onError={(e) => { (e.currentTarget as HTMLImageElement).src = FALLBACK_POSTER; }}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="mt-2">
                    <p className="text-xs text-gray-300 font-medium truncate group-hover:text-white transition-colors">
                      {m.title}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {m.year && <span className="text-xs text-gray-500">{m.year}</span>}
                      {m.rating !== undefined && (
                        <span className="text-xs text-brand-gold">&#9733; {Number(m.rating).toFixed(1)}</span>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Series grid */}
        {!loading && (tab === "todas" || tab === "series") && series.length > 0 && (
          <section>
            {tab === "todas" && (
              <h2 className="text-lg font-bold text-white mb-4">
                Series <span className="text-gray-500 font-normal text-sm">({series.length})</span>
              </h2>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {series.map((s) => (
                <Link key={s.id} to={`/serie/${s.id}`} className="group block">
                  <div className="aspect-[2/3] w-full rounded-lg overflow-hidden bg-brand-surface card-hover">
                    <img
                      src={s.poster_url || FALLBACK_POSTER}
                      alt={s.title}
                      loading="lazy"
                      onError={(e) => { (e.currentTarget as HTMLImageElement).src = FALLBACK_POSTER; }}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="mt-2">
                    <p className="text-xs text-gray-300 font-medium truncate group-hover:text-white transition-colors">
                      {s.title}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {s.year && <span className="text-xs text-gray-500">{s.year}</span>}
                      {s.rating !== undefined && (
                        <span className="text-xs text-brand-gold">&#9733; {Number(s.rating).toFixed(1)}</span>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function SearchIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  );
}
