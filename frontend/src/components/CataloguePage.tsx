import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQueries, useQuery } from "@tanstack/react-query";
import { Helmet } from "react-helmet-async";
import { SearchIcon } from "@/components/icons";
import { SkeletonGrid } from "@/components/SkeletonCard";
import AdminPagination from "@/components/admin/AdminPagination";
import { GENRE_SECTIONS } from "@/lib/homeConfig";

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

// The API caps catalogue pages at 60. The initial shelves together show at
// least 120 category results; the full category view uses the largest page.
const PAGE_SIZE = 60;
const SHELF_SIZE = 24;
const QUICK_CATEGORIES = [
  { id: "releases", label: "Estrenos" },
  { id: "views", label: "Más vistas" },
  { id: "recommended", label: "Recomendadas" },
  { id: "classics", label: "Clásicos" },
  { id: "recent", label: "Añadidas recientemente" },
] as const;

const FEATURED_SHELVES = [
  { id: "releases", title: "Estrenos", sort: "year", order: "desc" },
  { id: "views", title: "Más vistas", sort: "views", order: "desc" },
  { id: "recommended", title: "Recomendadas", sort: "rating", order: "desc" },
  { id: "classics", title: "Clásicos", sort: "year", order: "asc" },
  { id: "recent", title: "Añadidas recientemente", sort: "date_added", order: "desc" },
] as const;

interface CatalogueShelf {
  id: string;
  title: string;
  sort: string;
  order: string;
  genre?: string;
}

