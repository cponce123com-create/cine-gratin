import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

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
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 group">
            <span className="text-brand-red font-black text-xl tracking-tight leading-none">
              CINE
            </span>
            <span className="text-brand-gold font-black text-xl tracking-tight leading-none">
              GRATIN
            </span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-8">
            <Link to="/" className={`text-sm font-medium pb-1 transition-colors ${isActive("/")}`}>
              Inicio
            </Link>
            <Link
              to="/peliculas"
              className={`text-sm font-medium pb-1 transition-colors ${isActive("/peliculas")}`}
            >
              Peliculas
            </Link>
            <Link
              to="/series"
              className={`text-sm font-medium pb-1 transition-colors ${isActive("/series")}`}
            >
              Series
            </Link>
          </nav>

          {/* Mobile hamburger */}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="md:hidden p-2 rounded text-gray-300 hover:text-white"
            aria-label="Menu"
          >
            <div className="w-5 flex flex-col gap-1.5">
              <span
                className={`block h-0.5 bg-current transition-transform origin-center ${menuOpen ? "rotate-45 translate-y-2" : ""}`}
              />
              <span
                className={`block h-0.5 bg-current transition-opacity ${menuOpen ? "opacity-0" : ""}`}
              />
              <span
                className={`block h-0.5 bg-current transition-transform origin-center ${menuOpen ? "-rotate-45 -translate-y-2" : ""}`}
              />
            </div>
          </button>
        </div>

        {/* Mobile menu */}
        {menuOpen && (
          <nav className="md:hidden pb-4 flex flex-col gap-2 border-t border-brand-border mt-1 pt-3">
            <Link to="/" className="text-sm font-medium text-gray-300 hover:text-white py-2 px-2">
              Inicio
            </Link>
            <Link
              to="/peliculas"
              className="text-sm font-medium text-gray-300 hover:text-white py-2 px-2"
            >
              Peliculas
            </Link>
            <Link
              to="/series"
              className="text-sm font-medium text-gray-300 hover:text-white py-2 px-2"
            >
              Series
            </Link>
          </nav>
        )}
      </div>
    </header>
  );
}
