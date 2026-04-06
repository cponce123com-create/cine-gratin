import { useState, useEffect } from "react";
import { Film, Eye, TrendingUp, Activity, Database, Tv, Star, RefreshCw, Download, ToggleLeft, ToggleRight, Zap, CheckCircle, XCircle, Clock } from "lucide-react";
import { ActivityEntry, LocalMovie } from "@/lib/admin-db";
import { apiGetMovies, apiGetSeries, apiGetAutoImportStatus, apiToggleAutoImport, apiRunAutoImport, type LocalSeries, type AutoImportStatus } from "@/lib/api-client";

export function Dashboard() {
  const [movies, setMovies] = useState<LocalMovie[]>([]);
  const [series, setSeries] = useState<LocalSeries[]>([]);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [autoImportStatus, setAutoImportStatus] = useState<AutoImportStatus | null>(null);
  const [autoImportRunning, setAutoImportRunning] = useState(false);

  const loadAutoImport = () => {
    apiGetAutoImportStatus().then(setAutoImportStatus).catch(() => {});
  };

  const handleToggleAutoImport = async () => {
    if (!autoImportStatus) return;
    const newEnabled = !autoImportStatus.enabled;
    await apiToggleAutoImport(newEnabled).catch(() => {});
    setAutoImportStatus(prev => prev ? { ...prev, enabled: newEnabled } : prev);
  };

  const handleRunAutoImport = async () => {
    setAutoImportRunning(true);
    try {
      await apiRunAutoImport();
      await loadAutoImport();
    } catch { /* ignore */ }
    setAutoImportRunning(false);
  };

  const load = () => {
    setLoading(true);
    Promise.all([
      apiGetMovies().catch(() => [] as LocalMovie[]),
      apiGetSeries().catch(() => [] as LocalSeries[]),
    ]).then(([m, s]) => {
      setMovies(m);
      setSeries(s);
      setLastRefresh(new Date());
    }).finally(() => setLoading(false));

    try {
      const raw = localStorage.getItem("cinevault_activity");
      if (raw) setActivity(JSON.parse(raw));
    } catch { /* ignore */ }
  };

  useEffect(() => { load(); loadAutoImport(); }, []);

  const totalMovieViews = movies.reduce((acc, m) => acc + (m.views || 0), 0);
  const totalSeriesViews = series.reduce((acc, s) => acc + (s.views || 0), 0);
  const mostViewedMovie = [...movies].sort((a, b) => (b.views || 0) - (a.views || 0))[0];
  const mostViewedSeries = [...series].sort((a, b) => (b.views || 0) - (a.views || 0))[0];
  const totalContent = movies.length + series.length;

  const stats = [
    {
      label: "Total Contenido",
      value: totalContent,
      subtitle: `${movies.length} películas · ${series.length} series`,
      icon: Database,
      color: "#238636",
      bg: "rgba(35,134,54,0.1)",
    },
    {
      label: "Total Vistas",
      value: (totalMovieViews + totalSeriesViews).toLocaleString("es"),
      subtitle: `${totalMovieViews} películas · ${totalSeriesViews} series`,
      icon: Eye,
      color: "#58a6ff",
      bg: "rgba(88,166,255,0.1)",
    },
    {
      label: "Película Más Vista",
      value: mostViewedMovie?.title ?? "—",
      subtitle: mostViewedMovie ? `${mostViewedMovie.views || 0} vistas · ${mostViewedMovie.year}` : "Sin datos",
      icon: TrendingUp,
      color: "#e3b341",
      bg: "rgba(227,179,65,0.1)",
      small: true,
    },
    {
      label: "Serie Más Vista",
      value: mostViewedSeries?.title ?? "—",
      subtitle: mostViewedSeries ? `${mostViewedSeries.views || 0} vistas · ${mostViewedSeries.year}` : "Sin datos",
      icon: Tv,
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

  const topMovies = [...movies].sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 8);
  const topSeries = [...series].sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 5);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#c9d1d9] mb-1">Panel de Control</h1>
          <p className="text-[#8b949e] text-sm">
            Cine Gratín · Actualizado: {lastRefresh.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" })}
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 bg-[#21262d] border border-[#30363d] text-[#8b949e] hover:text-[#c9d1d9] px-4 py-2 rounded-lg text-sm font-bold transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          Actualizar
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(stat => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="bg-[#161b22] border border-[#30363d] rounded-xl p-5">
              <div className="flex items-start justify-between mb-3">
                <p className="text-[#8b949e] text-xs font-mono uppercase tracking-wider">{stat.label}</p>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: stat.bg }}>
                  <Icon className="w-4 h-4" style={{ color: stat.color }} />
                </div>
              </div>
              <p className={`font-bold text-[#c9d1d9] leading-tight ${stat.small ? "text-base line-clamp-1" : "text-3xl"}`}>
                {stat.value}
              </p>
              <p className="text-[#8b949e] text-xs mt-1 font-mono truncate">{stat.subtitle}</p>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top movies by views */}
        <div className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-[#30363d] flex items-center gap-2">
            <Film className="w-4 h-4" style={{ color: "#e3b341" }} />
            <h2 className="font-bold text-[#c9d1d9] text-sm">Películas por Vistas</h2>
            <span className="ml-auto text-[#8b949e] text-xs font-mono">{movies.length} total</span>
          </div>
          {topMovies.length === 0 ? (
            <div className="px-5 py-10 text-center text-[#8b949e] text-sm font-mono">Sin películas todavía</div>
          ) : (
            <div className="divide-y divide-[#21262d]">
              {topMovies.map((movie, i) => (
                <div key={movie.id} className="px-5 py-3 flex items-center gap-3">
                  <span className="text-[#8b949e] text-xs font-mono w-5 text-center flex-shrink-0">{i + 1}</span>
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
                  <div className="flex items-center gap-1 text-[#58a6ff] text-sm font-mono flex-shrink-0">
                    <Eye className="w-3 h-3" />
                    {(movie.views || 0).toLocaleString("es")}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right column: Series + Activity */}
        <div className="space-y-6">
          {/* Top series */}
          <div className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-[#30363d] flex items-center gap-2">
              <Tv className="w-4 h-4" style={{ color: "#a371f7" }} />
              <h2 className="font-bold text-[#c9d1d9] text-sm">Series por Vistas</h2>
              <span className="ml-auto text-[#8b949e] text-xs font-mono">{series.length} total</span>
            </div>
            {topSeries.length === 0 ? (
              <div className="px-5 py-8 text-center text-[#8b949e] text-sm font-mono">Sin series todavía</div>
            ) : (
              <div className="divide-y divide-[#21262d]">
                {topSeries.map((s, i) => (
                  <div key={s.id} className="px-5 py-3 flex items-center gap-3">
                    <span className="text-[#8b949e] text-xs font-mono w-5 text-center flex-shrink-0">{i + 1}</span>
                    {s.poster_url ? (
                      <img src={s.poster_url} alt={s.title} className="w-8 h-11 object-cover rounded" />
                    ) : (
                      <div className="w-8 h-11 rounded bg-[#21262d] flex items-center justify-center">
                        <Tv className="w-4 h-4 text-[#8b949e]" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-[#c9d1d9] text-sm font-medium truncate">{s.title}</p>
                      <p className="text-[#8b949e] text-xs font-mono">{s.year} · {s.total_seasons} temp.</p>
                    </div>
                    <div className="flex items-center gap-1 text-[#a371f7] text-sm font-mono flex-shrink-0">
                      <Eye className="w-3 h-3" />
                      {(s.views || 0).toLocaleString("es")}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent ratings overview */}
          <div className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-[#30363d] flex items-center gap-2">
              <Star className="w-4 h-4 text-[#e3b341]" />
              <h2 className="font-bold text-[#c9d1d9] text-sm">Resumen del Catálogo</h2>
            </div>
            <div className="p-5 space-y-3">
              {[
                { label: "Promedio rating películas", value: movies.length ? (movies.reduce((a, m) => a + (m.rating || 0), 0) / movies.filter(m => m.rating > 0).length || 0).toFixed(1) : "—" },
                { label: "Promedio rating series", value: series.length ? (series.filter(s => s.rating > 0).reduce((a, s) => a + s.rating, 0) / (series.filter(s => s.rating > 0).length || 1)).toFixed(1) : "—" },
                { label: "Series destacadas", value: series.filter(s => s.featured).length },
                { label: "Películas destacadas", value: movies.filter(m => m.featured).length },
                { label: "Actividad reciente", value: activity.length ? `${activity.length} acciones` : "Sin datos" },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-center justify-between gap-4">
                  <span className="text-[#8b949e] text-xs font-mono">{label}</span>
                  <span className="text-[#c9d1d9] text-sm font-bold">{value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Recent activity */}
      {activity.length > 0 && (
        <div className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-[#30363d] flex items-center gap-2">
            <Activity className="w-4 h-4 text-[#238636]" />
            <h2 className="font-bold text-[#c9d1d9] text-sm">Actividad Reciente</h2>
          </div>
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
        </div>
      )}

      {/* Auto-import section */}
      <div className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[#30363d] flex items-center gap-2">
          <Download className="w-4 h-4 text-[#58a6ff]" />
          <h2 className="font-bold text-[#c9d1d9] text-sm">Auto-importación desde TMDB</h2>
        </div>
        <div className="p-5 space-y-4">
          {/* Toggle + Run now */}
          <div className="flex flex-wrap items-center gap-4">
            <button
              onClick={handleToggleAutoImport}
              disabled={!autoImportStatus}
              className="flex items-center gap-2 text-sm font-bold transition-colors disabled:opacity-50"
            >
              {autoImportStatus?.enabled
                ? <ToggleRight className="w-6 h-6 text-[#238636]" />
                : <ToggleLeft className="w-6 h-6 text-[#8b949e]" />
              }
              <span className={autoImportStatus?.enabled ? "text-[#238636]" : "text-[#8b949e]"}>
                {autoImportStatus?.enabled ? "Activado" : "Desactivado"}
              </span>
            </button>

            <button
              onClick={handleRunAutoImport}
              disabled={autoImportRunning}
              className="flex items-center gap-2 bg-[#1f6feb]/10 border border-[#1f6feb]/30 text-[#58a6ff] hover:bg-[#1f6feb]/20 px-4 py-2 rounded-lg text-sm font-bold transition-colors disabled:opacity-50"
            >
              <Zap className={`w-4 h-4 ${autoImportRunning ? "animate-pulse" : ""}`} />
              {autoImportRunning ? "Importando..." : "Ejecutar ahora"}
            </button>

            <span className="text-[#484f58] text-xs font-mono">Cron: diario a las 03:00</span>
          </div>

          {/* Log of last runs */}
          {autoImportStatus && autoImportStatus.logs.length > 0 ? (
            <div className="space-y-1.5">
              <p className="text-[#8b949e] text-xs font-bold uppercase tracking-wider mb-2">Últimas ejecuciones</p>
              {autoImportStatus.logs.map(log => (
                <div key={log.id} className="flex items-start gap-3 text-xs font-mono bg-[#0d1117] rounded-lg px-3 py-2.5">
                  <div className="flex-shrink-0 mt-0.5">
                    {log.status === "success"
                      ? <CheckCircle className="w-3.5 h-3.5 text-[#238636]" />
                      : <XCircle className="w-3.5 h-3.5 text-[#f85149]" />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap gap-3 text-[#c9d1d9]">
                      <span className="text-[#58a6ff]">+{log.movies_imported} películas</span>
                      <span className="text-[#a371f7]">+{log.series_imported} series</span>
                      <span className="text-[#8b949e]">{log.total_checked} revisados</span>
                    </div>
                    {log.error_message && (
                      <p className="text-[#f85149] truncate mt-0.5">{log.error_message}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 text-[#484f58] flex-shrink-0">
                    <Clock className="w-3 h-3" />
                    <span>{new Date(log.run_at).toLocaleString("es", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : autoImportStatus && autoImportStatus.logs.length === 0 ? (
            <p className="text-[#484f58] text-xs font-mono">Sin ejecuciones aún. Haz click en "Ejecutar ahora" para empezar.</p>
          ) : (
            <p className="text-[#484f58] text-xs font-mono">Cargando...</p>
          )}
        </div>
      </div>
    </div>
  );
}