function normalizeGenre(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function genreId(value: string) {
  return `genre-${normalizeGenre(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}`;
}

function CategoryShelf({
  shelf,
  items,
  endpoint,
  onBrowse,
  loading,
  deferred,
  failed,
}: {
  shelf: CatalogueShelf;
  items: CatalogueItem[];
  endpoint: string;
  onBrowse: () => void;
  loading: boolean;
  deferred: boolean;
  failed: boolean;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const isMovie = endpoint === "/api/movies/catalogue";
  const baseUrl = isMovie ? "/pelicula" : "/serie";

  return (
    <section
      id={`catalogue-shelf-${shelf.id}`}
      className="mb-9 scroll-mt-24"
      data-shelf-id={shelf.id}
      aria-labelledby={`shelf-${shelf.id}`}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 id={`shelf-${shelf.id}`} className="text-lg font-bold text-white sm:text-xl">
            {shelf.title}
          </h2>
          {items.length > 0 && (
            <p className="mt-0.5 text-xs text-gray-500">{items.length} títulos destacados</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() =>
              rowRef.current?.scrollBy({ left: -rowRef.current.clientWidth * 0.75, behavior: "smooth" })
            }
            aria-label={`Desplazar ${shelf.title} hacia la izquierda`}
            className="hidden h-8 w-8 items-center justify-center rounded-full border border-brand-border bg-brand-surface text-gray-300 hover:text-white sm:flex"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() =>
              rowRef.current?.scrollBy({ left: rowRef.current.clientWidth * 0.75, behavior: "smooth" })
            }
            aria-label={`Desplazar ${shelf.title} hacia la derecha`}
            className="hidden h-8 w-8 items-center justify-center rounded-full border border-brand-border bg-brand-surface text-gray-300 hover:text-white sm:flex"
          >
            ›
          </button>
          <button
            type="button"
            onClick={onBrowse}
            className="text-xs font-semibold text-brand-red hover:text-red-300"
          >
            Ver todos
          </button>
        </div>
      </div>
      {deferred ? (
        <p className="py-5 text-sm text-gray-500">Sigue explorando para cargar esta categoría.</p>
      ) : loading && items.length === 0 ? (
        <div className="flex gap-3 overflow-hidden" aria-label={`Cargando ${shelf.title}`}>
          {Array.from({ length: 6 }, (_, index) => (
            <div
              key={index}
              className="aspect-[2/3] w-32 shrink-0 animate-pulse rounded-lg bg-brand-surface sm:w-40"
            />
          ))}
        </div>
      ) : failed ? (
        <p className="py-5 text-sm text-red-300">
          No se pudo cargar esta categoría. Inténtalo de nuevo más tarde.
        </p>
      ) : items.length === 0 ? (
        <p className="py-5 text-sm text-gray-500">Aún no hay títulos en esta categoría.</p>
      ) : (
        <div ref={rowRef} className="flex gap-3 overflow-x-auto pb-3 [scrollbar-width:thin]">
          {items.map((item) => (
            <Link key={item.id} to={`${baseUrl}/${item.id}`} className="group w-32 shrink-0 sm:w-40">
              <div className="relative aspect-[2/3] overflow-hidden rounded-lg bg-brand-surface card-hover">
                <img
                  src={item.poster_url || FALLBACK_POSTER}
                  alt={`Carátula de ${item.title}`}
                  loading="lazy"
                  decoding="async"
                  width={200}
                  height={300}
                  onError={(event) => {
                    event.currentTarget.src = FALLBACK_POSTER;
                  }}
                  className="h-full w-full object-cover"
                />
                {item.rating !== undefined && Number(item.rating) > 0 && (
                  <span className="absolute right-1.5 top-1.5 rounded bg-black/75 px-1.5 py-0.5 text-[10px] font-bold text-brand-gold">
                    ★ {Number(item.rating).toFixed(1)}
                  </span>
                )}
              </div>
              <p className="mt-2 truncate text-xs font-medium text-gray-300 group-hover:text-white">
                {item.title}
              </p>
              {item.year && <p className="mt-0.5 text-xs text-gray-500">{item.year}</p>}
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

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
  const [activeCategory, setActiveCategory] = useState("releases");

  const q = searchParams.get("q") ?? "";
  const genre = searchParams.get("genre") ?? "";
  const sort = searchParams.get("sort") ?? "year";
  const order = searchParams.get("order") ?? "desc";
  const page = Math.max(1, Number(searchParams.get("page") ?? 1) || 1);
  const hasFilters = Boolean(q || genre);
  const showBrowseGrid = hasFilters || searchParams.get("browse") === "1";

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

  const shelves = useMemo<CatalogueShelf[]>(() => {
    const usedGenres = new Set<string>();
    const featuredGenres = GENRE_SECTIONS.flatMap((section) => {
      const available = (genres ?? []).find(
        (name) =>
          !usedGenres.has(name) &&
          section.keywords.some((keyword) => normalizeGenre(name).includes(normalizeGenre(keyword))),
      );
      if (available) usedGenres.add(available);
      return available
        ? [
            {
              id: genreId(available),
              title: section.label,
              genre: available,
              sort: "views",
              order: "desc",
            },
          ]
        : [];
    });
    const genrePriority = [
      "Terror",
      "Drama",
      "Ciencia ficción",
      "Acción",
      "Suspenso",
      "Crimen",
      "Comedia",
      "Romance",
    ];
    featuredGenres.sort((a, b) => {
      const aRank = genrePriority.indexOf(a.title);
      const bRank = genrePriority.indexOf(b.title);
      return (aRank === -1 ? genrePriority.length : aRank) - (bRank === -1 ? genrePriority.length : bRank);
    });
    const otherGenres = (genres ?? [])
      .filter((name) => !usedGenres.has(name))
      .map((name) => ({ id: genreId(name), title: name, genre: name, sort: "views", order: "desc" }));
    return [...FEATURED_SHELVES, ...featuredGenres, ...otherGenres];
  }, [genres]);

  const [visibleShelves, setVisibleShelves] = useState<Set<string>>(
    () => new Set(FEATURED_SHELVES.map((shelf) => shelf.id)),
  );
  const shelvesContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setVisibleShelves((current) => new Set([...current, ...shelves.slice(0, 6).map((shelf) => shelf.id)]));
  }, [shelves]);

  useEffect(() => {
    if (showBrowseGrid) return;
    const container = shelvesContainerRef.current;
    if (!container || typeof IntersectionObserver === "undefined") {
      setVisibleShelves(new Set(shelves.map((shelf) => shelf.id)));
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        setVisibleShelves((current) => {
          const next = new Set(current);
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              const id = (entry.target as HTMLElement).dataset["shelfId"];
              if (id) next.add(id);
              observer.unobserve(entry.target);
            }
          });
          return next;
        });
      },
      { rootMargin: "500px 0px" },
    );
    container
      .querySelectorAll<HTMLElement>("[data-shelf-id]")
      .forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [showBrowseGrid, shelves]);

  const shelfResults = useQueries({
    queries: shelves.map((shelf) => ({
      queryKey: ["catalogue-shelf", endpoint, shelf.id, shelf.genre],
      queryFn: async () => {
        const params = new URLSearchParams({
          page: "1",
          limit: String(SHELF_SIZE),
          sort: shelf.sort,
          order: shelf.order,
        });
        if (shelf.genre) params.set("genre", shelf.genre);
        const response = await fetch(
          `${import.meta.env["VITE_API_URL"] ?? "https://cine-gratin.onrender.com"}${endpoint}?${params}`,
        );
        if (!response.ok) throw new Error(`Error ${response.status}`);
        return (await response.json()) as CatalogueResponse;
      },
      enabled: !showBrowseGrid && visibleShelves.has(shelf.id),
      staleTime: 5 * 60 * 1000,
    })),
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

  const browseCategory = (shelf: CatalogueShelf) => {
    updateParams({ sort: shelf.sort, order: shelf.order, genre: shelf.genre ?? null, browse: "1" });
  };

  const jumpToShelf = (id: string) => {
    setActiveCategory(id);
    if (showBrowseGrid) {
      setSearch("");
      updateParams({ q: null, genre: null, browse: null });
    }
    window.setTimeout(() => {
      document
        .getElementById(`catalogue-shelf-${id}`)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
  };

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
        <div className="mb-7 overflow-hidden rounded-2xl border border-brand-border bg-gradient-to-br from-brand-surface via-brand-dark to-red-950/40 px-5 py-6 sm:px-8 sm:py-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.24em] text-brand-red">
                Explora el catálogo
              </p>
              <h1 className="text-3xl font-black text-white sm:text-4xl">{title}</h1>
              <p className="mt-2 max-w-2xl text-sm text-gray-400">
                Estrenos, favoritos del público, recomendaciones y géneros para encontrar qué ver.
              </p>
            </div>
            <p
              className="rounded-full border border-white/10 bg-black/20 px-4 py-2 text-sm text-gray-300"
              aria-live="polite"
            >
              <span className="font-bold text-white">
                {isLoading && !data ? "…" : total.toLocaleString("es-PE")}
              </span>{" "}
              {total === 1 ? singular : plural}
            </p>
          </div>
        </div>

        <div className="mb-8 space-y-5 rounded-2xl border border-brand-border bg-brand-surface/60 p-4 sm:p-5">
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
                  const selected = activeCategory === category.id && !showBrowseGrid;
                  return (
                    <button
                      key={category.id}
                      type="button"
                      onClick={() => jumpToShelf(category.id)}
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
                  onClick={() => {
                    setActiveCategory("releases");
                    updateParams({ genre: null, browse: null });
                  }}
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
                    onClick={() => jumpToShelf(genreId(genreName))}
                    aria-pressed={activeCategory === genreId(genreName) && !showBrowseGrid}
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
                    updateParams({ sort: nextSort, order: nextOrder, browse: "1" });
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

        {!showBrowseGrid && (
          <div ref={shelvesContainerRef} className="mt-8">
            {shelves.map((shelf, index) => {
              const result = shelfResults[index];
              const enabled = visibleShelves.has(shelf.id);
              return (
                <CategoryShelf
                  key={shelf.id}
                  shelf={shelf}
                  items={result?.data?.items ?? []}
                  endpoint={endpoint}
                  onBrowse={() => browseCategory(shelf)}
                  loading={enabled && Boolean(result?.isLoading)}
                  deferred={!enabled}
                  failed={Boolean(result?.isError)}
                />
              );
            })}
          </div>
        )}

        {showBrowseGrid && !hasFilters && (
          <button
            type="button"
            onClick={() => updateParams({ browse: null })}
            className="mb-5 rounded-full border border-brand-border bg-brand-surface px-4 py-2 text-sm font-semibold text-gray-200 hover:border-brand-red hover:text-white"
          >
            ← Volver a las filas de categorías
          </button>
        )}

        {showBrowseGrid && isLoading && !data && <SkeletonGrid />}

        {showBrowseGrid && isError && (
          <div className="text-center py-20" role="alert">
            <p className="text-red-400 text-lg">
              {error instanceof Error ? error.message : `No se pudieron cargar las ${plural}.`}
            </p>
          </div>
        )}

        {showBrowseGrid && !isLoading && !isError && items.length === 0 && (
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

        {showBrowseGrid && items.length > 0 && (
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
