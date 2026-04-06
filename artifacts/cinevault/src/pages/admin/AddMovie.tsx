import { useState, useEffect } from "react";
import {
  Plus, Trash2, X, Loader2, Search, TestTube,
  ChevronUp, ChevronDown, CheckCircle2, Film, Star,
  Calendar, Clock, Globe, ChevronLeft, ChevronRight,
} from "lucide-react";
import {
  uid,
  LocalMovie,
  VideoSource,
  LocalTorrent,
} from "@/lib/admin-db";
import { apiSaveMovie, apiGetMovie, apiGetServers, DEFAULT_SERVERS } from "@/lib/api-client";
import { toast } from "sonner";

interface AddMovieProps {
  editId?: string | null;
  onSaved: () => void;
}

interface TmdbResult {
  imdb_id: string;
  tmdb_id: number;
  title: string;
  original_title: string;
  year: number;
  release_date: string;
  rating: number;
  vote_count: number;
  runtime: number;
  synopsis: string;
  tagline: string;
  genres: string[];
  language: string;
  spoken_languages: string[];
  director: string;
  cast: { name: string; character: string; profile: string | null }[];
  poster_url: string;
  poster_original: string;
  background_url: string;
  extra_backdrops: string[];
  extra_posters: string[];
  yt_trailer_code: string;
  mpa_rating: string;
  budget: number;
  revenue: number;
  production_companies: string[];
  homepage: string;
}

const EMPTY_MOVIE: Omit<LocalMovie, "id"> = {
  date_added: "",
  views: 0,
  imdb_id: "",
  title: "",
  year: new Date().getFullYear(),
  rating: 0,
  runtime: 0,
  genres: [],
  language: "es",
  synopsis: "",
  director: "",
  cast_list: [],
  poster_url: "",
  background_url: "",
  yt_trailer_code: "",
  mpa_rating: "NR",
  slug: "",
  featured: false,
  video_sources: [],
  torrents: [],
};

const QUALITIES = ["720p", "1080p", "2160p", "3D"];
const SOURCES = ["BluRay", "WEB", "WEBRip", "HDTS", "CAM"];
const MPA_RATINGS = ["G", "PG", "PG-13", "R", "NC-17", "NR"];

