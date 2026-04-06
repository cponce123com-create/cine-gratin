import { useState, useEffect } from "react";
import { Plus, Trash2, X, Loader2, Download, TestTube, ChevronUp, ChevronDown } from "lucide-react";
import {
  addMovie,
  getMovie,
  uid,
  makeVideoSourcesForImdb,
  LocalMovie,
  VideoSource,
  LocalTorrent,
} from "@/lib/admin-db";
import { toast } from "sonner";

interface AddMovieProps {
  editId?: string | null;
  onSaved: () => void;
}

const EMPTY_MOVIE: Omit<LocalMovie, "id" | "date_added" | "views"> = {
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

  useEffect(() => {
    if (editId) {
      const existing = getMovie(editId);
      if (existing) {
        setForm({ ...existing });
        setGenreInput(existing.genres.join(", "));
        setCastInput(existing.cast_list.join("\n"));
        setTab("manual");
      }
    }
  }, [editId]);

  const update = (patch: Partial<typeof form>) => setForm(prev => ({ ...prev, ...patch }));

  // ─── Importar por IMDb ───────────────────────────────────────

  const fetchFromImdb = async () => {
    const q = imdbQuery.trim();
    if (!q) { toast.error("Ingresa un ID de IMDb o URL"); return; }
    const imdbId = q.includes("tt") ? q.match(/tt\d+/)?.[0] : q;
    if (!imdbId) { toast.error("No se pudo extraer el ID de IMDb"); return; }

    setFetching(true);
    try {
      const res = await fetch(
        `https://yts.mx/api/v2/list_movies.json?query_term=${imdbId}&with_cast=true`
      );
      const json = await res.json();
      const movie = json?.data?.movies?.[0];
      if (!movie) {
        toast.error("Película no encontrada. Intenta agregar manualmente.");
        setFetching(false);
        return;
      }

      const sources = makeVideoSourcesForImdb(movie.imdb_code);

      const torrents: LocalTorrent[] = (movie.torrents || []).map((t: {
        quality: string; type: string; size: string; url: string;
      }) => ({
        id: uid(),
        quality: t.quality,
        source: t.type,
        size: t.size,
        url: t.url,
      }));

      update({
        imdb_id: movie.imdb_code,
        title: movie.title,
        year: movie.year,
        rating: movie.rating,
        runtime: movie.runtime,
        genres: movie.genres || [],
        language: movie.language || "en",
        synopsis: movie.description_full || movie.summary || "",
        director: "",
        cast_list: (movie.cast || []).map((c: { name: string }) => c.name),
        poster_url: movie.large_cover_image || movie.medium_cover_image,
        background_url: movie.background_image_original || movie.background_image,
        yt_trailer_code: movie.yt_trailer_code || "",
        mpa_rating: movie.mpa_rating || "NR",
        slug: movie.slug,
        video_sources: sources,
        torrents,
      });

      setGenreInput((movie.genres || []).join(", "));
      setCastInput((movie.cast || []).map((c: { name: string }) => c.name).join("\n"));
      setTab("manual");
      toast.success(`Importado: ${movie.title} (${movie.year})`);
    } catch {
      toast.error("Error al importar. Intenta agregar manualmente.");
    }
    setFetching(false);
  };

  // ─── Fuentes de Video ────────────────────────────────────────

  const addSource = () => {
    const sources = [...form.video_sources, { id: uid(), name: "Servidor Personalizado", url: "", active: true }];
    update({ video_sources: sources });
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

  // ─── Torrents ────────────────────────────────────────────────

  const addTorrent = () => {
    update({ torrents: [...form.torrents, { id: uid(), quality: "1080p", source: "BluRay", size: "", url: "" }] });
  };

  const updateTorrent = (id: string, patch: Partial<LocalTorrent>) => {
    update({ torrents: form.torrents.map(t => t.id === id ? { ...t, ...patch } : t) });
  };

  const removeTorrent = (id: string) => {
    update({ torrents: form.torrents.filter(t => t.id !== id) });
  };

  // ─── Guardar ─────────────────────────────────────────────────

  const handleSave = (preview = false) => {
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
      date_added: editId ? (getMovie(editId)?.date_added || new Date().toISOString()) : new Date().toISOString(),
      views: editId ? (getMovie(editId)?.views || 0) : 0,
    };

    addMovie(movie);
    toast.success(editId ? "¡Película actualizada!" : "¡Película guardada!");
    setSaving(false);

    if (preview) {
      window.open(`/movie/${movie.id}`, "_blank");
    }
    onSaved();
  };

  // ─── Componentes UI ──────────────────────────────────────────

  const InputField = ({
    label, value, onChange, placeholder, type = "text", mono = false
  }: {
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
          {editId ? "Actualizar datos de la película existente" : "Importar por ID de IMDb o agregar manualmente"}
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
              {t === "import" ? "Importar por IMDb" : "Agregar Manualmente"}
            </button>
          ))}
        </div>
      )}

      {/* Import tab */}
      {tab === "import" && !editId && (
        <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-6 space-y-4">
          <h2 className="text-[#c9d1d9] font-bold text-sm">Importar datos por ID de IMDb</h2>
          <div className="flex gap-3">
            <input
              value={imdbQuery}
              onChange={e => setImdbQuery(e.target.value)}
              onKeyDown={e => e.key === "Enter" && fetchFromImdb()}
              placeholder="ID de IMDb (ej. tt0072610) o URL de la película"
              className="flex-1 bg-[#0d1117] border border-[#30363d] focus:border-[#238636] text-[#c9d1d9] rounded-lg px-4 py-3 text-sm font-mono outline-none placeholder:text-[#484f58]"
              data-testid="input-imdb-query"
            />
            <button
              onClick={fetchFromImdb}
              disabled={fetching}
              className="flex items-center gap-2 bg-[#238636] hover:bg-[#2ea043] disabled:opacity-50 text-white px-5 py-3 rounded-lg text-sm font-bold transition-colors whitespace-nowrap"
              data-testid="btn-fetch-movie"
            >
              {fetching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              Importar
            </button>
          </div>
          <p className="text-[#8b949e] text-xs font-mono">
            Ingresa un ID como <span className="text-[#58a6ff]">tt0111161</span> para importar los datos automáticamente
          </p>
        </div>
      )}

      {/* Manual / Edit form */}
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
              <label className="block text-[#8b949e] text-xs font-mono uppercase tracking-wider mb-1.5">
                Géneros (separados por coma)
              </label>
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
                rows={3}
                className="w-full bg-[#0d1117] border border-[#30363d] focus:border-[#238636] text-[#c9d1d9] rounded-lg px-3 py-2.5 text-sm font-mono outline-none resize-none"
              />
            </div>
          </section>

          {/* Media */}
          <section className="bg-[#161b22] border border-[#30363d] rounded-xl p-6 space-y-4">
            <h2 className="text-[#c9d1d9] font-bold text-sm border-b border-[#30363d] pb-3">Multimedia</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="space-y-2">
                <InputField label="URL del Póster" value={form.poster_url} onChange={v => update({ poster_url: v })} placeholder="https://..." />
                {form.poster_url && (
                  <img src={form.poster_url} alt="Vista previa del póster" className="h-40 object-cover rounded-lg border border-[#30363d]" />
                )}
              </div>
              <div className="space-y-2">
                <InputField label="URL del Fondo/Banner" value={form.background_url} onChange={v => update({ background_url: v })} placeholder="https://..." />
                {form.background_url && (
                  <img src={form.background_url} alt="Vista previa del fondo" className="h-40 w-full object-cover rounded-lg border border-[#30363d]" />
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
                Sin fuentes de video. Agrega una manualmente o importa por IMDb.
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
                  <button
                    onClick={() => removeSource(src.id)}
                    className="text-[#8b949e] hover:text-[#f85149] transition-colors p-1"
                  >
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
              {editId ? "Guardar Cambios" : "Guardar y Salir"}
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
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setTestEmbedUrl(null)}
        >
          <div
            className="w-full max-w-3xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <p className="text-[#8b949e] font-mono text-xs truncate flex-1 mr-4">{testEmbedUrl}</p>
              <button onClick={() => setTestEmbedUrl(null)} className="text-white hover:text-[#f85149]">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="w-full aspect-video rounded-xl overflow-hidden bg-black border border-[#30363d]">
              <iframe
                src={testEmbedUrl}
                width="100%"
                height="100%"
                allowFullScreen
                className="w-full h-full"
                title="Probar fuente de video"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
