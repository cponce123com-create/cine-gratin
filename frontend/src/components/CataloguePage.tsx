import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Helmet } from "react-helmet-async";
import { SearchIcon } from "@/components/icons";
import { SkeletonGrid } from "@/components/SkeletonCard";
import AdminPagination from "@/components/admin/AdminPagination";

const FALLBACK_POSTER =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='300' viewBox='0 0 200 300'%3E%3Crect width='200' height='300' fill='%231a1a1a'/%3E%3Ctext x='100' y='150' font-family='sans-serif' font-size='14' fill='%23555' text-anchor='middle' dominant-baseline='middle'%3ESin imagen%3C/text%3E%3C/svg%3E";

export interface CatalogueItem {
  id: string | number;
  title: string;
  year?: number;
  rating?: number;
  poster_url?: string;
  genres?: string[];
}

interface CatalogueResponse {
  items: CatalogueItem[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

interface CataloguePageProps {
  title: string;
  singular: string;
  plural: string;
  endpoint: string;
  /** "movie" | "series" — used to load the genres available in the catalogue. */
  mediaType: "movie" | "series";
}

const PAGE_SIZE = 24;
const QUICK_CATEGORIES = [
  { id: "year", order: "desc", label: "Estrenos" },
  { id: "views", order: "desc", label: "Más vistas" },
  { id: "rating", order: "desc", label: "Mejor puntuadas" },
  { id: "date_added", order: "desc", label: "Añadidas recientemente" },
] as const;

/**
 * Public catalogue page (movies and series).
 *
 * The filtering, sorting and pagination are performed by the API, so the
 * browser only holds the visible page. The state lives in the URL, which
 * makes every view shareable and restorable.
 */
export default function CataloguePage({ title, singular, plural, endpoint, mediaType }: CataloguePageProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get("q") ?? "");
  const [debouncedSearch, setDebouncedSearch] = useState(searchParams.get("q") ?? "");

  const q = searchParams.get("q") ?? "";
  const genre = searchParams.get("genre") ?? "";
  const sort = searchParams.get("sort") ?? "year";
  const order = searchParams.get("order") ?? "desc";
  const page = Math.max(1, Number(searchParams.get("page") ?? 1) || 1);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(timer);
  }, [search]);

  // The URL is the source of truth: the debounced search updates it.
  useEffect(() => {
    if (debouncedSearch === q) return;
    const next = new URLSearchParams(searchParams);
    if (debouncedSearch) next.set("q", debouncedSearch);
    else next.delete("q");
    next.delete("page");
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("limit", String(PAGE_SIZE));
    params.set("sort", sort);
    params.set("order", order);
    if (q) params.set("q", q);
    if (genre) params.set("genre", genre);
    return params.toString();
  }, [page, sort, order, q, genre]);

  const { data: genres } = useQuery({
    queryKey: ["catalogue-genres", mediaType],
    queryFn: () =>
      fetch(
        `${import.meta.env["VITE_API_URL"] ?? "https://cine-gratin.onrender.com"}/api/genres?type=${mediaType}`,
      ).then(async (response) => (response.ok ? ((await response.json()) as string[]) : [])),
    staleTime: 60 * 60 * 1000,
  });

  const { data, isLoading, isError, error, isFetching } = useQuery({
    queryKey: ["catalogue", endpoint, query],
    queryFn: () =>
      fetch(
        `${import.meta.env["VITE_API_URL"] ?? "https://cine-gratin.onrender.com"}${endpoint}?${query}`,
      ).then(async (response) => {
        if (!response.ok) throw new Error(`Error ${response.status}`);
        return (await response.json()) as CatalogueResponse;
      }),
    placeholderData: (previous) => previous,
    staleTime: 60_000,
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const pages = data?.pages ?? 1;

  const updateParams = (updates: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(updates).forEach(([key, value]) => {
      if (value) next.set(key, value);
      else next.delete(key);
    });
    if (!("page" in updates)) next.delete("page");
    setSearchParams(next, { replace: true });
  };

  const hasFilters = Boolean(q || genre);

  return (
    <div className="min-h-screen bg-brand-dark pt-20 pb-16">
      <Helmet>
        <title>{title} — Cine Gratín</title>
        <meta
          name="description"
          content={`Catálogo de ${plural} disponible en Cine Gratín: películas y series en español.`}
        />
      </Helmet>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-black text-white mb-2">{title}</h1>
          <p className="text-gray-400 text-sm" aria-live="polite">
            {isLoading && !data ? "Cargando…" : `${total} ${total === 1 ? singular : plural}`}
          </p>
        </div>

        <div className="mb-8 space-y-4">
          <form
            role="search"
            className="relative max-w-md"
            onSubmit={(event) => {
              event.preventDefault();
              updateParams({ q: debouncedSearch || null });
            }}
          >
            <label htmlFor={`${endpoint}-search`} className="sr-only">
              Buscar {plural}
            </label>
            <input
              id={`${endpoint}-search`}
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={`Buscar ${singular}...`}
              className="w-full bg-brand-surface border border-brand-border rounded-lg px-4 py-2.5 pl-10 text-white placeholder-gray-500 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red transition-colors"
            />
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" aria-hidden="true">
              <SearchIcon />
            </span>
            {search && (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  updateParams({ q: null });
                }}
                aria-label={`Limpiar la búsqueda de ${plural}`}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
              >
                &times;
              </button>
            )}
          </form>

          <div className="space-y-4">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Categorías destacadas
              </p>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Categorías destacadas">
                {QUICK_CATEGORIES.map((category) => {
                  const selected = sort === category.id && order === category.order && !genre;
                  return (
                    <button
                      key={category.id}
                      type="button"
                      onClick={() => updateParams({ sort: category.id, order: category.order, genre: null })}
                      aria-pressed={selected}
                      className={`rounded-full border px-4 py-2 text-sm font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-brand-red ${
                        selected
                          ? "border-brand-red bg-brand-red text-white"
                          : "border-brand-border bg-brand-surface text-gray-300 hover:border-gray-500 hover:text-white"
                      }`}
                    >
                      {category.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por género">
                <span className="mr-1 self-center text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Géneros
                </span>
                <button
                  type="button"
                  onClick={() => updateParams({ genre: null })}
                  aria-pressed={!genre}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors focus-visible:ring-2 focus-visible:ring-brand-red ${
                    !genre
                      ? "bg-brand-red text-white border-brand-red"
                      : "border-brand-border text-gray-400 hover:text-white"
                  }`}
                >
                  Todos
                </button>
                {(genres ?? []).map((genreName) => (
                  <button
                    key={genreName}
                    type="button"
                    onClick={() => updateParams({ genre: genreName })}
                    aria-pressed={genre === genreName}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors focus-visible:ring-2 focus-visible:ring-brand-red ${
                      genre === genreName
                        ? "bg-brand-red text-white border-brand-red"
                        : "border-brand-border text-gray-400 hover:text-white"
                    }`}
                  >
                    {genreName}
                  </button>
                ))}
              </div>

              <label className="ml-auto flex items-center gap-2 text-xs text-gray-500">
                <span>Ordenar por</span>
                <select
                  value={`${sort}:${order}`}
                  onChange={(event) => {
                    const [nextSort, nextOrder] = event.target.value.split(":");
                    updateParams({ sort: nextSort, order: nextOrder });
                  }}
                  className="rounded-lg border border-brand-border bg-brand-surface px-2 py-1.5 text-xs text-gray-300 focus-visible:ring-2 focus-visible:ring-brand-red"
                >
                  <option value="year:desc">Año (más reciente)</option>
                  <option value="year:asc">Año (más antiguo)</option>
                  <option value="date_added:desc">Añadidas recientemente</option>
                  <option value="title:asc">Título (A-Z)</option>
                  <option value="title:desc">Título (Z-A)</option>
                  <option value="rating:desc">Mejor valoradas</option>
                  <option value="views:desc">Más vistas</option>
                </select>
              </label>
            </div>
          </div>
        </div>

        {isLoading && !data && <SkeletonGrid />}

        {isError && (
          <div className="text-center py-20" role="alert">
            <p className="text-red-400 text-lg">
              {error instanceof Error ? error.message : `No se pudieron cargar las ${plural}.`}
            </p>
          </div>
        )}

        {!isLoading && !isError && items.length === 0 && (
          <div className="text-center py-20">
            <p className="text-gray-400 text-lg">No hay {plural} que coincidan.</p>
            {hasFilters && (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  updateParams({ q: null, genre: null });
                }}
                className="mt-4 text-brand-red hover:text-red-400 text-sm underline focus-visible:ring-2 focus-visible:ring-brand-red"
              >
                Limpiar filtros
              </button>
            )}
          </div>
        )}

        {items.length > 0 && (
          <>
            <div
              className={`grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 transition-opacity ${
                isFetching ? "opacity-60" : "opacity-100"
              }`}
            >
              {items.map((item) => (
                <Link
                  key={item.id}
                  to={`${endpoint === "/api/movies/catalogue" ? "/pelicula" : "/serie"}/${item.id}`}
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
                        <span className="text-xs text-brand-gold">
                          &#9733; {Number(item.rating).toFixed(1)}
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>

            <div className="mt-8">
              <AdminPagination
                page={page}
                pages={pages}
                total={total}
                limit={PAGE_SIZE}
                onPageChange={(nextPage) => {
                  updateParams({ page: String(nextPage) });
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                itemLabel={plural}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
