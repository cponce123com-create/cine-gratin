import { useState, useEffect } from "react";
import {
  Tv, Search, Loader2, CheckCircle2, AlertCircle, Save, Star,
  Image, Play, X, ChevronDown, ChevronUp, Users, Plus, Trash2
} from "lucide-react";
import {
  apiSaveSeries, apiGetOneSeries, DEFAULT_TV_SERVERS,
  type LocalSeries, type SeasonInfo,
} from "@/lib/api-client";
import { uid } from "@/lib/admin-db";
import { toast } from "sonner";

interface AddSeriesProps {
  editId?: string | null;
  onSaved: () => void;
}

interface TmdbSeriesData {
  imdb_id: string;
  tmdb_id: number;
  title: string;
  original_title: string;
  year: number;
  end_year: number | null;
  rating: number;
  genres: string[];
  language: string;
  synopsis: string;
  creators: string[];
  cast: { name: string; character: string; profile: string | null }[];
  poster_url: string;
  poster_original: string;
  background_url: string;
  extra_backdrops: string[];
  extra_posters: string[];
  yt_trailer_code: string;
  status: string;
  total_seasons: number;
  total_episodes: number;
  seasons: SeasonInfo[];
}

export function AddSeries({ editId, onSaved }: AddSeriesProps) {
  const [imdbInput, setImdbInput] = useState("");
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState("");
  const [tmdbData, setTmdbData] = useState<TmdbSeriesData | null>(null);
  const [saving, setSaving] = useState(false);

  // Editable fields
  const [title, setTitle] = useState("");
  const [synopsis, setSynopsis] = useState("");
  const [rating, setRating] = useState(0);
  const [year, setYear] = useState(0);
  const [endYear, setEndYear] = useState<number | null>(null);
  const [status, setStatus] = useState("");
  const [genres, setGenres] = useState<string[]>([]);
  const [genreInput, setGenreInput] = useState("");
  const [creators, setCreators] = useState<string[]>([]);
  const [creatorsInput, setCreatorsInput] = useState("");
  const [castList, setCastList] = useState<string[]>([]);
  const [posterUrl, setPosterUrl] = useState("");
  const [backgroundUrl, setBackgroundUrl] = useState("");
  const [trailerCode, setTrailerCode] = useState("");
  const [totalSeasons, setTotalSeasons] = useState(1);
  const [seasons, setSeasons] = useState<SeasonInfo[]>([]);
  const [videoServers, setVideoServers] = useState(DEFAULT_TV_SERVERS.map(s => ({ ...s, id: uid() })));
  const [featured, setFeatured] = useState(false);

  const [selectedPoster, setSelectedPoster] = useState(0);
  const [selectedBg, setSelectedBg] = useState(0);
  const [showTrailerPreview, setShowTrailerPreview] = useState(false);
  const [activeSection, setActiveSection] = useState<"info" | "media" | "seasons" | "servers">("info");

  // Load for editing
  useEffect(() => {
    if (!editId) return;
    apiGetOneSeries(editId).then(s => {
      setTitle(s.title); setSynopsis(s.synopsis); setRating(s.rating);
      setYear(s.year); setEndYear(s.end_year ?? null); setStatus(s.status);
      setGenres(s.genres); setCreators(s.creators); setCastList(s.cast_list);
      setPosterUrl(s.poster_url); setBackgroundUrl(s.background_url);
      setTrailerCode(s.yt_trailer_code); setTotalSeasons(s.total_seasons);
      setSeasons(s.seasons_data || []);
      setFeatured(s.featured);
      if (s.video_sources?.length) {
        setVideoServers(s.video_sources.map(v => ({ id: v.id, name: v.name, url: v.url, active: v.active })));
      }
      setImdbInput(s.imdb_id);
    }).catch(() => toast.error("Error al cargar la serie"));
  }, [editId]);

  const fetchFromTmdb = async () => {
    const id = imdbInput.trim();
    if (!/^tt\d+$/.test(id)) {
      setFetchError("Formato inválido. Usa: tt0903747");
      return;
    }
    setFetching(true);
    setFetchError("");
    setTmdbData(null);
    try {
      const res = await fetch(`/api/tmdb/series/${id}`);
      const data = await res.json();
      if (!res.ok) { setFetchError(data.error || "Error al buscar en TMDB"); return; }
      setTmdbData(data);
      // Auto-fill all fields
      setTitle(data.title);
      setSynopsis(data.synopsis);
      setRating(data.rating);
      setYear(data.year);
      setEndYear(data.end_year);
      setStatus(data.status);
      setGenres(data.genres);
      setCreators(data.creators);
      setCastList(data.cast.map((c: { name: string }) => c.name));
      setPosterUrl(data.poster_url);
      setBackgroundUrl(data.background_url);
      setTrailerCode(data.yt_trailer_code);
      setTotalSeasons(data.total_seasons);
      setSeasons(data.seasons || []);
      setSelectedPoster(0);
      setSelectedBg(0);
      toast.success(`✓ "${data.title}" cargada desde TMDB`);
    } catch {
      setFetchError("Error de conexión con TMDB");
    } finally {
      setFetching(false);
    }
  };

  const allPosters = tmdbData
    ? [tmdbData.poster_url, tmdbData.poster_original, ...tmdbData.extra_posters].filter(Boolean)
    : posterUrl ? [posterUrl] : [];

  const allBgs = tmdbData
    ? [tmdbData.background_url, ...tmdbData.extra_backdrops].filter(Boolean)
    : backgroundUrl ? [backgroundUrl] : [];

  const handlePosterSelect = (i: number) => {
    setSelectedPoster(i);
    setPosterUrl(allPosters[i]);
  };

  const handleBgSelect = (i: number) => {
    setSelectedBg(i);
    setBackgroundUrl(allBgs[i]);
  };

  const updateSeason = (idx: number, field: keyof SeasonInfo, value: number) => {
    setSeasons(prev => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s));
  };

  const addSeason = () => {
    setSeasons(prev => [...prev, { season: prev.length + 1, episodes: 13 }]);
    setTotalSeasons(s => s + 1);
  };

  const removeSeason = (idx: number) => {
    setSeasons(prev => prev.filter((_, i) => i !== idx));
    setTotalSeasons(s => Math.max(1, s - 1));
  };

  const handleSave = async () => {
    if (!title.trim()) { toast.error("El título es obligatorio"); return; }
    const imdbId = imdbInput.trim();
    if (!/^tt\d+$/.test(imdbId)) { toast.error("ID de IMDb inválido"); return; }
    setSaving(true);
    try {
      const series: LocalSeries = {
        id: editId || imdbId,
        imdb_id: imdbId,
        tmdb_id: tmdbData?.tmdb_id ?? null,
        title: title.trim(),
        year,
        end_year: endYear,
        rating,
        genres,
        language: tmdbData?.language || "es",
        synopsis: synopsis.trim(),
        creators,
        cast_list: castList,
        poster_url: posterUrl,
        background_url: backgroundUrl,
        yt_trailer_code: trailerCode,
        status,
        total_seasons: Math.max(1, totalSeasons),
        seasons_data: seasons,
        video_sources: videoServers.filter(s => s.active).map(s => ({
          id: s.id,
          name: s.name,
          url: s.url.replace("{IMDB_ID}", imdbId),
          active: s.active,
        })),
        featured,
        views: 0,
        date_added: new Date().toISOString(),
      };
      await apiSaveSeries(series);
      toast.success(`Serie "${title}" guardada correctamente`);
      onSaved();
    } catch (e) {
      toast.error(String(e));
    } finally {
      setSaving(false);
    }
  };

  const TABS = [
    { id: "info" as const, label: "Información" },
    { id: "media" as const, label: "Imágenes" },
    { id: "seasons" as const, label: "Temporadas" },
    { id: "servers" as const, label: "Servidores" },
  ];

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#c9d1d9] mb-1">{editId ? "Editar Serie" : "Añadir Serie de TV"}</h1>
        <p className="text-[#8b949e] text-sm">Importa datos automáticamente desde TMDB usando el ID de IMDb</p>
      </div>

      {/* IMDb Search */}
      {!editId && (
        <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-5 space-y-3">
          <label className="block text-[#8b949e] text-xs font-mono uppercase tracking-wider mb-1">
            ID de IMDb de la Serie
          </label>
          <div className="flex gap-3">
            <input
              value={imdbInput}
              onChange={e => setImdbInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && fetchFromTmdb()}
              placeholder="tt0903747"
              className="flex-1 bg-[#0d1117] border border-[#30363d] focus:border-[#238636] text-[#c9d1d9] rounded-lg px-4 py-2.5 text-sm font-mono outline-none placeholder:text-[#484f58]"
              data-testid="input-series-imdb"
            />
            <button
              onClick={fetchFromTmdb}
              disabled={fetching || !imdbInput.trim()}
              className="flex items-center gap-2 bg-[#238636] hover:bg-[#2ea043] disabled:opacity-50 text-white px-5 py-2.5 rounded-lg font-bold text-sm transition-colors"
              data-testid="btn-fetch-series"
            >
              {fetching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              {fetching ? "Buscando..." : "Buscar en TMDB"}
            </button>
          </div>
          <p className="text-[#484f58] text-xs font-mono">
            Ejemplo: tt0903747 (Breaking Bad) · tt0944947 (Game of Thrones) · tt7660850 (Succession)
          </p>
          {fetchError && (
            <div className="flex items-center gap-2 bg-[#da3633]/10 border border-[#da3633]/30 text-[#f85149] rounded-lg px-4 py-3 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {fetchError}
            </div>
          )}
          {tmdbData && (
            <div className="flex items-center gap-2 bg-[#238636]/10 border border-[#238636]/30 text-[#3fb950] rounded-lg px-4 py-3 text-sm">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              <span>
                <strong>{tmdbData.title}</strong> — {tmdbData.total_seasons} temporada{tmdbData.total_seasons !== 1 ? "s" : ""} · {tmdbData.total_episodes} episodios · Estado: {tmdbData.status}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-[#30363d]">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveSection(t.id)}
            className={`px-5 py-3 text-sm font-bold uppercase tracking-wider transition-colors ${
              activeSection === t.id
                ? "text-[#3fb950] border-b-2 border-[#238636]"
                : "text-[#8b949e] hover:text-[#c9d1d9]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* === INFO TAB === */}
      {activeSection === "info" && (
        <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-6 space-y-5">
          {/* Preview card */}
          {posterUrl && (
            <div className="flex items-center gap-4 bg-[#0d1117] rounded-xl p-4 border border-[#30363d]">
              <img src={posterUrl} alt={title} className="w-16 h-24 object-cover rounded-lg" />
              <div>
                <p className="text-[#c9d1d9] font-bold text-lg">{title || "Sin título"}</p>
                <div className="flex items-center gap-2 text-sm text-[#8b949e] mt-1">
                  <span className="font-mono">{year}{endYear ? ` – ${endYear}` : endYear === null && status !== "Ended" ? " – presente" : ""}</span>
                  {rating > 0 && <span className="flex items-center gap-0.5 text-yellow-400"><Star className="w-3.5 h-3.5 fill-current" />{rating}</span>}
                  {status && <span className="text-[10px] bg-[#21262d] px-2 py-0.5 rounded font-mono">{status}</span>}
                </div>
                <p className="text-[#8b949e] text-xs mt-0.5 font-mono">{totalSeasons} temporada{totalSeasons !== 1 ? "s" : ""}</p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-[#8b949e] text-xs font-mono uppercase tracking-wider mb-1.5">Título *</label>
              <input value={title} onChange={e => setTitle(e.target.value)} className="w-full bg-[#0d1117] border border-[#30363d] focus:border-[#238636] text-[#c9d1d9] rounded-lg px-4 py-2.5 text-sm outline-none" />
            </div>

            <div>
              <label className="block text-[#8b949e] text-xs font-mono uppercase tracking-wider mb-1.5">Año inicio</label>
              <input type="number" value={year} onChange={e => setYear(Number(e.target.value))} className="w-full bg-[#0d1117] border border-[#30363d] focus:border-[#238636] text-[#c9d1d9] rounded-lg px-4 py-2.5 text-sm outline-none font-mono" />
            </div>

            <div>
              <label className="block text-[#8b949e] text-xs font-mono uppercase tracking-wider mb-1.5">Año fin (vacío si sigue en emisión)</label>
              <input type="number" value={endYear ?? ""} onChange={e => setEndYear(e.target.value ? Number(e.target.value) : null)} placeholder="En emisión" className="w-full bg-[#0d1117] border border-[#30363d] focus:border-[#238636] text-[#c9d1d9] rounded-lg px-4 py-2.5 text-sm outline-none font-mono placeholder:text-[#484f58]" />
            </div>

            <div>
              <label className="block text-[#8b949e] text-xs font-mono uppercase tracking-wider mb-1.5">Puntuación (0-10)</label>
              <input type="number" min={0} max={10} step={0.1} value={rating} onChange={e => setRating(Number(e.target.value))} className="w-full bg-[#0d1117] border border-[#30363d] focus:border-[#238636] text-[#c9d1d9] rounded-lg px-4 py-2.5 text-sm outline-none font-mono" />
            </div>

            <div>
              <label className="block text-[#8b949e] text-xs font-mono uppercase tracking-wider mb-1.5">Estado</label>
              <select value={status} onChange={e => setStatus(e.target.value)} className="w-full bg-[#0d1117] border border-[#30363d] focus:border-[#238636] text-[#c9d1d9] rounded-lg px-4 py-2.5 text-sm outline-none">
                <option value="">Sin especificar</option>
                <option value="Returning Series">En emisión</option>
                <option value="Ended">Finalizada</option>
                <option value="Canceled">Cancelada</option>
                <option value="In Production">En producción</option>
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="block text-[#8b949e] text-xs font-mono uppercase tracking-wider mb-1.5">Sinopsis</label>
              <textarea value={synopsis} onChange={e => setSynopsis(e.target.value)} rows={4} className="w-full bg-[#0d1117] border border-[#30363d] focus:border-[#238636] text-[#c9d1d9] rounded-lg px-4 py-2.5 text-sm outline-none resize-y" />
            </div>

            {/* Genres */}
            <div>
              <label className="block text-[#8b949e] text-xs font-mono uppercase tracking-wider mb-1.5">Géneros</label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {genres.map(g => (
                  <span key={g} className="flex items-center gap-1 bg-[#238636]/20 border border-[#238636]/30 text-[#3fb950] text-xs px-2 py-1 rounded-full">
                    {g}
                    <button onClick={() => setGenres(genres.filter(x => x !== g))}><X className="w-3 h-3" /></button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input value={genreInput} onChange={e => setGenreInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && genreInput.trim()) { setGenres([...genres, genreInput.trim()]); setGenreInput(""); } }} placeholder="Añadir género..." className="flex-1 bg-[#0d1117] border border-[#30363d] focus:border-[#238636] text-[#c9d1d9] rounded-lg px-3 py-2 text-sm outline-none placeholder:text-[#484f58]" />
                <button onClick={() => { if (genreInput.trim()) { setGenres([...genres, genreInput.trim()]); setGenreInput(""); } }} className="bg-[#21262d] border border-[#30363d] text-[#c9d1d9] px-3 py-2 rounded-lg text-sm hover:bg-[#30363d]"><Plus className="w-4 h-4" /></button>
              </div>
            </div>

            {/* Creators */}
            <div>
              <label className="block text-[#8b949e] text-xs font-mono uppercase tracking-wider mb-1.5">Creadores</label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {creators.map(c => (
                  <span key={c} className="flex items-center gap-1 bg-[#21262d] border border-[#30363d] text-[#c9d1d9] text-xs px-2 py-1 rounded-full">
                    {c}
                    <button onClick={() => setCreators(creators.filter(x => x !== c))}><X className="w-3 h-3 text-[#8b949e]" /></button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input value={creatorsInput} onChange={e => setCreatorsInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && creatorsInput.trim()) { setCreators([...creators, creatorsInput.trim()]); setCreatorsInput(""); } }} placeholder="Añadir creador..." className="flex-1 bg-[#0d1117] border border-[#30363d] focus:border-[#238636] text-[#c9d1d9] rounded-lg px-3 py-2 text-sm outline-none placeholder:text-[#484f58]" />
                <button onClick={() => { if (creatorsInput.trim()) { setCreators([...creators, creatorsInput.trim()]); setCreatorsInput(""); } }} className="bg-[#21262d] border border-[#30363d] text-[#c9d1d9] px-3 py-2 rounded-lg text-sm hover:bg-[#30363d]"><Plus className="w-4 h-4" /></button>
              </div>
            </div>

            {/* Cast */}
            {castList.length > 0 && (
              <div className="md:col-span-2">
                <label className="block text-[#8b949e] text-xs font-mono uppercase tracking-wider mb-2 flex items-center gap-1.5"><Users className="w-3.5 h-3.5" /> Reparto Principal</label>
                <div className="flex flex-wrap gap-2">
                  {castList.map((name, i) => {
                    const castInfo = tmdbData?.cast[i];
                    return (
                      <div key={i} className="flex items-center gap-1.5 bg-[#21262d] border border-[#30363d] rounded-full px-2 py-1">
                        {castInfo?.profile
                          ? <img src={castInfo.profile} alt={name} className="w-5 h-5 rounded-full object-cover" />
                          : <div className="w-5 h-5 rounded-full bg-[#30363d] flex items-center justify-center"><span className="text-[8px] text-[#8b949e]">{name[0]}</span></div>
                        }
                        <span className="text-[#c9d1d9] text-xs">{name}</span>
                        <button onClick={() => setCastList(castList.filter((_, j) => j !== i))}><X className="w-3 h-3 text-[#8b949e] hover:text-[#f85149]" /></button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Featured */}
            <div className="md:col-span-2">
              <label className="flex items-center gap-3 cursor-pointer">
                <button onClick={() => setFeatured(!featured)} className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 ${featured ? "bg-[#e3b341]" : "bg-[#30363d]"}`}>
                  <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${featured ? "translate-x-4" : ""}`} />
                </button>
                <div>
                  <p className="text-[#c9d1d9] text-sm">Destacar en portada</p>
                  <p className="text-[#8b949e] text-xs">Aparece en la sección hero de la página principal</p>
                </div>
              </label>
            </div>
          </div>
        </div>
      )}

      {/* === MEDIA TAB === */}
      {activeSection === "media" && (
        <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-6 space-y-6">
          {/* Poster */}
          <div>
            <label className="block text-[#8b949e] text-xs font-mono uppercase tracking-wider mb-3 flex items-center gap-1.5"><Image className="w-3.5 h-3.5" /> Póster</label>
            {allPosters.length > 1 && (
              <div className="flex gap-2 mb-3 overflow-x-auto pb-2">
                {allPosters.map((url, i) => (
                  <button key={i} onClick={() => handlePosterSelect(i)} className={`flex-none w-16 h-24 rounded-lg overflow-hidden border-2 transition-all ${i === selectedPoster ? "border-[#238636] scale-105" : "border-[#30363d] opacity-60 hover:opacity-100"}`}>
                    <img src={url} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
            <input value={posterUrl} onChange={e => setPosterUrl(e.target.value)} placeholder="URL del póster" className="w-full bg-[#0d1117] border border-[#30363d] focus:border-[#238636] text-[#c9d1d9] rounded-lg px-4 py-2.5 text-sm outline-none font-mono placeholder:text-[#484f58]" />
          </div>

          {/* Background */}
          <div>
            <label className="block text-[#8b949e] text-xs font-mono uppercase tracking-wider mb-3">Imagen de Fondo</label>
            {allBgs.length > 1 && (
              <div className="flex gap-2 mb-3 overflow-x-auto pb-2">
                {allBgs.map((url, i) => (
                  <button key={i} onClick={() => handleBgSelect(i)} className={`flex-none w-32 h-18 rounded-lg overflow-hidden border-2 transition-all ${i === selectedBg ? "border-[#238636] scale-105" : "border-[#30363d] opacity-60 hover:opacity-100"}`}>
                    <img src={url} alt="" className="w-full h-full object-cover aspect-video" />
                  </button>
                ))}
              </div>
            )}
            <input value={backgroundUrl} onChange={e => setBackgroundUrl(e.target.value)} placeholder="URL de fondo/backdrop" className="w-full bg-[#0d1117] border border-[#30363d] focus:border-[#238636] text-[#c9d1d9] rounded-lg px-4 py-2.5 text-sm outline-none font-mono placeholder:text-[#484f58]" />
          </div>

          {/* Trailer */}
          <div>
            <label className="block text-[#8b949e] text-xs font-mono uppercase tracking-wider mb-3">Tráiler de YouTube</label>
            <div className="flex gap-2">
              <input value={trailerCode} onChange={e => setTrailerCode(e.target.value)} placeholder="Código de YouTube (ej: dQw4w9WgXcQ)" className="flex-1 bg-[#0d1117] border border-[#30363d] focus:border-[#238636] text-[#c9d1d9] rounded-lg px-4 py-2.5 text-sm outline-none font-mono placeholder:text-[#484f58]" />
              {trailerCode && (
                <button onClick={() => setShowTrailerPreview(!showTrailerPreview)} className="flex items-center gap-2 bg-[#21262d] border border-[#30363d] text-[#8b949e] hover:text-[#c9d1d9] px-4 py-2 rounded-lg text-sm transition-colors">
                  <Play className="w-4 h-4" />
                  {showTrailerPreview ? "Ocultar" : "Vista previa"}
                </button>
              )}
            </div>
            {showTrailerPreview && trailerCode && (
              <div className="mt-3 aspect-video rounded-xl overflow-hidden border border-[#30363d]">
                <iframe src={`https://www.youtube.com/embed/${trailerCode}?autoplay=0`} className="w-full h-full" allowFullScreen title="Tráiler" />
              </div>
            )}
          </div>
        </div>
      )}

      {/* === SEASONS TAB === */}
      {activeSection === "seasons" && (
        <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-[#c9d1d9] font-bold">Temporadas y Episodios</h3>
              <p className="text-[#8b949e] text-xs mt-0.5">Estos datos se usan para el selector de episodios en el reproductor</p>
            </div>
            <button onClick={addSeason} className="flex items-center gap-2 bg-[#238636]/10 border border-[#238636]/30 text-[#3fb950] px-3 py-2 rounded-lg text-sm font-bold hover:bg-[#238636]/20 transition-colors">
              <Plus className="w-4 h-4" />
              Temporada
            </button>
          </div>

          {seasons.length === 0 ? (
            <div className="text-center py-10 text-[#8b949e] text-sm">
              <Tv className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>No hay temporadas definidas.</p>
              <p className="text-xs mt-1">Si importaste desde TMDB se llenan automáticamente.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {seasons.map((s, i) => (
                <div key={i} className="flex items-center gap-3 bg-[#0d1117] border border-[#30363d] rounded-lg px-4 py-3">
                  {s.poster && <img src={s.poster} alt="" className="w-8 h-12 object-cover rounded flex-shrink-0" />}
                  <div className="flex-1 grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[#8b949e] text-[10px] font-mono uppercase mb-1">Temporada</label>
                      <input type="number" value={s.season} onChange={e => updateSeason(i, "season", Number(e.target.value))} className="w-full bg-[#161b22] border border-[#30363d] text-[#c9d1d9] rounded px-2 py-1 text-sm font-mono outline-none" />
                    </div>
                    <div>
                      <label className="block text-[#8b949e] text-[10px] font-mono uppercase mb-1">Episodios</label>
                      <input type="number" value={s.episodes} onChange={e => updateSeason(i, "episodes", Number(e.target.value))} className="w-full bg-[#161b22] border border-[#30363d] text-[#c9d1d9] rounded px-2 py-1 text-sm font-mono outline-none" />
                    </div>
                  </div>
                  <button onClick={() => removeSeason(i)} className="text-[#8b949e] hover:text-[#f85149] transition-colors"><Trash2 className="w-4 h-4" /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* === SERVERS TAB === */}
      {activeSection === "servers" && (
        <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-6 space-y-4">
          <div>
            <h3 className="text-[#c9d1d9] font-bold">Servidores de Video</h3>
            <p className="text-[#8b949e] text-xs mt-1">Usa {"{IMDB_ID}"}, {"{SEASON}"}, {"{EPISODE}"} en la URL. El reproductor los reemplaza automáticamente.</p>
          </div>
          {videoServers.map((srv, i) => (
            <div key={srv.id} className="bg-[#0d1117] border border-[#30363d] rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button onClick={() => setVideoServers(vs => vs.map((s, j) => j === i ? { ...s, active: !s.active } : s))} className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 ${srv.active ? "bg-[#238636]" : "bg-[#30363d]"}`}>
                    <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${srv.active ? "translate-x-4" : ""}`} />
                  </button>
                  <input value={srv.name} onChange={e => setVideoServers(vs => vs.map((s, j) => j === i ? { ...s, name: e.target.value } : s))} className="bg-transparent text-[#c9d1d9] font-bold text-sm outline-none border-b border-transparent focus:border-[#238636] pb-0.5" />
                </div>
                <button onClick={() => setVideoServers(vs => vs.filter((_, j) => j !== i))} className="text-[#8b949e] hover:text-[#f85149] transition-colors"><Trash2 className="w-4 h-4" /></button>
              </div>
              <input value={srv.url} onChange={e => setVideoServers(vs => vs.map((s, j) => j === i ? { ...s, url: e.target.value } : s))} placeholder="https://vidsrc.net/embed/tv/{IMDB_ID}/{SEASON}/{EPISODE}" className="w-full bg-[#161b22] border border-[#30363d] focus:border-[#238636] text-[#c9d1d9] rounded-lg px-3 py-2 text-xs font-mono outline-none placeholder:text-[#484f58]" />
            </div>
          ))}
          <button onClick={() => setVideoServers(vs => [...vs, { id: uid(), name: "Nuevo Servidor", url: "https://vidsrc.net/embed/tv/{IMDB_ID}/{SEASON}/{EPISODE}", active: true }])} className="flex items-center gap-2 bg-[#21262d] border border-[#30363d] border-dashed text-[#8b949e] hover:text-[#c9d1d9] px-4 py-3 rounded-lg text-sm transition-colors w-full justify-center">
            <Plus className="w-4 h-4" />
            Añadir servidor
          </button>
        </div>
      )}

      {/* Save button */}
      <div className="flex gap-3 sticky bottom-0 bg-[#0d1117]/95 backdrop-blur py-4 border-t border-[#30363d] -mx-1 px-1">
        <button
          onClick={handleSave}
          disabled={saving || !title.trim()}
          className="flex items-center gap-2 bg-[#238636] hover:bg-[#2ea043] disabled:opacity-50 text-white px-6 py-3 rounded-lg font-bold text-sm transition-colors"
          data-testid="btn-save-series"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? "Guardando..." : editId ? "Actualizar Serie" : "Guardar Serie"}
        </button>
        {!editId && tmdbData && (
          <p className="text-[#8b949e] text-sm self-center">
            Puedes navegar entre pestañas antes de guardar
          </p>
        )}
      </div>
    </div>
  );
}
