import { useState, useEffect, useRef, useCallback } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { searchMovies, searchSeries } from "@/lib/api";
import type { Movie, Series } from "@/lib/types";

const FALLBACK_POSTER =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='60' viewBox='0 0 40 60'%3E%3Crect width='40' height='60' fill='%231a1a1a'/%3E%3C/svg%3E";

type SearchResult =
  | { kind: "movie"; item: Movie }
  | { kind: "series"; item: Series };

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const searchRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => { setMenuOpen(false); setSearchOpen(false); setQuery(""); }, [location.pathname]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); setSearching(false); return; }
    setSearching(true);
    try {
      const [movies, series] = await Promise.all([
        searchMovies(q, 6),
        searchSeries(q, 4),
      ]);
      const combined: SearchResult[] = [
        ...movies.map((m): SearchResult => ({ kind: "movie", item: m })),
        ...series.map((s): SearchResult => ({ kind: "series", item: s })),
      ];
      setResults(combined);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  const handleQueryChange = (val: string) => {
    setQuery(val);
    setSearchOpen(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(val), 300);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      navigate(`/search/${encodeURIComponent(query.trim())}`);
      setSearchOpen(false);
    }
  };

  const isActive = (path: string) =>
    location.pathname === path
      ? "text-white border-b-2 border-brand-red"
      : "text-gray-300 hover:text-white";

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled || menuOpen
          ? "bg-brand-dark/95 backdrop-blur-sm shadow-lg"
          : "bg-gradient-to-b from-black/80 to-transparent"
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-4">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-1 flex-shrink-0">
            <span className="text-brand-red font-black text-xl tracking-tight leading-none">CINE</span>
            <span className="text-brand-gold font-black text-xl tracking-tight leading-none">GRATIN</span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-7 flex-shrink-0">
            <Link to="/" className={`text-sm font-medium pb-1 transition-colors ${isActive("/")}`}>
              Inicio
            </Link>
            <Link to="/peliculas" className={`text-sm font-medium pb-1 transition-colors ${isActive("/peliculas")}`}>
              Películas
            </Link>
            <Link to="/series" className={`text-sm font-medium pb-1 transition-colors ${isActive("/series")}`}>
              Series
            </Link>
          </nav>

          {/* Desktop search */}
          <div ref={searchRef} className="hidden md:block relative flex-1 max-w-xs">
            <form onSubmit={handleSearchSubmit}>
              <div className="relative">
                <input
                  type="text"
                  value={query}
                  onChange={(e) => handleQueryChange(e.target.value)}
                  onFocus={() => query && setSearchOpen(true)}
                  placeholder="Buscar..."
                  className="w-full bg-white/8 border border-white/10 rounded-full px-4 py-1.5 pl-9 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-white/25 transition-colors"
                />
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
                  <SearchIcon />
                </span>
                {query && (
                  <button
                    type="button"
                    onClick={() => { setQuery(""); setResults([]); setSearchOpen(false); }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white text-xs"
                  >
                    &times;
                  </button>
                )}
              </div>
            </form>

            {/* Dropdown */}
            {searchOpen && query && (
              <div className="absolute top-full mt-2 left-0 right-0 bg-brand-card border border-brand-border rounded-xl shadow-2xl overflow-hidden z-50">
                {searching ? (
                  <div className="flex items-center justify-center py-6">
                    <div className="w-5 h-5 rounded-full border-2 border-brand-red border-t-transparent animate-spin" />
                  </div>
                ) : results.length === 0 ? (
                  <p className="text-gray-500 text-sm text-center py-6">Sin resultados</p>
                ) : (
                  <>
                    <div className="max-h-80 overflow-y-auto">
                      {results.map((r) => (
                        <Link
                          key={`${r.kind}-${r.item.id}`}
                          to={r.kind === "movie" ? `/pelicula/${r.item.id}` : `/serie/${r.item.id}`}
                          className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/5 transition-colors"
                        >
                          <img
                            src={r.item.poster_url || FALLBACK_POSTER}
                            alt={r.item.title}
                            className="w-8 h-12 object-cover rounded flex-shrink-0"
                            onError={(e) => { (e.currentTarget as HTMLImageElement).src = FALLBACK_POSTER; }}
                          />
                          <div className="min-w-0">
                            <p className="text-white text-sm font-medium truncate">{r.item.title}</p>
                            <p className="text-gray-500 text-xs">
                              {r.kind === "movie" ? "Película" : "Serie"} · {r.item.year ?? ""}
                            </p>
                          </div>
                        </Link>
                      ))}
                    </div>
                    <div className="border-t border-brand-border">
                      <button
                        onClick={() => { navigate(`/search/${encodeURIComponent(query)}`); setSearchOpen(false); }}
                        className="w-full text-center text-brand-red text-xs font-semibold py-2.5 hover:text-red-400 transition-colors"
                      >
                        Ver todos los resultados &rarr;
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Mobile: search icon + hamburger */}
          <div className="flex items-center gap-2 md:hidden">
            <button
              onClick={() => setSearchOpen((v) => !v)}
              className="p-2 text-gray-300 hover:text-white"
              aria-label="Buscar"
            >
              <SearchIcon />
            </button>
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="p-2 rounded text-gray-300 hover:text-white"
              aria-label="Menú"
            >
              <div className="w-5 flex flex-col gap-1.5">
                <span className={`block h-0.5 bg-current transition-transform origin-center ${menuOpen ? "rotate-45 translate-y-2" : ""}`} />
                <span className={`block h-0.5 bg-current transition-opacity ${menuOpen ? "opacity-0" : ""}`} />
                <span className={`block h-0.5 bg-current transition-transform origin-center ${menuOpen ? "-rotate-45 -translate-y-2" : ""}`} />
              </div>
            </button>
          </div>
        </div>

        {/* Mobile search panel */}
        {searchOpen && (
          <div className="md:hidden pb-3 pt-2 border-t border-brand-border mt-1">
            <form onSubmit={handleSearchSubmit}>
              <div className="relative">
                <input
                  autoFocus
                  type="text"
                  value={query}
                  onChange={(e) => handleQueryChange(e.target.value)}
                  placeholder="Buscar películas o series..."
                  className="w-full bg-white/8 border border-white/15 rounded-full px-4 py-2 pl-9 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-white/30 transition-colors"
                />
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
                  <SearchIcon />
                </span>
                {query && (
                  <button
                    type="button"
                    onClick={() => { setQuery(""); setResults([]); }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white text-xs"
                  >
                    &times;
                  </button>
                )}
              </div>
            </form>

            {/* Mobile search results */}
            {query && (
              <div className="mt-2 bg-brand-card border border-brand-border rounded-xl overflow-hidden">
                {searching ? (
                  <div className="flex items-center justify-center py-5">
                    <div className="w-5 h-5 rounded-full border-2 border-brand-red border-t-transparent animate-spin" />
                  </div>
                ) : results.length === 0 ? (
                  <p className="text-gray-500 text-sm text-center py-5">Sin resultados</p>
                ) : (
                  <>
                    <div className="max-h-64 overflow-y-auto">
                      {results.map((r) => (
                        <Link
                          key={`${r.kind}-${r.item.id}`}
                          to={r.kind === "movie" ? `/pelicula/${r.item.id}` : `/serie/${r.item.id}`}
                          className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/5 transition-colors"
                        >
                          <img
                            src={r.item.poster_url || FALLBACK_POSTER}
                            alt={r.item.title}
                            className="w-8 h-12 object-cover rounded flex-shrink-0"
                            onError={(e) => { (e.currentTarget as HTMLImageElement).src = FALLBACK_POSTER; }}
                          />
                          <div className="min-w-0">
                            <p className="text-white text-sm font-medium truncate">{r.item.title}</p>
                            <p className="text-gray-500 text-xs">
                              {r.kind === "movie" ? "Película" : "Serie"} · {r.item.year ?? ""}
                            </p>
                          </div>
                        </Link>
                      ))}
                    </div>
                    <div className="border-t border-brand-border">
                      <button
                        onClick={() => { navigate(`/search/${encodeURIComponent(query)}`); setSearchOpen(false); }}
                        className="w-full text-center text-brand-red text-xs font-semibold py-2.5 hover:text-red-400 transition-colors"
                      >
                        Ver todos los resultados &rarr;
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* Mobile menu */}
        {menuOpen && (
          <nav className="md:hidden pb-4 flex flex-col gap-1 border-t border-brand-border mt-1 pt-3">
            <Link to="/" className="text-sm font-medium text-gray-300 hover:text-white py-2 px-2">Inicio</Link>
            <Link to="/peliculas" className="text-sm font-medium text-gray-300 hover:text-white py-2 px-2">Películas</Link>
            <Link to="/series" className="text-sm font-medium text-gray-300 hover:text-white py-2 px-2">Series</Link>
          </nav>
        )}
      </div>
    </header>
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
