export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-brand-border bg-brand-dark mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          {/* Logo */}
          <div className="flex items-center gap-1.5">
            <span className="text-brand-red font-black text-lg tracking-tight">CINE</span>
            <span className="text-brand-gold font-black text-lg tracking-tight">GRATIN</span>
          </div>

          {/* Disclaimer + copyright */}
          <div className="text-center sm:text-right">
            <p className="text-gray-600 text-xs leading-relaxed max-w-sm">
              El contenido multimedia es provisto por servicios externos. No almacenamos ni
              distribuimos archivos de video.
            </p>
            <p className="text-gray-700 text-xs mt-1">
              &copy; {year} Cine Gratín. Todos los derechos reservados.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
