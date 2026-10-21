import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Edit2, Eye, Star, Trash2, Wifi } from "lucide-react";
import { toast } from "sonner";
import type { Movie, Series } from "@/lib/types";
import type { AdminListParams, AdminListResponse } from "@/lib/api";
import AdminPagination from "@/components/admin/AdminPagination";
import ConfirmDialog from "@/components/admin/ConfirmDialog";
import EditMediaModal from "@/components/admin/EditMediaModal";

type MediaItem = Movie | Series;

interface MediaManagerProps {
  title: string;
  singular: string;
  plural: string;
  mediaType: "movie" | "series";
  detailPath: string;
  listFn: (params: AdminListParams) => Promise<AdminListResponse<MediaItem>>;
  bulkDeleteFn: (ids: string[]) => Promise<{ deleted: number }>;
  saveFn: (item: Partial<MediaItem>) => Promise<MediaItem>;
}

type SortKey = "title" | "year" | "rating" | "views" | "date_added";

const VIDSRC_OPTIONS = [
  { value: "", label: "Cualquier estado" },
  { value: "active", label: "Disponible" },
  { value: "inactive", label: "No disponible" },
  { value: "unknown", label: "Sin verificar" },
];

/**
 * Shared catalogue management screen for movies and series.
 *
 * The list is filtered, sorted and paginated by the API, so the browser never
 * holds the whole catalogue in memory. Selection, bulk deletion and editing
 * behave identically for both content types.
 */
