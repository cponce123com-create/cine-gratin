import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Helmet } from "react-helmet-async";
import { searchMovies, searchSeries } from "@/lib/api";
import { SearchIcon } from "@/components/icons";
import AdminPagination from "@/components/admin/AdminPagination";

const FALLBACK_POSTER =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='300' viewBox='0 0 200 300'%3E%3Crect width='200' height='300' fill='%231a1a1a'/%3E%3Ctext x='100' y='150' font-family='sans-serif' font-size='14' fill='%23555' text-anchor='middle' dominant-baseline='middle'%3ESin imagen%3C/text%3E%3C/svg%3E";

type Tab = "todas" | "peliculas" | "series";

const PAGE_SIZE = 24;

export default function Search() {
  const { query = "" } = useParams<{ query: string }>();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("todas");
  const [inputVal, setInputVal] = useState(query);
  const [page, setPage] = useState(1);

  // The input is kept in sync with the URL (the URL is the source of truth).
  useEffect(() => {
    setInputVal(query);
    setPage(1);
  }, [query]);

  const trimmed = query.trim();

  const {
    data: movies = [],
    isLoading: loadingM,
    isError: errorM,
    error: moviesError,
  } = useQuery({
    queryKey: ["search-movies", trimmed, page],
    queryFn: ({ signal }) => searchMovies(trimmed, PAGE_SIZE, signal),
    enabled: trimmed.length > 0,
    staleTime: 2 * 60 * 1000,
  });

  const {
    data: series = [],
    isLoading: loadingS,
    isError: errorS,
    error: seriesError,
  } = useQuery({
    queryKey: ["search-series", trimmed, page],
    queryFn: ({ signal }) => searchSeries(trimmed, PAGE_SIZE, signal),
    enabled: trimmed.length > 0,
    staleTime: 2 * 60 * 1000,
  });

  const loading = loadingM || loadingS;
  const hasError = errorM || errorS;
  const total = movies.length + series.length;
  const errorMessage =
    moviesError instanceof Error
      ? moviesError.message
      : seriesError instanceof Error
        ? seriesError.message
        : null;

  const handleSearch = (event: React.FormEvent) => {
    event.preventDefault();
    const value = inputVal.trim();
    if (!value) return;
    navigate(`/search/${encodeURIComponent(value)}`);
  };

  const renderGrid = (items: typeof movies, basePath: string) => (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
      {items.map((item) => (
        <Link
          key={item.id}
          to={`${basePath}/${item.id}`}
          className="group block rounded-lg focus-visible:ring-2 focus-visible:ring-brand-red"
        >
          <div className="aspect-[2/3] w-full rounded-lg overflow-hidden bg-brand-surface card-hover">
            <img
              src={item.poster_url || FALLBACK_POSTER}
              alt={`Carátula de ${item.title}`}
              loading="lazy"
              width={200}
              height={300}
              onError={(event) => {
                (event.currentTarget as HTMLImageElement).src = FALLBACK_POSTER;
              }}
              className="w-full h-full object-cover"
            />
          </div>
          <div className="mt-2">
            <p className="text-xs text-gray-300 font-medium truncate group-hover:text-white transition-colors">
              {item.title}
            </p>
            <div className="flex items-center gap-2 mt-0.5">
              {item.year && <span className="text-xs text-gray-500">{item.year}</span>}
              {item.rating !== undefined && (
                <span className="text-xs text-brand-gold">&#9733; {Number(item.rating).toFixed(1)}</span>
              )}
            </div>
          </div>
        </Link>
      ))}
    </div>
  );

  return (
    <div className="min-h-screen bg-brand-dark pt-20 pb-16">
      <Helmet>
        <title>{trimmed ? `Buscar: ${trimmed}` : "Buscar"} — Cine Gratín</title>
        <meta name="robots" content="noindex" />
      </Helmet>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Search form */}
        <form onSubmit={handleSearch} role="search" className="mb-8">
          <div className="relative max-w-xl">
            <label htmlFor="search-input" className="sr-only">
              Buscar películas y series
            </label>
            <input
              id="search-input"
              type="search"
              value={inputVal}
              onChange={(event) => setInputVal(event.target.value)}
              placeholder="Buscar películas y series..."
              className="w-full bg-brand-surface border border-brand-border rounded-xl px-5 py-3 pl-12 text-white placeholder-gray-500 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red transition-colors"
              autoFocus
            />
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" aria-hidden="true">
              <SearchIcon />
            </span>
            {inputVal && (
              <button
                type="button"
                onClick={() => {
                  setInputVal("");
                  if (trimmed) navigate("/search/");
                }}
                aria-label="Limpiar la búsqueda"
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white focus-visible:ring-2 focus-visible:ring-brand-red rounded"
              >
                &times;
              </button>
            )}
          </div>
        </form>

        {/* Header */}
        {trimmed && (
          <div className="mb-6">
            <h1 className="text-2xl font-black text-white">
              Resultados para <span className="text-brand-red">&ldquo;{trimmed}&rdquo;</span>
            </h1>
            {!loading && !hasError && (
              <p className="text-gray-500 text-sm mt-1" aria-live="polite">
                {total} resultado{total !== 1 ? "s" : ""} encontrado{total !== 1 ? "s" : ""} en esta página
              </p>
            )}
          </div>
        )}

        {/* Tabs */}
        {!loading && !hasError && total > 0 && (
          <div className="flex gap-2 mb-6" role="tablist" aria-label="Filtrar resultados por tipo">
            {(["todas", "peliculas", "series"] as Tab[]).map((item) => (
              <button
                key={item}
                type="button"
                role="tab"
                aria-selected={tab === item}
                onClick={() => setTab(item)}
                className={`text-sm font-semibold px-4 py-1.5 rounded-full border transition-all focus-visible:ring-2 focus-visible:ring-brand-red ${
                  tab === item
                    ? "bg-brand-red border-red-700 text-white"
                    : "bg-brand-surface border-brand-border text-gray-400 hover:text-white hover:border-gray-500"
                }`}
              >
                {item === "todas"
                  ? "Todas"
                  : item === "peliculas"
                    ? `Películas (${movies.length})`
                    : `Series (${series.length})`}
              </button>
            ))}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-20" role="status" aria-live="polite">
            <span className="sr-only">Buscando…</span>
            <div className="w-8 h-8 rounded-full border-2 border-brand-red border-t-transparent animate-spin" />
          </div>
        )}

        {/* Error */}
        {hasError && !loading && (
          <div className="text-center py-20" role="alert">
            <p className="text-red-400 text-lg">{errorMessage ?? "No se pudo completar la búsqueda."}</p>
            <p className="text-gray-600 text-sm mt-2">Inténtalo de nuevo en unos segundos.</p>
          </div>
        )}

        {/* No results */}
        {!loading && !hasError && trimmed && total === 0 && (
          <div className="text-center py-20">
            <p className="text-gray-400 text-lg">No se encontraron resultados.</p>
            <p className="text-gray-600 text-sm mt-2">Intenta con otro título o género.</p>
            <button
              type="button"
              onClick={() => {
                setInputVal("");
                navigate("/search/");
              }}
              className="mt-4 text-brand-red hover:text-red-400 text-sm underline focus-visible:ring-2 focus-visible:ring-brand-red"
            >
              Buscar otra cosa
            </button>
          </div>
        )}

        {/* Movies grid */}
        {!loading && !hasError && (tab === "todas" || tab === "peliculas") && movies.length > 0 && (
          <section className="mb-10" aria-label="Películas encontradas">
            {tab === "todas" && (
              <h2 className="text-lg font-bold text-white mb-4">
                Películas <span className="text-gray-500 font-normal text-sm">({movies.length})</span>
              </h2>
            )}
            {renderGrid(movies, "/pelicula")}
          </section>
        )}

        {/* Series grid */}
        {!loading && !hasError && (tab === "todas" || tab === "series") && series.length > 0 && (
          <section aria-label="Series encontradas">
            {tab === "todas" && (
              <h2 className="text-lg font-bold text-white mb-4">
                Series <span className="text-gray-500 font-normal text-sm">({series.length})</span>
              </h2>
            )}
            {renderGrid(series, "/serie")}
          </section>
        )}

        {!loading && !hasError && total > 0 && (movies.length >= PAGE_SIZE || series.length >= PAGE_SIZE) && (
          <div className="mt-8">
            <AdminPagination
              page={page}
              pages={Math.max(movies.length, series.length) >= PAGE_SIZE ? page + 1 : page}
              total={total}
              limit={PAGE_SIZE}
              onPageChange={(nextPage) => {
                setPage(nextPage);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              itemLabel="resultados"
            />
          </div>
        )}
      </div>
    </div>
  );
}
