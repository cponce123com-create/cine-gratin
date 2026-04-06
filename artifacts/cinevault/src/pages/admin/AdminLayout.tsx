import { type ReactNode } from "react";
import { LayoutDashboard, PlusCircle, Film, Server, Settings, LogOut, Menu, X, ChevronRight, Layers, Tv, ListVideo } from "lucide-react";
import { logout } from "@/lib/admin-db";

export type AdminPage = "dashboard" | "add-movie" | "manage-movies" | "bulk-import" | "add-series" | "manage-series" | "video-servers" | "settings";

interface AdminLayoutProps {
  currentPage: AdminPage;
  onNavigate: (page: AdminPage) => void;
  onLogout: () => void;
  editMovieId?: string | null;
  editSeriesId?: string | null;
  children: ReactNode;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
}

const NAV_ITEMS: { id: AdminPage; label: string; icon: typeof LayoutDashboard; badge?: string; group?: string }[] = [
  { id: "dashboard", label: "Panel de Control", icon: LayoutDashboard },
  { id: "add-movie", label: "Agregar Película", icon: PlusCircle, group: "Películas" },
  { id: "bulk-import", label: "Importación Masiva", icon: Layers },
  { id: "manage-movies", label: "Gestionar Películas", icon: Film },
  { id: "add-series", label: "Añadir Serie", icon: Tv, group: "Series" },
  { id: "manage-series", label: "Gestionar Series", icon: ListVideo },
  { id: "video-servers", label: "Servidores de Video", icon: Server, group: "Sistema" },
  { id: "settings", label: "Configuración", icon: Settings },
];

export function AdminLayout({
  currentPage,
  onNavigate,
  onLogout,
  editMovieId,
  editSeriesId,
  children,
  sidebarOpen,
  setSidebarOpen,
}: AdminLayoutProps) {
  const handleLogout = () => {
    logout();
    onLogout();
  };

  const pageTitle =
    currentPage === "add-movie" && editMovieId
      ? "Editar Película"
      : currentPage === "add-series" && editSeriesId
      ? "Editar Serie"
      : NAV_ITEMS.find(n => n.id === currentPage)?.label ?? "Admin";

  return (
    <div className="min-h-screen bg-[#0d1117] text-[#c9d1d9] flex font-sans">
      {/* Sidebar overlay on mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/60 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed lg:static inset-y-0 left-0 z-30 w-64 bg-[#161b22] border-r border-[#30363d] flex flex-col transition-transform duration-300 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        {/* Logo */}
        <div className="px-6 py-5 border-b border-[#30363d] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#238636] flex items-center justify-center flex-shrink-0">
              <Film className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-white font-bold text-sm tracking-wider font-mono">CINEVAULT</p>
              <p className="text-[#8b949e] text-[10px] font-mono uppercase tracking-wider">Panel Admin</p>
            </div>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden text-[#8b949e] hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {NAV_ITEMS.map((item, idx) => {
            const Icon = item.icon;
            const isActive = currentPage === item.id;
            const showGroup = item.group && (idx === 0 || NAV_ITEMS[idx - 1].group !== item.group);
            return (
              <div key={item.id}>
                {showGroup && (
                  <p className="text-[#484f58] text-[10px] font-mono uppercase tracking-widest px-3 pt-4 pb-1.5">
                    {item.group}
                  </p>
                )}
                <button
                  onClick={() => { onNavigate(item.id); setSidebarOpen(false); }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-[#238636]/20 text-[#3fb950] border border-[#238636]/30"
                      : "text-[#8b949e] hover:text-[#c9d1d9] hover:bg-[#21262d]"
                  }`}
                  data-testid={`nav-${item.id}`}
                >
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  <span className="flex-1 text-left">{item.label}</span>
                  {item.badge && !isActive && (
                    <span className="text-[9px] font-bold bg-[#238636]/20 text-[#3fb950] px-1.5 py-0.5 rounded font-mono">
                      {item.badge}
                    </span>
                  )}
                  {isActive && <ChevronRight className="w-3 h-3 opacity-60" />}
                </button>
              </div>
            );
          })}
        </nav>

        {/* Logout */}
        <div className="px-3 py-4 border-t border-[#30363d]">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-[#f85149] hover:bg-[#f85149]/10 transition-colors"
            data-testid="btn-logout"
          >
            <LogOut className="w-4 h-4 flex-shrink-0" />
            Cerrar Sesión
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="h-14 bg-[#161b22] border-b border-[#30363d] flex items-center justify-between px-4 md:px-6 flex-shrink-0">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden text-[#8b949e] hover:text-white p-1"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-[#8b949e] font-mono">admin</span>
              <span className="text-[#30363d]">/</span>
              <span className="text-[#c9d1d9] font-semibold">{pageTitle}</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <a
              href="/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-[#8b949e] hover:text-[#58a6ff] transition-colors font-mono hidden sm:block"
            >
              ↗ Ver Sitio
            </a>
            <div className="w-7 h-7 rounded-full bg-[#238636] flex items-center justify-center">
              <span className="text-xs text-white font-bold">A</span>
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
