import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import { Film, Search, Menu, X, Heart, Tv } from "lucide-react";
import { useDebounce } from "@/hooks/use-debounce";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { apiSearchMovies, apiSearchSeries, type LocalSeries } from "@/lib/api-client";
import { LocalMovie } from "@/lib/admin-db";

export function Navbar() {
  const [location, setLocation] = useLocation();
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const [autocomplete, setAutocomplete] = useState<{ movies: LocalMovie[]; series: LocalSeries[] }>({ movies: [], series: [] });
  const [showDropdown, setShowDropdown] = useState(false);
  const [favorites] = useLocalStorage<string[]>("cv_favorites", []);
  const searchRef = useRef<HTMLDivElement>(null);

  const debouncedSearch = useDebounce(searchValue, 300);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Autocomplete search
  useEffect(() => {
    if (!debouncedSearch.trim() || debouncedSearch.trim().length < 2) {
      setAutocomplete({ movies: [], series: [] });
      setShowDropdown(false);
      return;
    }
    Promise.all([
      apiSearchMovies(debouncedSearch, 5).catch(() => [] as LocalMovie[]),
      apiSearchSeries(debouncedSearch, 5).catch(() => [] as LocalSeries[]),
    ]).then(([movies, series]) => {
      setAutocomplete({ movies, series });
      setShowDropdown(movies.length > 0 || series.length > 0);
    });
  }, [debouncedSearch]);

  // Close dropdown on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchValue.trim()) {
      setLocation(`/search/${encodeURIComponent(searchValue.trim())}`);
      setShowDropdown(false);
    }
  };

  const handleSearchKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSearchSubmit(e as unknown as React.FormEvent);
    if (e.key === "Escape") { setShowDropdown(false); setSearchValue(""); }
  };

  const goToMovie = (id: string) => {
    setLocation(`/movie/${id}`);
    setShowDropdown(false);
    setSearchValue("");
  };

  const goToSeries = (id: string) => {
    setLocation(`/series/${id}`);
    setShowDropdown(false);
    setSearchValue("");
  };

  useEffect(() => {
    if (!location.startsWith("/search")) setSearchValue("");
    setMobileMenuOpen(false);
    setShowDropdown(false);
  }, [location]);

  const navLinks = [
    { href: "/", label: "Inicio", match: (l: string) => l === "/" },
    { href: "/browse", label: "Explorar", match: (l: string) => l.startsWith("/browse") },
    { href: "/series", label: "Series", match: (l: string) => l === "/series" },
  ];

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isScrolled
          ? "bg-background/95 backdrop-blur-xl border-b border-border shadow-lg"
          : "bg-gradient-to-b from-black/80 to-transparent border-b border-transparent"
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 md:px-8 h-20 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 group outline-none flex-shrink-0" data-testid="link-home">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-blue-600 flex items-center justify-center shadow-[0_0_15px_rgba(0,212,255,0.4)] group-hover:shadow-[0_0_25px_rgba(0,212,255,0.6)] transition-shadow">
            <Film className="w-5 h-5 text-primary-foreground" />
          </div>
          <span className="font-heading text-3xl tracking-wider text-foreground group-hover:text-primary transition-colors">
            Cine Gratín
          </span>
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center gap-8 absolute left-1/2 -translate-x-1/2">
          {navLinks.map(link => (
            <Link
              key={link.href}
              href={link.href}
              className={`text-sm font-bold uppercase tracking-widest transition-colors ${
                link.match(location) ? "text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Right: Search + My List + Mobile toggle */}
        <div className="flex items-center gap-3">
          {/* Search with autocomplete */}
          <div ref={searchRef} className="hidden md:flex relative group">
            <form onSubmit={handleSearchSubmit} className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
              </div>
              <input
                type="text"
                placeholder="Buscar películas y series..."
                value={searchValue}
                onChange={e => setSearchValue(e.target.value)}
                onFocus={() => { if (autocomplete.movies.length || autocomplete.series.length) setShowDropdown(true); }}
                onKeyDown={handleSearchKey}
                className="bg-secondary/50 border border-border focus:border-primary focus:ring-1 focus:ring-primary text-foreground rounded-full pl-10 pr-4 py-2 text-sm w-64 transition-all outline-none placeholder:text-muted-foreground backdrop-blur-md"
                data-testid="input-search"
              />
            </form>

            {/* Autocomplete dropdown */}
            {showDropdown && (
              <div className="absolute top-full mt-2 left-0 right-0 w-80 bg-card border border-border rounded-xl shadow-2xl overflow-hidden z-[100]">
                {autocomplete.movies.length > 0 && (
                  <div>
                    <div className="px-3 py-2 border-b border-border/50 flex items-center gap-1.5">
                      <Film className="w-3.5 h-3.5 text-primary" />
                      <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Películas</span>
                    </div>
                    {autocomplete.movies.map(m => (
                      <button
                        key={m.id}
                        onClick={() => goToMovie(m.id)}
                        className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-primary/10 transition-colors text-left"
                      >
                        {m.poster_url && (
                          <img src={m.poster_url} alt="" className="w-8 h-10 object-cover rounded" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-foreground text-sm font-semibold truncate">{m.title}</p>
                          <p className="text-muted-foreground text-xs">{m.year}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                {autocomplete.series.length > 0 && (
                  <div>
                    <div className="px-3 py-2 border-t border-b border-border/50 flex items-center gap-1.5">
                      <Tv className="w-3.5 h-3.5 text-primary" />
                      <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Series</span>
                    </div>
                    {autocomplete.series.map(s => (
                      <button
                        key={s.id}
                        onClick={() => goToSeries(s.id)}
                        className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-primary/10 transition-colors text-left"
                      >
                        {s.poster_url && (
                          <img src={s.poster_url} alt="" className="w-8 h-10 object-cover rounded" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-foreground text-sm font-semibold truncate">{s.title}</p>
                          <p className="text-muted-foreground text-xs">{s.year} · {s.total_seasons} temp.</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                {/* See all results */}
                <button
                  onClick={() => { setLocation(`/search/${encodeURIComponent(searchValue.trim())}`); setShowDropdown(false); }}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-primary/5 hover:bg-primary/10 border-t border-border transition-colors text-primary text-xs font-bold uppercase tracking-wider"
                >
                  <Search className="w-3.5 h-3.5" />
                  Ver todos los resultados
                </button>
              </div>
            )}
          </div>

          {/* My List button */}
          <Link
            href="/favorites"
            className={`hidden md:flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-bold uppercase tracking-wider transition-colors relative ${
              location.startsWith("/favorites")
                ? "text-red-400 bg-red-500/10"
                : "text-muted-foreground hover:text-red-400"
            }`}
            data-testid="link-favorites"
          >
            <Heart className={`w-4 h-4 ${location.startsWith("/favorites") ? "fill-current" : ""}`} />
            Mi Lista
            {favorites.length > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                {favorites.length > 99 ? "99+" : favorites.length}
              </span>
            )}
          </Link>

          <button
            className="md:hidden text-foreground hover:text-primary transition-colors p-2"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Abrir menú"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden absolute top-20 left-0 right-0 bg-card border-b border-border shadow-2xl p-4 flex flex-col gap-3 animate-in slide-in-from-top-2">
          <form onSubmit={handleSearchSubmit} className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-muted-foreground" />
            </div>
            <input
              type="text"
              placeholder="Buscar películas y series..."
              value={searchValue}
              onChange={e => setSearchValue(e.target.value)}
              onKeyDown={handleSearchKey}
              className="w-full bg-background border border-border focus:border-primary text-foreground rounded-lg pl-10 pr-4 py-3 text-sm outline-none"
            />
          </form>
          {navLinks.map(link => (
            <Link
              key={link.href}
              href={link.href}
              className={`p-3 rounded-lg font-bold uppercase tracking-wider flex items-center gap-2 ${
                link.match(location) ? "bg-primary/10 text-primary" : "text-foreground hover:bg-secondary"
              }`}
            >
              {link.href === "/series" && <Tv className="w-4 h-4" />}
              {link.label}
            </Link>
          ))}
          <Link
            href="/favorites"
            className={`p-3 rounded-lg font-bold uppercase tracking-wider flex items-center gap-2 ${
              location.startsWith("/favorites") ? "bg-red-500/10 text-red-400" : "text-foreground hover:bg-secondary"
            }`}
          >
            <Heart className="w-4 h-4" />
            Mi Lista
            {favorites.length > 0 && (
              <span className="ml-auto bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                {favorites.length}
              </span>
            )}
          </Link>
        </div>
      )}
    </header>
  );
}
