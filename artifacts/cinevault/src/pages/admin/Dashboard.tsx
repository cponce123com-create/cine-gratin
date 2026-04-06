import { useState, useEffect } from "react";
import { Film, Eye, Clock, TrendingUp, Activity, Database } from "lucide-react";
import { ActivityEntry, LocalMovie } from "@/lib/admin-db";
import { apiGetMovies } from "@/lib/api-client";

export function Dashboard() {
  const [movies, setMovies] = useState<LocalMovie[]>([]);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);

  useEffect(() => {
    apiGetMovies().then(setMovies).catch(() => {});
    // Activity is still local (session-based)
    try {
      const raw = localStorage.getItem("cinevault_activity");
      if (raw) setActivity(JSON.parse(raw));
    } catch { /* ignore */ }
  }, []);

  const mostViewed = [...movies].sort((a, b) => (b.views || 0) - (a.views || 0))[0];
  const lastAdded = movies[0];

  const stats = [
    {
      label: "Películas",
      value: movies.length,
      icon: Database,
      color: "#238636",
      bg: "rgba(35,134,54,0.1)",
    },
    {
      label: "Total Vistas",
      value: movies.reduce((acc, m) => acc + (m.views || 0), 0),
      icon: Eye,
      color: "#58a6ff",
      bg: "rgba(88,166,255,0.1)",
    },
    {
      label: "Más Vista",
      value: mostViewed ? mostViewed.title : "—",
      icon: TrendingUp,
      color: "#e3b341",
      bg: "rgba(227,179,65,0.1)",
      small: true,
    },
    {
      label: "Última Añadida",
      value: lastAdded ? lastAdded.title : "—",
      icon: Clock,
      color: "#a371f7",
      bg: "rgba(163,113,247,0.1)",
      small: true,
    },
  ];

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const diff = Math.floor((now.getTime() - d.getTime()) / 1000);
    if (diff < 60) return `hace ${diff}s`;
    if (diff < 3600) return `hace ${Math.floor(diff / 60)}m`;
    if (diff < 86400) return `hace ${Math.floor(diff / 3600)}h`;
    return d.toLocaleDateString("es");
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#c9d1d9] mb-1">Panel de Control</h1>
        <p className="text-[#8b949e] text-sm">Resumen del contenido de tu CineVault</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(stat => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.label}
              className="bg-[#161b22] border border-[#30363d] rounded-xl p-5"
            >
              <div className="flex items-start justify-between mb-3">
                <p className="text-[#8b949e] text-xs font-mono uppercase tracking-wider">{stat.label}</p>
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: stat.bg }}
                >
                  <Icon className="w-4 h-4" style={{ color: stat.color }} />
                </div>
              </div>
              <p
                className={`font-bold text-[#c9d1d9] leading-tight ${stat.small ? "text-base line-clamp-1" : "text-3xl"}`}
              >
                {stat.value}
              </p>
              {mostViewed && stat.label === "Más Vista" && (
                <p className="text-[#8b949e] text-xs mt-1 font-mono">{mostViewed.views || 0} vistas</p>
              )}
              {lastAdded && stat.label === "Última Añadida" && (
                <p className="text-[#8b949e] text-xs mt-1 font-mono">{lastAdded.year}</p>
              )}
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent activity */}
        <div className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-[#30363d] flex items-center gap-2">
            <Activity className="w-4 h-4 text-[#238636]" />
            <h2 className="font-bold text-[#c9d1d9] text-sm">Actividad Reciente</h2>
          </div>
          {activity.length === 0 ? (
            <div className="px-5 py-10 text-center text-[#8b949e] text-sm font-mono">Sin actividad aún</div>
          ) : (
            <div className="divide-y divide-[#21262d]">
              {activity.slice(0, 10).map(entry => (
                <div key={entry.id} className="px-5 py-3 flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full bg-[#238636] mt-1.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[#c9d1d9] text-sm font-medium truncate">{entry.action}</p>
                    <p className="text-[#8b949e] text-xs truncate">{entry.details}</p>
                  </div>
                  <span className="text-[#8b949e] text-xs font-mono flex-shrink-0">{formatTime(entry.timestamp)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Local movie list */}
        <div className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-[#30363d] flex items-center gap-2">
            <Eye className="w-4 h-4 text-[#58a6ff]" />
            <h2 className="font-bold text-[#c9d1d9] text-sm">Películas por Vistas</h2>
          </div>
          {movies.length === 0 ? (
            <div className="px-5 py-10 text-center text-[#8b949e] text-sm font-mono">Sin películas todavía</div>
          ) : (
            <div className="divide-y divide-[#21262d]">
              {[...movies].sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 8).map(movie => (
                <div key={movie.id} className="px-5 py-3 flex items-center gap-3">
                  {movie.poster_url ? (
                    <img src={movie.poster_url} alt={movie.title} className="w-8 h-11 object-cover rounded" />
                  ) : (
                    <div className="w-8 h-11 rounded bg-[#21262d] flex items-center justify-center">
                      <Film className="w-4 h-4 text-[#8b949e]" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-[#c9d1d9] text-sm font-medium truncate">{movie.title}</p>
                    <p className="text-[#8b949e] text-xs font-mono">{movie.year} · {movie.imdb_id}</p>
                  </div>
                  <span className="text-[#58a6ff] text-sm font-mono">{movie.views || 0}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
