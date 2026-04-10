import { NavLink, useNavigate } from "react-router-dom";
import { logout } from "@/lib/auth";
import type { ReactNode } from "react";

interface NavItem {
  to: string;
  label: string;
  end?: boolean;
  icon: ReactNode;
}

const NAV: NavItem[] = [
  {
    to: "/admin",
    end: true,
    label: "Dashboard",
    icon: (
      <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="7" height="7" rx="1" strokeLinejoin="round" />
        <rect x="14" y="3" width="7" height="7" rx="1" strokeLinejoin="round" />
        <rect x="3" y="14" width="7" height="7" rx="1" strokeLinejoin="round" />
        <rect x="14" y="14" width="7" height="7" rx="1" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    to: "/admin/movies",
    label: "Películas",
    icon: (
      <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18" />
        <line x1="7" y1="2" x2="7" y2="22" />
        <line x1="17" y1="2" x2="17" y2="22" />
        <line x1="2" y1="12" x2="22" y2="12" />
        <line x1="2" y1="7" x2="7" y2="7" />
        <line x1="2" y1="17" x2="7" y2="17" />
        <line x1="17" y1="17" x2="22" y2="17" />
        <line x1="17" y1="7" x2="22" y2="7" />
      </svg>
    ),
  },
  {
    to: "/admin/series",
    label: "Series",
    icon: (
      <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="2" y="7" width="20" height="15" rx="2" ry="2" />
        <polyline points="17 2 12 7 7 2" />
      </svg>
    ),
  },
  {
    to: "/admin/import",
    label: "Importación Masiva",
    icon: (
      <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" strokeLinecap="round" strokeLinejoin="round" />
        <polyline points="7 10 12 15 17 10" strokeLinecap="round" strokeLinejoin="round" />
        <line x1="12" y1="15" x2="12" y2="3" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    to: "/admin/sagas",
    label: "Sagas",
    icon: (
      <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    to: "/admin/tmdb",
    label: "Explorador TMDB",
    icon: (
      <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="11" cy="11" r="8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="m21 21-4.35-4.35" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    to: "/admin/vidsrc-scanner",
    label: "Escáner VIDSRC",
    icon: (
      <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="2" /><path d="M16.72 11a5 5 0 1 0 .28 1" />
        <path d="M5 12.55a11 11 0 0 1 14.08 0" /><path d="M1.42 9a16 16 0 0 1 21.16 0" />
      </svg>
    ),
  },
  {
    to: "/admin/sport-channels",
    label: "⚽ Deportes",
    icon: (
      <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
        <path d="M2 12h20" />
      </svg>
    ),
  },
  {
    to: "/admin/event-channels",
    label: "🎵 Eventos",
    icon: (
      <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M9 18v3H5v-3M15 18v3h-4v-3M21 18v3h-4v-3M3 13h18M3 5h18" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/admin/login", { replace: true });
  };

  return (
    <div className="min-h-screen bg-brand-dark flex flex-col">
      {/* Top header */}
      <header className="bg-brand-card border-b border-brand-border sticky top-0 z-40 flex-shrink-0">
        <div className="h-14 px-4 sm:px-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-0.5">
              <span className="text-brand-red font-black text-base tracking-tight">CINE</span>
              <span className="text-brand-gold font-black text-base tracking-tight">GRATIN</span>
            </div>
            <span className="text-brand-border text-sm select-none">/</span>
            <span className="text-gray-400 text-sm font-medium">Admin</span>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 text-gray-400 hover:text-white text-sm transition-colors"
          >
            <LogoutIcon />
            <span className="hidden sm:inline">Cerrar sesión</span>
          </button>
        </div>
      </header>

      {/* Body */}
      <div className="flex flex-1 min-h-0">
        {/* Desktop sidebar */}
        <aside className="w-52 flex-shrink-0 border-r border-brand-border hidden sm:flex flex-col py-4">
          <nav className="flex-1 px-2 space-y-0.5">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-brand-red/15 text-white border border-brand-red/20"
                      : "text-gray-400 hover:text-white hover:bg-brand-surface"
                  }`
                }
              >
                {item.icon}
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="px-4 pt-4 border-t border-brand-border mt-2">
            <a href="/" className="text-xs text-gray-600 hover:text-gray-400 transition-colors">
              ← Volver al sitio
            </a>
          </div>
        </aside>

        {/* Mobile nav strip */}
        <div className="sm:hidden fixed bottom-0 inset-x-0 bg-brand-card border-t border-brand-border z-40 flex">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex-1 flex flex-col items-center gap-1 py-2.5 text-xs font-medium transition-colors ${
                  isActive ? "text-white" : "text-gray-500"
                }`
              }
            >
              {item.icon}
              <span className="truncate w-full text-center px-1">{item.label}</span>
            </NavLink>
          ))}
        </div>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto pb-20 sm:pb-0">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

function LogoutIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points="16 17 21 12 16 7" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="21" y1="12" x2="9" y2="12" strokeLinecap="round" />
    </svg>
  );
}