export function AddMovie({ editId, onSaved }: AddMovieProps) {
  const [tab, setTab] = useState<"import" | "manual">("import");
  const [form, setForm] = useState({ ...EMPTY_MOVIE });
  const [genreInput, setGenreInput] = useState("");
  const [castInput, setCastInput] = useState("");
  const [imdbQuery, setImdbQuery] = useState("");
  const [fetching, setFetching] = useState(false);
  const [testEmbedUrl, setTestEmbedUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [tmdbData, setTmdbData] = useState<TmdbResult | null>(null);
  const [selectedPoster, setSelectedPoster] = useState(0);
  const [selectedBackdrop, setSelectedBackdrop] = useState(0);

  useEffect(() => {
    if (editId) {
      apiGetMovie(editId).then(existing => {
        if (existing) {
          setForm({ ...existing });
          setGenreInput(existing.genres.join(", "));
          setCastInput(existing.cast_list.join("\n"));
          setTab("manual");
        }
      }).catch(() => {});
    }
  }, [editId]);

  const update = (patch: Partial<typeof form>) => setForm(prev => ({ ...prev, ...patch }));

  // ─── TMDB Import ─────────────────────────────────────────────

  const extractImdbId = (q: string): string | null => {
    if (/^tt\d+$/.test(q.trim())) return q.trim();
    const match = q.match(/tt\d+/);
    return match ? match[0] : null;
  };

  const fetchFromTmdb = async () => {
    const imdbId = extractImdbId(imdbQuery.trim());
    if (!imdbId) {
      toast.error("Ingresa un ID de IMDb válido (ej. tt0111161)");
      return;
    }

    setFetching(true);
    setTmdbData(null);

    try {
      const res = await fetch(`/api/tmdb/movie/${imdbId}`);
      const data = await res.json() as TmdbResult & { error?: string };

      if (!res.ok || data.error) {
        toast.error(data.error || "Error al importar desde TMDB");
        setFetching(false);
        return;
      }

      setTmdbData(data);
      setSelectedPoster(0);
      setSelectedBackdrop(0);

      // Auto-fill form
      const allPosters = [data.poster_url, ...data.extra_posters].filter(Boolean);
      const allBackdrops = [data.background_url, ...data.extra_backdrops].filter(Boolean);

      // Build video sources from DB servers or defaults
      const dbServers = await apiGetServers().catch(() => DEFAULT_SERVERS);
      const activeServers = dbServers.filter(s => s.active).sort((a, b) => a.order - b.order);
      const sources = activeServers.map(s => ({
        id: uid(),
        name: s.name,
        url: s.url_pattern.replace("{IMDB_ID}", imdbId),
        active: true,
      }));

      update({
        imdb_id: data.imdb_id,
        title: data.title,
        year: data.year,
        rating: data.rating,
        runtime: data.runtime,
        genres: data.genres,
        language: data.language,
        synopsis: data.synopsis,
        director: data.director,
        cast_list: data.cast.map(c => c.name),
        poster_url: allPosters[0] || "",
        background_url: allBackdrops[0] || "",
        yt_trailer_code: data.yt_trailer_code,
        mpa_rating: data.mpa_rating || "NR",
        slug: data.title.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        video_sources: sources,
      });
      setGenreInput(data.genres.join(", "));
      setCastInput(data.cast.map(c => c.name).join("\n"));

      toast.success(`¡Importado! ${data.title} (${data.year})`);
      setTab("manual");
    } catch {
      toast.error("Error de conexión. Verifica tu clave TMDB_API_KEY.");
    }
    setFetching(false);
  };

  // ─── Image selectors ─────────────────────────────────────────

  const allPosters = tmdbData ? [tmdbData.poster_url, ...tmdbData.extra_posters].filter(Boolean) : [];
  const allBackdrops = tmdbData ? [tmdbData.background_url, ...tmdbData.extra_backdrops].filter(Boolean) : [];

  const selectPoster = (idx: number) => {
    setSelectedPoster(idx);
    update({ poster_url: allPosters[idx] });
  };

  const selectBackdrop = (idx: number) => {
    setSelectedBackdrop(idx);
    update({ background_url: allBackdrops[idx] });
  };

  // ─── Video Sources ────────────────────────────────────────────

  const addSource = () => {
    update({ video_sources: [...form.video_sources, { id: uid(), name: "Servidor Personalizado", url: "", active: true }] });
  };

  const updateSource = (id: string, patch: Partial<VideoSource>) => {
    update({ video_sources: form.video_sources.map(s => s.id === id ? { ...s, ...patch } : s) });
  };

  const removeSource = (id: string) => {
    update({ video_sources: form.video_sources.filter(s => s.id !== id) });
  };

  const moveSource = (idx: number, dir: -1 | 1) => {
    const list = [...form.video_sources];
    const target = idx + dir;
    if (target < 0 || target >= list.length) return;
    [list[idx], list[target]] = [list[target], list[idx]];
    update({ video_sources: list });
  };

  // ─── Torrents ─────────────────────────────────────────────────

  const addTorrent = () => {
    update({ torrents: [...form.torrents, { id: uid(), quality: "1080p", source: "BluRay", size: "", url: "" }] });
  };

  const updateTorrent = (id: string, patch: Partial<LocalTorrent>) => {
    update({ torrents: form.torrents.map(t => t.id === id ? { ...t, ...patch } : t) });
  };

  const removeTorrent = (id: string) => {
    update({ torrents: form.torrents.filter(t => t.id !== id) });
  };

  // ─── Save ─────────────────────────────────────────────────────

  const handleSave = async (preview = false) => {
    if (!form.title || !form.imdb_id) {
      toast.error("El título y el ID de IMDb son requeridos");
      return;
    }
    setSaving(true);

    const genres = genreInput.split(",").map(g => g.trim()).filter(Boolean);
    const cast_list = castInput.split("\n").map(c => c.trim()).filter(Boolean);
    const slug = form.slug || form.title.toLowerCase().replace(/[^a-z0-9]+/g, "-");

    const movie: LocalMovie = {
      ...form,
      id: editId || form.imdb_id,
      genres,
      cast_list,
      slug,
      date_added: form.date_added || new Date().toISOString(),
      views: form.views || 0,
    };

    try {
      await apiSaveMovie(movie);
      toast.success(editId ? "¡Película actualizada!" : "¡Película guardada!");
      if (preview) window.open(`/movie/${movie.id}`, "_blank");
      onSaved();
    } catch {
      toast.error("Error al guardar la película");
    }
    setSaving(false);
  };

  const InputField = ({ label, value, onChange, placeholder, type = "text", mono = false }: {
    label: string; value: string; onChange: (v: string) => void;
    placeholder?: string; type?: string; mono?: boolean;
  }) => (
    <div>
      <label className="block text-[#8b949e] text-xs font-mono uppercase tracking-wider mb-1.5">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full bg-[#0d1117] border border-[#30363d] focus:border-[#238636] text-[#c9d1d9] rounded-lg px-3 py-2.5 text-sm outline-none placeholder:text-[#484f58] ${mono ? "font-mono" : ""}`}
      />
    </div>
  );

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-[#c9d1d9] mb-1">
          {editId ? "Editar Película" : "Agregar Película"}
        </h1>
        <p className="text-[#8b949e] text-sm">
          {editId ? "Actualizar datos de la película" : "Importa todos los datos automáticamente con el ID de IMDb"}
        </p>
      </div>

      {/* Tabs */}
      {!editId && (
        <div className="flex border-b border-[#30363d]">
          {(["import", "manual"] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-6 py-3 text-sm font-bold uppercase tracking-wider transition-colors ${
                tab === t
                  ? "text-[#3fb950] border-b-2 border-[#238636]"
                  : "text-[#8b949e] hover:text-[#c9d1d9]"
              }`}
            >
              {t === "import" ? "Importar por IMDb / TMDB" : "Agregar Manualmente"}
            </button>
          ))}
        </div>
      )}

      {/* ─── Import Tab ─────────────────────────────────────── */}
      {tab === "import" && !editId && (
        <div className="space-y-4">
          <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-6 space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-5 h-5 rounded bg-[#238636]/20 flex items-center justify-center">
                <Search className="w-3 h-3 text-[#3fb950]" />
              </div>
              <h2 className="text-[#c9d1d9] font-bold text-sm">Importar datos automáticamente</h2>
            </div>
            <p className="text-[#8b949e] text-xs">
              Ingresa el ID de IMDb y se importarán: título, sinopsis, póster, fondo, tráiler de YouTube, reparto, director, géneros, puntuación y más.
            </p>

            <div className="flex gap-3">
              <div className="flex-1 relative">
                <Film className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8b949e]" />
                <input
                  value={imdbQuery}
                  onChange={e => setImdbQuery(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && fetchFromTmdb()}
                  placeholder="ID de IMDb  (ej. tt0111161)"
                  className="w-full bg-[#0d1117] border border-[#30363d] focus:border-[#238636] text-[#c9d1d9] rounded-lg pl-10 pr-4 py-3 text-sm font-mono outline-none placeholder:text-[#484f58]"
                  data-testid="input-imdb-query"
                  autoFocus
                />
              </div>
              <button
                onClick={fetchFromTmdb}
                disabled={fetching || !imdbQuery.trim()}
                className="flex items-center gap-2 bg-[#238636] hover:bg-[#2ea043] disabled:opacity-50 disabled:cursor-not-allowed text-white px-5 py-3 rounded-lg text-sm font-bold transition-colors whitespace-nowrap"
                data-testid="btn-fetch-movie"
              >
                {fetching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                {fetching ? "Importando..." : "Importar"}
              </button>
            </div>

            <p className="text-[#484f58] text-xs font-mono">
              Ejemplos: <span className="text-[#58a6ff] cursor-pointer hover:underline" onClick={() => setImdbQuery("tt0111161")}>tt0111161</span> · <span className="text-[#58a6ff] cursor-pointer hover:underline" onClick={() => setImdbQuery("tt0068646")}>tt0068646</span> · <span className="text-[#58a6ff] cursor-pointer hover:underline" onClick={() => setImdbQuery("tt0816692")}>tt0816692</span>
            </p>
          </div>

          {/* TMDB preview card after successful fetch */}
          {tmdbData && (
            <div className="bg-[#161b22] border border-[#238636]/40 rounded-xl overflow-hidden">
              {/* Hero backdrop */}
              {tmdbData.background_url && (
                <div className="relative h-40 overflow-hidden">
                  <img
                    src={form.background_url || tmdbData.background_url}
                    alt="Backdrop"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#161b22] via-[#161b22]/50 to-transparent" />
                  <div className="absolute bottom-0 left-0 right-0 px-5 pb-3 flex items-end gap-4">
                    {tmdbData.poster_url && (
                      <img
                        src={form.poster_url || tmdbData.poster_url}
                        alt={tmdbData.title}
                        className="w-16 h-24 object-cover rounded-lg border-2 border-[#238636]/50 flex-shrink-0 shadow-xl"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <h3 className="text-white font-bold text-lg leading-tight line-clamp-1">{tmdbData.title}</h3>
                      <div className="flex items-center gap-3 mt-1 flex-wrap">
                        <span className="flex items-center gap-1 text-yellow-400 text-xs font-mono">
                          <Star className="w-3 h-3 fill-current" />{tmdbData.rating}
                          <span className="text-[#8b949e]">({tmdbData.vote_count?.toLocaleString()})</span>
                        </span>
                        <span className="flex items-center gap-1 text-[#8b949e] text-xs">
                          <Calendar className="w-3 h-3" />{tmdbData.year}
                        </span>
                        <span className="flex items-center gap-1 text-[#8b949e] text-xs">
                          <Clock className="w-3 h-3" />{tmdbData.runtime} min
                        </span>
                        {tmdbData.director && (
                          <span className="text-[#8b949e] text-xs">Dir. {tmdbData.director}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 bg-[#238636] text-white text-xs font-bold px-3 py-1.5 rounded-lg flex-shrink-0">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Importado
                    </div>
                  </div>
                </div>
              )}

              <div className="p-5 space-y-5">
                {/* Synopsis */}
                {tmdbData.synopsis && (
                  <div>
                    <p className="text-[#8b949e] text-[10px] font-mono uppercase tracking-wider mb-1.5">Sinopsis</p>
                    <p className="text-[#c9d1d9] text-sm leading-relaxed line-clamp-3">{tmdbData.synopsis}</p>
                  </div>
                )}

                {/* Genres */}
                {tmdbData.genres.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {tmdbData.genres.map(g => (
                      <span key={g} className="text-xs bg-[#21262d] text-[#8b949e] px-2.5 py-1 rounded-full border border-[#30363d]">{g}</span>
                    ))}
                  </div>
                )}

                {/* Poster selector */}
                {allPosters.length > 1 && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[#8b949e] text-[10px] font-mono uppercase tracking-wider">Elige Póster ({allPosters.length} opciones)</p>
                      <div className="flex gap-1">
                        <button onClick={() => selectPoster(Math.max(0, selectedPoster - 1))} disabled={selectedPoster === 0} className="p-0.5 text-[#8b949e] hover:text-white disabled:opacity-30">
                          <ChevronLeft className="w-4 h-4" />
                        </button>
                        <span className="text-xs text-[#8b949e] font-mono px-1">{selectedPoster + 1}/{allPosters.length}</span>
                        <button onClick={() => selectPoster(Math.min(allPosters.length - 1, selectedPoster + 1))} disabled={selectedPoster === allPosters.length - 1} className="p-0.5 text-[#8b949e] hover:text-white disabled:opacity-30">
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {allPosters.slice(0, 8).map((p, i) => (
                        <button
                          key={i}
                          onClick={() => selectPoster(i)}
                          className={`flex-shrink-0 rounded-lg overflow-hidden border-2 transition-all ${selectedPoster === i ? "border-[#238636] scale-105" : "border-[#30363d] opacity-60 hover:opacity-80"}`}
                        >
                          <img src={p} alt={`Póster ${i + 1}`} className="h-24 w-16 object-cover" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Backdrop selector */}
                {allBackdrops.length > 1 && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[#8b949e] text-[10px] font-mono uppercase tracking-wider">Elige Fondo ({allBackdrops.length} opciones)</p>
                      <div className="flex gap-1">
                        <button onClick={() => selectBackdrop(Math.max(0, selectedBackdrop - 1))} disabled={selectedBackdrop === 0} className="p-0.5 text-[#8b949e] hover:text-white disabled:opacity-30">
                          <ChevronLeft className="w-4 h-4" />
                        </button>
                        <span className="text-xs text-[#8b949e] font-mono px-1">{selectedBackdrop + 1}/{allBackdrops.length}</span>
                        <button onClick={() => selectBackdrop(Math.min(allBackdrops.length - 1, selectedBackdrop + 1))} disabled={selectedBackdrop === allBackdrops.length - 1} className="p-0.5 text-[#8b949e] hover:text-white disabled:opacity-30">
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {allBackdrops.slice(0, 6).map((b, i) => (
                        <button
                          key={i}
                          onClick={() => selectBackdrop(i)}
                          className={`flex-shrink-0 rounded-lg overflow-hidden border-2 transition-all ${selectedBackdrop === i ? "border-[#238636] scale-105" : "border-[#30363d] opacity-60 hover:opacity-80"}`}
                        >
                          <img src={b} alt={`Fondo ${i + 1}`} className="h-16 w-28 object-cover" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Trailer */}
                {tmdbData.yt_trailer_code && (
                  <div className="flex items-center gap-3 bg-[#0d1117] rounded-lg px-4 py-3 border border-[#30363d]">
                    <div className="w-8 h-8 bg-red-600 rounded-lg flex items-center justify-center flex-shrink-0">
                      <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[#c9d1d9] text-sm font-medium">Tráiler de YouTube</p>
                      <p className="text-[#8b949e] text-xs font-mono truncate">{tmdbData.yt_trailer_code}</p>
                    </div>
                    <a
                      href={`https://youtube.com/watch?v=${tmdbData.yt_trailer_code}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#58a6ff] text-xs hover:underline flex-shrink-0"
                    >
                      Ver
                    </a>
                  </div>
                )}

                {/* Cast */}
                {tmdbData.cast.length > 0 && (
                  <div>
                    <p className="text-[#8b949e] text-[10px] font-mono uppercase tracking-wider mb-2">Reparto Principal</p>
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {tmdbData.cast.slice(0, 10).map(c => (
                        <div key={c.name} className="flex-shrink-0 text-center w-14">
                          {c.profile ? (
                            <img src={c.profile} alt={c.name} className="w-14 h-14 rounded-full object-cover border border-[#30363d] mb-1" />
                          ) : (
                            <div className="w-14 h-14 rounded-full bg-[#21262d] flex items-center justify-center border border-[#30363d] mb-1">
                              <span className="text-[#8b949e] text-lg font-bold">{c.name[0]}</span>
                            </div>
                          )}
                          <p className="text-[#c9d1d9] text-[9px] font-medium leading-tight line-clamp-2">{c.name}</p>
                          <p className="text-[#8b949e] text-[8px] leading-tight line-clamp-1 mt-0.5">{c.character}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Language / companies */}
                <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs">
                  {tmdbData.language && (
                    <span className="flex items-center gap-1 text-[#8b949e]">
                      <Globe className="w-3 h-3" /> {tmdbData.language.toUpperCase()}
                    </span>
                  )}
                  {tmdbData.production_companies.slice(0, 3).map(c => (
                    <span key={c} className="text-[#484f58]">{c}</span>
                  ))}
                </div>

                {/* Action buttons */}
                <div className="flex gap-3 pt-1">
                  <button
                    onClick={() => setTab("manual")}
                    className="flex-1 bg-[#238636] hover:bg-[#2ea043] text-white py-3 rounded-lg font-bold text-sm transition-colors"
                    data-testid="btn-confirm-import"
                  >
                    Continuar y Editar →
                  </button>
                  <button
                    onClick={() => handleSave(false)}
                    disabled={saving}
                    className="flex items-center gap-2 bg-[#21262d] hover:bg-[#30363d] text-[#c9d1d9] px-5 py-3 rounded-lg font-bold text-sm transition-colors border border-[#30363d]"
                    data-testid="btn-save-movie"
                  >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                    Guardar Directo
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── Manual / Edit form ──────────────────────────────── */}
      {(tab === "manual" || editId) && (
        <div className="space-y-6">
          {/* Core Info */}
          <section className="bg-[#161b22] border border-[#30363d] rounded-xl p-6 space-y-4">
            <h2 className="text-[#c9d1d9] font-bold text-sm border-b border-[#30363d] pb-3">Información Básica</h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <InputField label="Título *" value={form.title} onChange={v => update({ title: v })} placeholder="Título de la película" />
              </div>
              <InputField label="ID de IMDb *" value={form.imdb_id} onChange={v => update({ imdb_id: v })} placeholder="tt0111161" mono />
              <InputField label="Slug" value={form.slug} onChange={v => update({ slug: v })} placeholder="se genera automáticamente" mono />
              <InputField label="Año" value={String(form.year)} onChange={v => update({ year: Number(v) })} type="number" />
              <InputField label="Puntuación IMDb" value={String(form.rating)} onChange={v => update({ rating: Number(v) })} type="number" placeholder="0-10" />
              <InputField label="Duración (min)" value={String(form.runtime)} onChange={v => update({ runtime: Number(v) })} type="number" />
              <InputField label="Idioma" value={form.language} onChange={v => update({ language: v })} placeholder="es" />
              <div>
                <label className="block text-[#8b949e] text-xs font-mono uppercase tracking-wider mb-1.5">Clasificación MPA</label>
                <select
                  value={form.mpa_rating}
                  onChange={e => update({ mpa_rating: e.target.value })}
                  className="w-full bg-[#0d1117] border border-[#30363d] focus:border-[#238636] text-[#c9d1d9] rounded-lg px-3 py-2.5 text-sm font-mono outline-none"
                >
                  {MPA_RATINGS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[#8b949e] text-xs font-mono uppercase tracking-wider mb-1.5">Géneros (separados por coma)</label>
              <input
                value={genreInput}
                onChange={e => setGenreInput(e.target.value)}
                placeholder="Acción, Drama, Thriller"
                className="w-full bg-[#0d1117] border border-[#30363d] focus:border-[#238636] text-[#c9d1d9] rounded-lg px-3 py-2.5 text-sm outline-none"
              />
            </div>

            <div>
              <label className="block text-[#8b949e] text-xs font-mono uppercase tracking-wider mb-1.5">Sinopsis</label>
              <textarea
                value={form.synopsis}
                onChange={e => update({ synopsis: e.target.value })}
                placeholder="Descripción de la película..."
                rows={4}
                className="w-full bg-[#0d1117] border border-[#30363d] focus:border-[#238636] text-[#c9d1d9] rounded-lg px-3 py-2.5 text-sm outline-none resize-none"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <InputField label="Director" value={form.director} onChange={v => update({ director: v })} placeholder="Nombre del director" />
              <InputField label="Código de Tráiler (YouTube)" value={form.yt_trailer_code} onChange={v => update({ yt_trailer_code: v })} placeholder="dQw4w9WgXcQ" mono />
            </div>

            <div>
              <label className="block text-[#8b949e] text-xs font-mono uppercase tracking-wider mb-1.5">Reparto (uno por línea)</label>
              <textarea
                value={castInput}
                onChange={e => setCastInput(e.target.value)}
                placeholder={"Tim Robbins\nMorgan Freeman"}
                rows={4}
                className="w-full bg-[#0d1117] border border-[#30363d] focus:border-[#238636] text-[#c9d1d9] rounded-lg px-3 py-2.5 text-sm font-mono outline-none resize-none"
              />
            </div>
          </section>

          {/* Media */}
          <section className="bg-[#161b22] border border-[#30363d] rounded-xl p-6 space-y-4">
            <h2 className="text-[#c9d1d9] font-bold text-sm border-b border-[#30363d] pb-3">Multimedia</h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="space-y-3">
                <InputField label="URL del Póster" value={form.poster_url} onChange={v => update({ poster_url: v })} placeholder="https://..." />
                {form.poster_url && (
                  <img src={form.poster_url} alt="Vista previa del póster" className="h-40 object-cover rounded-lg border border-[#30363d]" />
                )}
                {/* Poster alternatives from TMDB */}
                {allPosters.length > 1 && (
                  <div>
                    <p className="text-[#8b949e] text-[10px] font-mono uppercase mb-1.5">Otras opciones de TMDB</p>
                    <div className="flex gap-1.5 overflow-x-auto pb-1">
                      {allPosters.slice(0, 6).map((p, i) => (
                        <button key={i} onClick={() => selectPoster(i)} className={`flex-shrink-0 rounded overflow-hidden border transition-all ${selectedPoster === i ? "border-[#238636]" : "border-[#30363d] opacity-50 hover:opacity-80"}`}>
                          <img src={p} alt="" className="h-16 w-11 object-cover" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <InputField label="URL del Fondo/Banner" value={form.background_url} onChange={v => update({ background_url: v })} placeholder="https://..." />
                {form.background_url && (
                  <img src={form.background_url} alt="Vista previa del fondo" className="h-40 w-full object-cover rounded-lg border border-[#30363d]" />
                )}
                {allBackdrops.length > 1 && (
                  <div>
                    <p className="text-[#8b949e] text-[10px] font-mono uppercase mb-1.5">Otras opciones de TMDB</p>
                    <div className="flex gap-1.5 overflow-x-auto pb-1">
                      {allBackdrops.slice(0, 5).map((b, i) => (
                        <button key={i} onClick={() => selectBackdrop(i)} className={`flex-shrink-0 rounded overflow-hidden border transition-all ${selectedBackdrop === i ? "border-[#238636]" : "border-[#30363d] opacity-50 hover:opacity-80"}`}>
                          <img src={b} alt="" className="h-14 w-24 object-cover" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Video Sources */}
          <section className="bg-[#161b22] border border-[#30363d] rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-[#30363d] pb-3">
              <h2 className="text-[#c9d1d9] font-bold text-sm">Fuentes de Video</h2>
              <button
                onClick={addSource}
                className="flex items-center gap-1.5 bg-[#238636]/10 border border-[#238636]/30 text-[#3fb950] px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-[#238636]/20 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Agregar Fuente
              </button>
            </div>

            {form.video_sources.length === 0 && (
              <p className="text-[#8b949e] text-sm font-mono text-center py-4">
                Sin fuentes de video. Importa un ID de IMDb para auto-generar.
              </p>
            )}

            {form.video_sources.map((src, idx) => (
              <div key={src.id} className="bg-[#0d1117] border border-[#30363d] rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="flex flex-col gap-0.5">
                    <button onClick={() => moveSource(idx, -1)} disabled={idx === 0} className="text-[#8b949e] hover:text-[#c9d1d9] disabled:opacity-30">
                      <ChevronUp className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => moveSource(idx, 1)} disabled={idx === form.video_sources.length - 1} className="text-[#8b949e] hover:text-[#c9d1d9] disabled:opacity-30">
                      <ChevronDown className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <span className="text-[#8b949e] text-xs font-mono w-5">#{idx + 1}</span>
                  <input
                    value={src.name}
                    onChange={e => updateSource(src.id, { name: e.target.value })}
                    placeholder="Nombre del servidor"
                    className="flex-1 bg-[#161b22] border border-[#30363d] focus:border-[#238636] text-[#c9d1d9] rounded-lg px-3 py-1.5 text-sm font-mono outline-none"
                  />
                  <button
                    onClick={() => setTestEmbedUrl(src.url)}
                    className="flex items-center gap-1 text-[#8b949e] hover:text-[#e3b341] bg-[#21262d] hover:bg-[#e3b341]/10 border border-[#30363d] hover:border-[#e3b341]/30 px-2 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap"
                  >
                    <TestTube className="w-3 h-3" />
                    Probar
                  </button>
                  <button onClick={() => removeSource(src.id)} className="text-[#8b949e] hover:text-[#f85149] transition-colors p-1">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <input
                  value={src.url}
                  onChange={e => updateSource(src.id, { url: e.target.value })}
                  placeholder="https://vidsrc.net/embed/movie/tt0111161"
                  className="w-full bg-[#161b22] border border-[#30363d] focus:border-[#238636] text-[#c9d1d9] rounded-lg px-3 py-2 text-xs font-mono outline-none"
                />
              </div>
            ))}
          </section>

          {/* Torrents */}
          <section className="bg-[#161b22] border border-[#30363d] rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-[#30363d] pb-3">
              <h2 className="text-[#c9d1d9] font-bold text-sm">Enlaces de Descarga</h2>
              <button
                onClick={addTorrent}
                className="flex items-center gap-1.5 bg-[#238636]/10 border border-[#238636]/30 text-[#3fb950] px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-[#238636]/20 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Agregar Torrent
              </button>
            </div>

            {form.torrents.length === 0 && (
              <p className="text-[#8b949e] text-sm font-mono text-center py-4">Sin torrents añadidos aún</p>
            )}

            {form.torrents.map(torrent => (
              <div key={torrent.id} className="bg-[#0d1117] border border-[#30363d] rounded-xl p-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                  <div>
                    <label className="text-[#8b949e] text-[10px] font-mono uppercase block mb-1">Calidad</label>
                    <select
                      value={torrent.quality}
                      onChange={e => updateTorrent(torrent.id, { quality: e.target.value })}
                      className="w-full bg-[#161b22] border border-[#30363d] text-[#c9d1d9] rounded-lg px-2 py-1.5 text-xs font-mono outline-none focus:border-[#238636]"
                    >
                      {QUALITIES.map(q => <option key={q} value={q}>{q}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[#8b949e] text-[10px] font-mono uppercase block mb-1">Fuente</label>
                    <select
                      value={torrent.source}
                      onChange={e => updateTorrent(torrent.id, { source: e.target.value })}
                      className="w-full bg-[#161b22] border border-[#30363d] text-[#c9d1d9] rounded-lg px-2 py-1.5 text-xs font-mono outline-none focus:border-[#238636]"
                    >
                      {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[#8b949e] text-[10px] font-mono uppercase block mb-1">Tamaño</label>
                    <input
                      value={torrent.size}
                      onChange={e => updateTorrent(torrent.id, { size: e.target.value })}
                      placeholder="1.65 GB"
                      className="w-full bg-[#161b22] border border-[#30363d] focus:border-[#238636] text-[#c9d1d9] rounded-lg px-2 py-1.5 text-xs font-mono outline-none"
                    />
                  </div>
                  <div className="flex items-end justify-end">
                    <button
                      onClick={() => removeTorrent(torrent.id)}
                      className="flex items-center gap-1 text-[#8b949e] hover:text-[#f85149] border border-[#30363d] hover:border-[#da3633]/30 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors"
                    >
                      <Trash2 className="w-3 h-3" />
                      Eliminar
                    </button>
                  </div>
                </div>
                <div>
                  <label className="text-[#8b949e] text-[10px] font-mono uppercase block mb-1">URL del Torrent o Enlace Magnet</label>
                  <input
                    value={torrent.url}
                    onChange={e => updateTorrent(torrent.id, { url: e.target.value })}
                    placeholder="https://... o magnet:?xt=urn:btih:..."
                    className="w-full bg-[#161b22] border border-[#30363d] focus:border-[#238636] text-[#c9d1d9] rounded-lg px-3 py-2 text-xs font-mono outline-none"
                  />
                </div>
              </div>
            ))}
          </section>

          {/* Featured toggle */}
          <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-5 flex items-center justify-between">
            <div>
              <p className="text-[#c9d1d9] font-medium text-sm">Destacada en el Inicio</p>
              <p className="text-[#8b949e] text-xs mt-0.5">Mostrar esta película en el banner principal</p>
            </div>
            <button
              onClick={() => update({ featured: !form.featured })}
              className={`relative w-11 h-6 rounded-full transition-colors ${form.featured ? "bg-[#238636]" : "bg-[#30363d]"}`}
            >
              <div className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${form.featured ? "translate-x-5" : "translate-x-0"}`} />
            </button>
          </div>

          {/* Save buttons */}
          <div className="flex gap-3">
            <button
              onClick={() => handleSave(false)}
              disabled={saving}
              className="flex items-center gap-2 bg-[#238636] hover:bg-[#2ea043] disabled:opacity-50 text-white px-6 py-3 rounded-lg text-sm font-bold transition-colors"
              data-testid="btn-save-movie"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {editId ? "Guardar Cambios" : "Guardar Película"}
            </button>
            {!editId && (
              <button
                onClick={() => handleSave(true)}
                disabled={saving}
                className="flex items-center gap-2 bg-[#21262d] hover:bg-[#30363d] text-[#c9d1d9] px-6 py-3 rounded-lg text-sm font-bold transition-colors border border-[#30363d]"
                data-testid="btn-save-preview"
              >
                Guardar y Ver
              </button>
            )}
          </div>
        </div>
      )}

      {/* Test embed modal */}
      {testEmbedUrl && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4" onClick={() => setTestEmbedUrl(null)}>
          <div className="w-full max-w-3xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-[#8b949e] font-mono text-xs truncate flex-1 mr-4">{testEmbedUrl}</p>
              <button onClick={() => setTestEmbedUrl(null)} className="text-white hover:text-[#f85149]">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="w-full aspect-video rounded-xl overflow-hidden bg-black border border-[#30363d]">
              <iframe src={testEmbedUrl} width="100%" height="100%" allowFullScreen className="w-full h-full" title="Probar fuente de video" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
