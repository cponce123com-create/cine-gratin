import { useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { logout } from "@/lib/auth";

interface NavItem {
  to: string;
  label: string;
  end?: boolean;
  icon: ReactNode;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

/** Navigation grouped by the tasks an administrator performs. */
const NAV_GROUPS: NavGroup[] = [
  {
    title: "Resumen",
    items: [
      {
        to: "/admin",
        end: true,
        label: "Panel general",
        icon: (
          <svg
            className="w-4 h-4 flex-shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <rect x="3" y="3" width="7" height="7" rx="1" strokeLinejoin="round" />
            <rect x="14" y="3" width="7" height="7" rx="1" strokeLinejoin="round" />
            <rect x="3" y="14" width="7" height="7" rx="1" strokeLinejoin="round" />
            <rect x="14" y="14" width="7" height="7" rx="1" strokeLinejoin="round" />
          </svg>
        ),
      },
    ],
  },
  {
    title: "Catálogo",
    items: [
      {
        to: "/admin/movies",
        label: "Películas",
        icon: (
          <svg
            className="w-4 h-4 flex-shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
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
          <svg
            className="w-4 h-4 flex-shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <rect x="2" y="7" width="20" height="15" rx="2" ry="2" />
            <polyline points="17 2 12 7 7 2" />
          </svg>
        ),
      },
      {
        to: "/admin/sagas",
        label: "Sagas",
        icon: (
          <svg
            className="w-4 h-4 flex-shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <path d="M12 2L2 7l10 5 10-5-10-5z" />
            <path d="M2 17l10 5 10-5" />
            <path d="M2 12l10 5 10-5" />
          </svg>
        ),
      },
    ],
  },
  {
    title: "Importar contenido",
    items: [
      {
        to: "/admin/import",
        label: "Importación masiva",
        icon: (
          <svg
            className="w-4 h-4 flex-shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <path
              d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <polyline points="7 10 12 15 17 10" strokeLinecap="round" strokeLinejoin="round" />
            <line x1="12" y1="15" x2="12" y2="3" strokeLinecap="round" />
          </svg>
        ),
      },
      {
        to: "/admin/tmdb",
        label: "Explorador TMDB",
        icon: (
          <svg
            className="w-4 h-4 flex-shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="8" strokeLinecap="round" strokeLinejoin="round" />
            <path d="m21 21-4.35-4.35" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ),
      },
    ],
  },
  {
    title: "Tareas y actividad",
    items: [
      {
        to: "/admin/vidsrc-scanner",
        label: "Escáner VIDSRC",
        icon: (
          <svg
            className="w-4 h-4 flex-shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="2" />
            <path d="M16.72 11a5 5 0 1 0 .28 1" />
            <path d="M5 12.55a11 11 0 0 1 14.08 0" />
            <path d="M1.42 9a16 16 0 0 1 21.16 0" />
          </svg>
        ),
      },
    ],
  },
  {
    title: "Configuración",
    items: [
      {
        to: "/admin/sport-channels",
        label: "Canales de deportes",
        icon: (
          <svg
            className="w-4 h-4 flex-shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
            <path d="M2 12h20" />
          </svg>
        ),
      },
      {
        to: "/admin/event-channels",
        label: "Canales de eventos",
        icon: (
          <svg
            className="w-4 h-4 flex-shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <path
              d="M9 18v3H5v-3M15 18v3h-4v-3M21 18v3h-4v-3M3 13h18M3 5h18"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ),
      },
    ],
  },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [menuOpen, setMenuOpen] = useState(false);

  // The drawer is closed whenever the route changes.
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  const handleLogout = async () => {
    await logout();
    queryClient.clear();
    navigate("/admin/login", { replace: true });
  };

  const navContent = (
    <>
      {NAV_GROUPS.map((group) => (
        <div key={group.title} className="mb-4">
          <p className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-600">
            {group.title}
          </p>
          <ul className="space-y-0.5">
            {group.items.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-brand-red ${
                      isActive
                        ? "bg-brand-red/15 text-white border border-brand-red/20"
                        : "text-gray-400 hover:text-white hover:bg-brand-surface border border-transparent"
                    }`
                  }
                >
                  {item.icon}
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </>
  );

  return (
    <div className="min-h-screen bg-brand-dark flex flex-col">
      {/* Top header */}
      <header className="bg-brand-card border-b border-brand-border sticky top-0 z-40 flex-shrink-0">
        <div className="h-14 px-4 sm:px-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              aria-expanded={menuOpen}
              aria-controls="admin-nav"
              aria-label={menuOpen ? "Cerrar menú" : "Abrir menú"}
              className="sm:hidden p-2 -ml-2 rounded-lg text-gray-300 hover:text-white hover:bg-brand-surface focus-visible:ring-2 focus-visible:ring-brand-red"
            >
              <svg
                className="w-5 h-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                {menuOpen ? (
                  <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
                ) : (
                  <path d="M3 6h18M3 12h18M3 18h18" strokeLinecap="round" />
                )}
              </svg>
            </button>

            <div className="flex items-center gap-2 min-w-0">
              <span className="text-brand-red font-black text-base tracking-tight">CINE</span>
              <span className="text-brand-gold font-black text-base tracking-tight">GRATIN</span>
            </div>
            <span className="text-brand-border text-sm select-none hidden sm:inline">/</span>
            <span className="text-gray-400 text-sm font-medium truncate">Admin</span>
          </div>

          <div className="flex items-center gap-2">
            <Link
              to="/"
              className="hidden sm:inline-flex items-center gap-1.5 text-gray-400 hover:text-white text-sm transition-colors focus-visible:ring-2 focus-visible:ring-brand-red rounded px-2 py-1"
            >
              <svg
                className="w-4 h-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <path d="m12 19-7-7 7-7M19 12H5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Ver el sitio
            </Link>
            <button
              type="button"
              onClick={handleLogout}
              className="flex items-center gap-1.5 text-gray-400 hover:text-white text-sm transition-colors focus-visible:ring-2 focus-visible:ring-brand-red rounded px-2 py-1"
            >
              <LogoutIcon />
              <span className="hidden sm:inline">Cerrar sesión</span>
            </button>
          </div>
        </div>
      </header>

      {/* Body */}
      <div className="flex flex-1 min-h-0">
        {/* Desktop sidebar */}
        <aside
          id="admin-nav"
          className={`w-60 flex-shrink-0 border-r border-brand-border flex-col py-4 overflow-y-auto ${
            menuOpen ? "fixed inset-y-14 left-0 z-30 bg-brand-dark block" : "hidden"
          } sm:flex sm:static sm:z-auto sm:bg-transparent`}
        >
          <nav aria-label="Secciones del panel" className="flex-1 px-2">
            {navContent}
          </nav>
          <div className="px-4 pt-4 border-t border-brand-border mt-2 sm:hidden">
            <Link to="/" className="text-xs text-gray-600 hover:text-gray-400 transition-colors">
              ← Volver al sitio
            </Link>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 min-w-0 overflow-y-auto">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">{children}</div>
        </main>
      </div>
    </div>
  );
}

function LogoutIcon() {
  return (
    <svg
      className="w-4 h-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points="16 17 21 12 16 7" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="21" y1="12" x2="9" y2="12" strokeLinecap="round" />
    </svg>
  );
}
