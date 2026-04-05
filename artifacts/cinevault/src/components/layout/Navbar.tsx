import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Film, Search, Menu, X, Heart, Tv } from "lucide-react";
import { useDebounce } from "@/hooks/use-debounce";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { FavoriteMovie } from "@/lib/yts";

export function Navbar() {
  const [location, setLocation] = useLocation();
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const [favorites] = useLocalStorage<FavoriteMovie[]>("cv_favorites", []);

  const debouncedSearch = useDebounce(searchValue, 400);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    if (debouncedSearch.trim()) {
      setLocation(`/search/${encodeURIComponent(debouncedSearch.trim())}`);
    }
  }, [debouncedSearch, setLocation]);

  useEffect(() => {
    if (!location.startsWith("/search")) {
      setSearchValue("");
    }
    setMobileMenuOpen(false);
  }, [location]);

  const navLinks = [
    { href: "/", label: "Home", match: (l: string) => l === "/" },
    { href: "/browse", label: "Browse", match: (l: string) => l.startsWith("/browse") },
    { href: "/series", label: "Series", match: (l: string) => l.startsWith("/series") },
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
            CineVault
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
          <div className="hidden md:flex relative group">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
            </div>
            <input
              type="text"
              placeholder="Search movies..."
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              className="bg-secondary/50 border border-border focus:border-primary focus:ring-1 focus:ring-primary text-foreground rounded-full pl-10 pr-4 py-2 text-sm w-56 transition-all outline-none placeholder:text-muted-foreground backdrop-blur-md"
              data-testid="input-search"
            />
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
            My List
            {favorites.length > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                {favorites.length > 99 ? "99+" : favorites.length}
              </span>
            )}
          </Link>

          <button
            className="md:hidden text-foreground hover:text-primary transition-colors p-2"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden absolute top-20 left-0 right-0 bg-card border-b border-border shadow-2xl p-4 flex flex-col gap-3 animate-in slide-in-from-top-2">
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-muted-foreground" />
            </div>
            <input
              type="text"
              placeholder="Search movies..."
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              className="w-full bg-background border border-border focus:border-primary text-foreground rounded-lg pl-10 pr-4 py-3 text-sm outline-none"
            />
          </div>
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
            My List
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
