import { Link, useLocation } from "wouter";
import { useEffect, useState } from "react";
import { Film, Tv, Menu, X, PlayCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export function Navbar() {
  const [location] = useLocation();
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const isHome = location === "/";
  const navBg = isHome && !isScrolled ? "bg-transparent" : "bg-background/95 backdrop-blur border-b border-border";

  const closeMenu = () => setMobileMenuOpen(false);

  return (
    <nav className={cn("fixed top-0 w-full z-50 transition-all duration-300", navBg)}>
      <div className="container mx-auto px-4 md:px-8">
        <div className="flex items-center justify-between h-16">
          <Link href="/" className="flex items-center gap-2" onClick={closeMenu}>
            <PlayCircle className="w-8 h-8 text-primary" />
            <span className="font-bold text-xl tracking-wider text-foreground">CINE GRATÍN</span>
          </Link>

          <div className="hidden md:flex items-center gap-8">
            <Link href="/peliculas" className={cn("text-sm font-medium transition-colors hover:text-primary", location.startsWith("/pelicula") ? "text-primary" : "text-muted-foreground")}>
              Películas
            </Link>
            <Link href="/series" className={cn("text-sm font-medium transition-colors hover:text-primary", location.startsWith("/serie") ? "text-primary" : "text-muted-foreground")}>
              Series
            </Link>
          </div>

          <div className="md:hidden">
            <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="text-foreground p-2">
              {mobileMenuOpen ? <X /> : <Menu />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden absolute top-16 left-0 w-full bg-background border-b border-border py-4 px-4 flex flex-col gap-4 shadow-xl">
          <Link href="/peliculas" className="flex items-center gap-2 text-lg font-medium p-2" onClick={closeMenu}>
            <Film className="w-5 h-5 text-primary" /> Películas
          </Link>
          <Link href="/series" className="flex items-center gap-2 text-lg font-medium p-2" onClick={closeMenu}>
            <Tv className="w-5 h-5 text-primary" /> Series
          </Link>
        </div>
      )}
    </nav>
  );
}
