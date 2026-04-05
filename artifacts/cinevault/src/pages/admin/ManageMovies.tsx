import { useState, useEffect } from "react";
import { Film, Search, Trash2, Edit2, Eye, Star, Trash, ChevronLeft, ChevronRight } from "lucide-react";
import { getMovies, deleteMovie, updateMovie, LocalMovie } from "@/lib/admin-db";
import { toast } from "sonner";

interface ManageMoviesProps {
  onEdit: (id: string) => void;
}

const PAGE_SIZE = 20;

export function ManageMovies({ onEdit }: ManageMoviesProps) {
  const [movies, setMovies] = useState<LocalMovie[]>([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const load = () => {
    setMovies(getMovies());
    setSelected(new Set());
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = movies.filter(m =>
    !search ||
    m.title.toLowerCase().includes(search.toLowerCase()) ||
    m.imdb_id.toLowerCase().includes(search.toLowerCase()) ||
    String(m.year).includes(search)
  );

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleDelete = (id: string) => {
    deleteMovie(id);
    load();
    setDeleteConfirm(null);
    toast.success("Movie deleted");
  };

  const handleBulkDelete = () => {
    if (!confirm(`Delete ${selected.size} selected movies?`)) return;
    selected.forEach(id => deleteMovie(id));
    load();
    toast.success(`${selected.size} movies deleted`);
  };

  const toggleFeatured = (movie: LocalMovie) => {
    updateMovie(movie.id, { featured: !movie.featured });
    load();
    toast.success(movie.featured ? "Removed from featured" : "Set as featured");
  };

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === paginated.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(paginated.map(m => m.id)));
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#c9d1d9] mb-1">Manage Movies</h1>
          <p className="text-[#8b949e] text-sm">{movies.length} movie{movies.length !== 1 ? "s" : ""} in local database</p>
        </div>

        {selected.size > 0 && (
          <button
            onClick={handleBulkDelete}
            className="flex items-center gap-2 bg-[#da3633]/10 border border-[#da3633]/30 text-[#f85149] px-4 py-2 rounded-lg text-sm font-bold hover:bg-[#da3633]/20 transition-colors"
          >
            <Trash className="w-4 h-4" />
            Delete {selected.size} selected
          </button>
        )}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8b949e]" />
        <input
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          placeholder="Search by title, IMDb ID, or year..."
          className="w-full bg-[#161b22] border border-[#30363d] focus:border-[#238636] text-[#c9d1d9] rounded-lg pl-10 pr-4 py-2.5 text-sm font-mono outline-none placeholder:text-[#484f58]"
          data-testid="input-search-movies"
        />
      </div>

      {movies.length === 0 ? (
        <div className="bg-[#161b22] border border-[#30363d] rounded-xl py-16 text-center">
          <Film className="w-12 h-12 text-[#30363d] mx-auto mb-3" />
          <p className="text-[#8b949e] font-mono text-sm">No movies in local database</p>
          <p className="text-[#484f58] font-mono text-xs mt-1">Use "Add Movie" to get started</p>
        </div>
      ) : (
        <>
          {/* Table */}
          <div className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#30363d] bg-[#0d1117]/50">
                    <th className="px-4 py-3 text-left w-10">
                      <input
                        type="checkbox"
                        checked={selected.size === paginated.length && paginated.length > 0}
                        onChange={toggleSelectAll}
                        className="accent-[#238636]"
                      />
                    </th>
                    <th className="px-4 py-3 text-left text-[#8b949e] font-mono uppercase text-xs tracking-wider w-12">Poster</th>
                    <th className="px-4 py-3 text-left text-[#8b949e] font-mono uppercase text-xs tracking-wider">Title</th>
                    <th className="px-4 py-3 text-left text-[#8b949e] font-mono uppercase text-xs tracking-wider hidden md:table-cell">IMDb ID</th>
                    <th className="px-4 py-3 text-left text-[#8b949e] font-mono uppercase text-xs tracking-wider hidden lg:table-cell">Added</th>
                    <th className="px-4 py-3 text-right text-[#8b949e] font-mono uppercase text-xs tracking-wider hidden sm:table-cell">Views</th>
                    <th className="px-4 py-3 text-right text-[#8b949e] font-mono uppercase text-xs tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#21262d]">
                  {paginated.map(movie => (
                    <tr
                      key={movie.id}
                      className={`hover:bg-[#21262d]/50 transition-colors ${selected.has(movie.id) ? "bg-[#238636]/5" : ""}`}
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selected.has(movie.id)}
                          onChange={() => toggleSelect(movie.id)}
                          className="accent-[#238636]"
                        />
                      </td>
                      <td className="px-4 py-3">
                        {movie.poster_url ? (
                          <img src={movie.poster_url} alt={movie.title} className="w-8 h-11 object-cover rounded" />
                        ) : (
                          <div className="w-8 h-11 rounded bg-[#21262d] flex items-center justify-center">
                            <Film className="w-4 h-4 text-[#8b949e]" />
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div>
                            <p className="text-[#c9d1d9] font-medium line-clamp-1 max-w-[180px]">{movie.title}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[#8b949e] text-xs font-mono">{movie.year}</span>
                              <span className="flex items-center gap-0.5 text-xs text-yellow-500 font-mono">
                                <Star className="w-3 h-3 fill-current" />
                                {movie.rating}
                              </span>
                              {movie.featured && (
                                <span className="text-[10px] bg-[#e3b341]/20 text-[#e3b341] border border-[#e3b341]/30 px-1.5 py-0.5 rounded font-mono">Featured</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <span className="text-[#58a6ff] font-mono text-xs">{movie.imdb_id}</span>
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <span className="text-[#8b949e] font-mono text-xs">
                          {new Date(movie.date_added).toLocaleDateString()}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right hidden sm:table-cell">
                        <span className="text-[#c9d1d9] font-mono text-sm">{movie.views || 0}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => toggleFeatured(movie)}
                            className={`p-1.5 rounded transition-colors ${
                              movie.featured
                                ? "text-[#e3b341] bg-[#e3b341]/10 hover:bg-[#e3b341]/20"
                                : "text-[#8b949e] hover:text-[#e3b341] hover:bg-[#e3b341]/10"
                            }`}
                            title={movie.featured ? "Unfeature" : "Feature"}
                          >
                            <Star className={`w-4 h-4 ${movie.featured ? "fill-current" : ""}`} />
                          </button>
                          <a
                            href={`/movie/${movie.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 rounded text-[#8b949e] hover:text-[#58a6ff] hover:bg-[#58a6ff]/10 transition-colors"
                            title="Preview"
                          >
                            <Eye className="w-4 h-4" />
                          </a>
                          <button
                            onClick={() => onEdit(movie.id)}
                            className="p-1.5 rounded text-[#8b949e] hover:text-[#3fb950] hover:bg-[#238636]/10 transition-colors"
                            title="Edit"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(movie.id)}
                            className="p-1.5 rounded text-[#8b949e] hover:text-[#f85149] hover:bg-[#da3633]/10 transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="px-4 py-3 border-t border-[#30363d] flex items-center justify-between">
                <span className="text-[#8b949e] text-xs font-mono">
                  Page {page} of {totalPages} · {filtered.length} results
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="p-1.5 rounded border border-[#30363d] text-[#8b949e] hover:text-[#c9d1d9] disabled:opacity-30 transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="p-1.5 rounded border border-[#30363d] text-[#8b949e] hover:text-[#c9d1d9] disabled:opacity-30 transition-colors"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Delete confirmation modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-[#161b22] border border-[#da3633]/30 rounded-xl p-6 max-w-sm w-full shadow-2xl">
            <h3 className="text-[#c9d1d9] font-bold text-lg mb-2">Delete Movie?</h3>
            <p className="text-[#8b949e] text-sm mb-6">
              This will permanently remove the movie from your local database. This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => handleDelete(deleteConfirm)}
                className="flex-1 bg-[#da3633] hover:bg-[#b62324] text-white py-2.5 rounded-lg font-bold text-sm transition-colors"
                data-testid="btn-confirm-delete"
              >
                Delete
              </button>
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 bg-[#21262d] text-[#c9d1d9] hover:bg-[#30363d] py-2.5 rounded-lg font-bold text-sm transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