export default function MediaManager({
  title,
  singular,
  plural,
  mediaType,
  detailPath,
  listFn,
  bulkDeleteFn,
  saveFn,
}: MediaManagerProps) {
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [genre, setGenre] = useState("");
  const [vidsrc, setVidsrc] = useState("");
  const [autoImported, setAutoImported] = useState("");
  const [sort, setSort] = useState<SortKey>("date_added");
  const [order, setOrder] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<MediaItem | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<MediaItem | null>(null);
  const [confirmBulk, setConfirmBulk] = useState(false);
  const [busy, setBusy] = useState(false);

  // Debounce the free-text filter so every keystroke does not hit the API.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(timer);
  }, [search]);

  // Any change in the filters returns to the first page.
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, genre, vidsrc, autoImported, sort, order, limit]);

  const params: AdminListParams = {
    page,
    limit,
    sort,
    order,
    ...(debouncedSearch ? { q: debouncedSearch } : {}),
    ...(genre ? { genre } : {}),
    ...(vidsrc ? { vidsrc } : {}),
    ...(autoImported ? { auto_imported: autoImported } : {}),
  };

  const queryKey = ["admin", "catalogue", mediaType, params];

  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey,
    queryFn: () => listFn(params),
    placeholderData: (previous) => previous,
    staleTime: 15_000,
  });

  const items = useMemo(() => data?.items ?? [], [data]);
  const total = data?.total ?? 0;
  const pages = data?.pages ?? 1;

  // Genres available in the current page (a pragmatic approximation: the API
  // filters by exact genre name).
  const genres = useMemo(() => {
    const set = new Set<string>();
    items.forEach((item) => item.genres?.forEach((genreName) => set.add(genreName)));
    return Array.from(set).sort();
  }, [items]);

  const selectedItems = useMemo(
    () => items.filter((item) => selected.has(String(item.id))),
    [items, selected],
  );

  const allOnPageSelected = items.length > 0 && items.every((item) => selected.has(String(item.id)));

  const toggleSelectAll = () => {
    setSelected((previous) => {
      const next = new Set(previous);
      if (allOnPageSelected) {
        items.forEach((item) => next.delete(String(item.id)));
      } else {
        items.forEach((item) => next.add(String(item.id)));
      }
      return next;
    });
  };

  const toggleSelect = (id: string) => {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["admin", "catalogue", mediaType] });
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    setBusy(true);
    try {
      await bulkDeleteFn([String(confirmDelete.id)]);
      toast.success(`${singular} eliminada`);
      setConfirmDelete(null);
      setSelected((previous) => {
        const next = new Set(previous);
        next.delete(String(confirmDelete.id));
        return next;
      });
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `No se pudo eliminar la ${singular}`);
    } finally {
      setBusy(false);
    }
  };

  const handleBulkDelete = async () => {
    setBusy(true);
    try {
      const result = await bulkDeleteFn([...selected]);
      toast.success(`${result.deleted} ${result.deleted === 1 ? singular : plural} eliminadas`);
      setSelected(new Set());
      setConfirmBulk(false);
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo completar la eliminación");
    } finally {
      setBusy(false);
    }
  };

  const handleToggleFeatured = async (item: MediaItem) => {
    try {
      await saveFn({ id: String(item.id), featured: !item.featured });
      toast.success(item.featured ? `Quitada de destacados` : `Marcada como destacada`);
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo actualizar");
    }
  };

  const clearFilters = () => {
    setSearch("");
    setGenre("");
    setVidsrc("");
    setAutoImported("");
  };

  const hasFilters = Boolean(search || genre || vidsrc || autoImported);

  return (
    <div className="space-y-5">
      <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">{title}</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {total} {total === 1 ? singular : plural} en el catálogo
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refetch()}
          className="text-xs text-gray-400 hover:text-white border border-brand-border rounded-lg px-3 py-1.5 transition-colors focus-visible:ring-2 focus-visible:ring-brand-red"
        >
          {isFetching ? "Actualizando…" : "Actualizar"}
        </button>
      </header>

      {/* Filters */}
      <section
        aria-label="Filtros del catálogo"
        className="bg-brand-card border border-brand-border rounded-xl p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3"
      >
        <div className="lg:col-span-2">
          <label htmlFor={`${mediaType}-search`} className="block text-xs text-gray-500 mb-1">
            Buscar por título o IMDb
          </label>
          <input
            id={`${mediaType}-search`}
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Escribe para filtrar…"
            className="w-full bg-brand-dark border border-brand-border rounded-lg px-3 py-2 text-white text-sm outline-none focus:ring-2 focus:ring-brand-red"
          />
        </div>

        <div>
          <label htmlFor={`${mediaType}-genre`} className="block text-xs text-gray-500 mb-1">
            Género
          </label>
          <select
            id={`${mediaType}-genre`}
            value={genre}
            onChange={(event) => setGenre(event.target.value)}
            className="w-full bg-brand-dark border border-brand-border rounded-lg px-3 py-2 text-white text-sm outline-none focus:ring-2 focus:ring-brand-red"
          >
            <option value="">Todos</option>
            {genres.map((genreName) => (
              <option key={genreName} value={genreName}>
                {genreName}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor={`${mediaType}-vidsrc`} className="block text-xs text-gray-500 mb-1">
            Disponibilidad
          </label>
          <select
            id={`${mediaType}-vidsrc`}
            value={vidsrc}
            onChange={(event) => setVidsrc(event.target.value)}
            className="w-full bg-brand-dark border border-brand-border rounded-lg px-3 py-2 text-white text-sm outline-none focus:ring-2 focus:ring-brand-red"
          >
            {VIDSRC_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor={`${mediaType}-import`} className="block text-xs text-gray-500 mb-1">
            Origen
          </label>
          <select
            id={`${mediaType}-import`}
            value={autoImported}
            onChange={(event) => setAutoImported(event.target.value)}
            className="w-full bg-brand-dark border border-brand-border rounded-lg px-3 py-2 text-white text-sm outline-none focus:ring-2 focus:ring-brand-red"
          >
            <option value="">Todos</option>
            <option value="true">Importado automáticamente</option>
            <option value="false">Añadido manualmente</option>
          </select>
        </div>
      </section>

      {/* Selection toolbar */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 bg-brand-red/10 border border-brand-red/30 rounded-xl px-4 py-2.5">
          <p className="text-sm text-white">
            <span className="font-bold">{selected.size}</span> {selected.size === 1 ? singular : plural}{" "}
            seleccionadas
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="text-xs text-gray-300 hover:text-white px-3 py-1.5 rounded-lg border border-brand-border transition-colors focus-visible:ring-2 focus-visible:ring-brand-red"
            >
              Quitar selección
            </button>
            <button
              type="button"
              onClick={() => setConfirmBulk(true)}
              className="text-xs bg-brand-red hover:bg-red-700 text-white font-bold px-3 py-1.5 rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-white/70"
            >
              Eliminar seleccionadas
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-brand-card border border-brand-border rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="p-6 space-y-3" role="status" aria-live="polite">
            <span className="sr-only">Cargando catálogo…</span>
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="h-12 rounded-lg bg-brand-surface animate-pulse" />
            ))}
          </div>
        ) : isError ? (
          <div className="p-10 text-center">
            <p className="text-red-400 text-sm mb-3">
              {error instanceof Error ? error.message : "No se pudo cargar el catálogo"}
            </p>
            <button
              type="button"
              onClick={() => void refetch()}
              className="text-sm bg-brand-red hover:bg-red-700 text-white font-bold px-4 py-2 rounded-lg"
            >
              Reintentar
            </button>
          </div>
        ) : items.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-gray-400 text-sm mb-3">
              {hasFilters
                ? "No hay resultados para los filtros aplicados."
                : `Todavía no hay ${plural} en el catálogo.`}
            </p>
            {hasFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="text-sm text-brand-gold hover:underline"
              >
                Limpiar filtros
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">{title}</caption>
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-gray-500 border-b border-brand-border">
                  <th scope="col" className="px-3 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={allOnPageSelected}
                      onChange={toggleSelectAll}
                      aria-label="Seleccionar todos los elementos de esta página"
                      className="w-4 h-4 rounded border-brand-border text-brand-red focus:ring-brand-red bg-brand-dark"
                    />
                  </th>
                  <th scope="col" className="px-3 py-3">
                    <button
                      type="button"
                      onClick={() => {
                        setSort("title");
                        setOrder(order === "asc" ? "desc" : "asc");
                      }}
                      className="hover:text-white transition-colors"
                    >
                      Título
                    </button>
                  </th>
                  <th scope="col" className="px-3 py-3">
                    <button
                      type="button"
                      onClick={() => {
                        setSort("year");
                        setOrder(order === "asc" ? "desc" : "asc");
                      }}
                      className="hover:text-white transition-colors"
                    >
                      Año
                    </button>
                  </th>
                  <th scope="col" className="px-3 py-3 hidden md:table-cell">
                    <button
                      type="button"
                      onClick={() => {
                        setSort("rating");
                        setOrder(order === "asc" ? "desc" : "asc");
                      }}
                      className="hover:text-white transition-colors"
                    >
                      Nota
                    </button>
                  </th>
                  <th scope="col" className="px-3 py-3 hidden lg:table-cell">
                    <button
                      type="button"
                      onClick={() => {
                        setSort("views");
                        setOrder(order === "asc" ? "desc" : "asc");
                      }}
                      className="hover:text-white transition-colors"
                    >
                      Visitas
                    </button>
                  </th>
                  <th scope="col" className="px-3 py-3 hidden lg:table-cell">
                    Estado
                  </th>
                  <th scope="col" className="px-3 py-3">
                    <span className="sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const id = String(item.id);
                  const vidsrcStatus = item.vidsrc_status ?? "unknown";
                  return (
                    <tr
                      key={id}
                      className="border-b border-brand-border/60 last:border-0 hover:bg-brand-surface/40 transition-colors"
                    >
                      <td className="px-3 py-2.5">
                        <input
                          type="checkbox"
                          checked={selected.has(id)}
                          onChange={() => toggleSelect(id)}
                          aria-label={`Seleccionar ${item.title}`}
                          className="w-4 h-4 rounded border-brand-border text-brand-red focus:ring-brand-red bg-brand-dark"
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-3">
                          {item.poster_url ? (
                            <img
                              src={item.poster_url}
                              alt=""
                              loading="lazy"
                              width={32}
                              height={48}
                              className="w-8 h-12 object-cover rounded bg-brand-surface flex-shrink-0"
                            />
                          ) : (
                            <span
                              className="w-8 h-12 rounded bg-brand-surface flex-shrink-0"
                              aria-hidden="true"
                            />
                          )}
                          <div className="min-w-0">
                            <p className="text-white font-medium truncate max-w-[16rem]">{item.title}</p>
                            <p className="text-xs text-gray-500 truncate">{item.imdb_id ?? "—"}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-gray-300">{item.year ?? "—"}</td>
                      <td className="px-3 py-2.5 text-gray-300 hidden md:table-cell">
                        {item.rating ? item.rating.toFixed(1) : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-gray-300 hidden lg:table-cell">{item.views ?? 0}</td>
                      <td className="px-3 py-2.5 hidden lg:table-cell">
                        <span
                          className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${
                            vidsrcStatus === "active"
                              ? "text-emerald-400 border-emerald-500/40 bg-emerald-500/10"
                              : vidsrcStatus === "inactive"
                                ? "text-red-400 border-red-500/40 bg-red-500/10"
                                : "text-gray-400 border-brand-border bg-brand-surface"
                          }`}
                        >
                          <Wifi className="w-3 h-3" aria-hidden="true" />
                          {vidsrcStatus === "active"
                            ? "Disponible"
                            : vidsrcStatus === "inactive"
                              ? "No disponible"
                              : "Sin verificar"}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => void handleToggleFeatured(item)}
                            aria-label={
                              item.featured
                                ? `Quitar ${item.title} de destacados`
                                : `Marcar ${item.title} como destacado`
                            }
                            title="Destacado"
                            className={`p-1.5 rounded-md transition-colors focus-visible:ring-2 focus-visible:ring-brand-red ${
                              item.featured
                                ? "text-brand-gold hover:text-amber-300"
                                : "text-gray-600 hover:text-brand-gold"
                            }`}
                          >
                            <Star className="w-4 h-4" aria-hidden="true" />
                          </button>
                          <Link
                            to={`${detailPath}/${encodeURIComponent(id)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={`Ver ${item.title} en el sitio`}
                            title="Ver en el sitio"
                            className="p-1.5 rounded-md text-gray-600 hover:text-white transition-colors focus-visible:ring-2 focus-visible:ring-brand-red"
                          >
                            <Eye className="w-4 h-4" aria-hidden="true" />
                          </Link>
                          <button
                            type="button"
                            onClick={() => setEditing(item)}
                            aria-label={`Editar ${item.title}`}
                            title="Editar"
                            className="p-1.5 rounded-md text-gray-600 hover:text-white transition-colors focus-visible:ring-2 focus-visible:ring-brand-red"
                          >
                            <Edit2 className="w-4 h-4" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDelete(item)}
                            aria-label={`Eliminar ${item.title}`}
                            title="Eliminar"
                            className="p-1.5 rounded-md text-gray-600 hover:text-red-400 transition-colors focus-visible:ring-2 focus-visible:ring-brand-red"
                          >
                            <Trash2 className="w-4 h-4" aria-hidden="true" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {!isLoading && !isError && items.length > 0 && (
        <AdminPagination
          page={page}
          pages={pages}
          total={total}
          limit={limit}
          onPageChange={setPage}
          onLimitChange={setLimit}
          itemLabel={plural}
        />
      )}

      <ConfirmDialog
        open={confirmDelete !== null}
        title={`Eliminar ${singular}`}
        description={
          <>
            Se va a eliminar <strong className="text-white">{confirmDelete?.title}</strong> del catálogo. Esta
            acción no se puede deshacer.
          </>
        }
        confirmLabel="Eliminar"
        busy={busy}
        onConfirm={() => void handleDelete()}
        onCancel={() => setConfirmDelete(null)}
      />

      <ConfirmDialog
        open={confirmBulk}
        title={`Eliminar ${selected.size} ${selected.size === 1 ? singular : plural}`}
        description={
          <>
            Se eliminarán {selected.size} {selected.size === 1 ? singular : plural} del catálogo. Esta acción
            no se puede deshacer.
            {selectedItems.length > 0 && (
              <ul className="mt-3 max-h-32 overflow-y-auto text-xs text-gray-500 space-y-1">
                {selectedItems.map((item) => (
                  <li key={String(item.id)}>· {item.title}</li>
                ))}
              </ul>
            )}
          </>
        }
        confirmLabel="Eliminar"
        busy={busy}
        onConfirm={() => void handleBulkDelete()}
        onCancel={() => setConfirmBulk(false)}
      />

      <EditMediaModal
        item={editing}
        type={mediaType}
        onClose={() => setEditing(null)}
        onSaved={() => void refresh()}
      />
    </div>
  );
}
