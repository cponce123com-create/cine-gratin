import { useState, useEffect } from "react";
import { Search, Tv, Play, Star, ChevronDown } from "lucide-react";
import { PageTransition } from "@/components/layout/PageTransition";
import { useTvSearch, useTvSeasons, TvShow } from "@/lib/tvmaze";
import { useDebounce } from "@/hooks/use-debounce";

const FEATURED_SHOWS = [
  { name: "Breaking Bad", imdb: "tt0903747", image: null },
  { name: "Game of Thrones", imdb: "tt0944947", image: null },
  { name: "The Wire", imdb: "tt0306414", image: null },
  { name: "Chernobyl", imdb: "tt7366338", image: null },
  { name: "Succession", imdb: "tt7660850", image: null },
  { name: "The Bear", imdb: "tt14452776", image: null },
];

export default function Series() {
  const [searchInput, setSearchInput] = useState("");
  const debouncedQuery = useDebounce(searchInput, 400);

  const [selectedShow, setSelectedShow] = useState<TvShow | null>(null);
  const [selectedImdb, setSelectedImdb] = useState<string | null>(null);
  const [season, setSeason] = useState(1);
  const [episode, setEpisode] = useState(1);
  const [activeServer, setActiveServer] = useState(0);

  const { results, loading: searchLoading } = useTvSearch(debouncedQuery);
  const { seasons } = useTvSeasons(selectedShow?.id ?? null);

  const episodeCount = seasons.find(s => s.number === season)?.episodeOrder ?? 30;

  const getEmbedUrl = (server: number, imdb: string) => {
    const s = String(season).padStart(2, "0");
    const e = String(episode).padStart(2, "0");
    if (server === 0) return `https://vidsrc.net/embed/tv/${imdb}/${s}/${e}`;
    if (server === 1) return `https://multiembed.mov/embed/imdb/${imdb}&s=${s}&e=${e}`;
    return `https://www.2embed.cc/embedtv/${imdb}&s=${s}&e=${e}`;
  };

  const handleSelectShow = (show: TvShow) => {
    setSelectedShow(show);
    setSelectedImdb(show.externals.imdb);
    setSeason(1);
    setEpisode(1);
    setActiveServer(0);
    setSearchInput("");
  };

  const handleSelectFeatured = (imdb: string, name: string) => {
    setSelectedShow(null);
    setSelectedImdb(imdb);
    setSeason(1);
    setEpisode(1);
    setActiveServer(0);
  };

  const SERVERS = ["Server 1", "Server 2", "Server 3"];

  const seasonOptions = seasons.length > 0
    ? seasons
    : Array.from({ length: 10 }, (_, i) => ({ number: i + 1, id: i + 1, episodeOrder: 20, premiereDate: null, endDate: null }));

  return (
    <PageTransition>
      <div className="min-h-screen pt-24 pb-20">
        <div className="max-w-6xl mx-auto px-4 md:px-8">
          {/* Header */}
          <div className="mb-10">
            <h1 className="text-5xl font-heading tracking-wide flex items-center gap-3 mb-2">
              <span className="w-1.5 h-10 bg-primary block rounded-full"></span>
              <Tv className="w-10 h-10 text-primary" />
              Series de TV
            </h1>
            <p className="text-muted-foreground ml-8">Busca y transmite cualquier serie de televisión</p>
          </div>

          {/* Search */}
          <div className="relative mb-8">
            <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
              <Search className="w-5 h-5 text-muted-foreground" />
            </div>
            <input
              type="text"
              placeholder="Buscar series de TV..."
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              className="w-full bg-card border border-border focus:border-primary focus:ring-1 focus:ring-primary text-foreground rounded-xl pl-12 pr-4 py-4 text-base outline-none placeholder:text-muted-foreground"
              data-testid="input-series-search"
            />
            {searchLoading && (
              <div className="absolute inset-y-0 right-4 flex items-center">
                <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
              </div>
            )}

            {/* Search Results Dropdown */}
            {debouncedQuery && results.length > 0 && (
              <div className="absolute top-full left-0 right-0 z-50 mt-2 bg-card border border-border rounded-xl shadow-2xl overflow-hidden max-h-96 overflow-y-auto">
                {results.map(({ show }) => (
                  <button
                    key={show.id}
                    onClick={() => handleSelectShow(show)}
                    className="w-full flex items-center gap-4 p-4 hover:bg-secondary transition-colors text-left border-b border-border last:border-0"
                    data-testid={`result-show-${show.id}`}
                  >
                    <div className="w-12 h-16 rounded overflow-hidden bg-muted flex-shrink-0">
                      {show.image?.medium ? (
                        <img src={show.image.medium} alt={show.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Tv className="w-6 h-6 text-muted-foreground" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-foreground truncate">{show.name}</h3>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                        {show.rating.average && (
                          <span className="flex items-center gap-1">
                            <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                            {show.rating.average}
                          </span>
                        )}
                        {show.status && <span className="capitalize">{show.status}</span>}
                        {show.premiered && <span>{show.premiered.slice(0, 4)}</span>}
                      </div>
                      {show.genres.length > 0 && (
                        <div className="flex gap-1 mt-1">
                          {show.genres.slice(0, 3).map(g => (
                            <span key={g} className="text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded font-bold uppercase">
                              {g}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    {show.externals.imdb ? (
                      <Play className="w-5 h-5 text-primary flex-shrink-0" />
                    ) : (
                      <span className="text-xs text-muted-foreground flex-shrink-0">Sin IMDb</span>
                    )}
                  </button>
                ))}
              </div>
            )}

            {debouncedQuery && !searchLoading && results.length === 0 && (
              <div className="absolute top-full left-0 right-0 z-50 mt-2 bg-card border border-border rounded-xl shadow-2xl p-8 text-center">
                <p className="text-muted-foreground">No se encontraron series para "{debouncedQuery}"</p>
              </div>
            )}
          </div>

          {/* Featured / Quick Access */}
          {!selectedImdb && !selectedShow && (
            <div className="mb-10">
              <h2 className="text-2xl font-heading tracking-wide mb-4 text-muted-foreground">Acceso Rápido</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
                {FEATURED_SHOWS.map(show => (
                  <button
                    key={show.imdb}
                    onClick={() => handleSelectFeatured(show.imdb, show.name)}
                    className="bg-card border border-border hover:border-primary hover:bg-primary/5 rounded-xl p-4 text-left transition-all hover:scale-[1.02] group"
                    data-testid={`btn-featured-${show.imdb}`}
                  >
                    <Tv className="w-8 h-8 text-muted-foreground group-hover:text-primary transition-colors mb-2" />
                    <p className="text-sm font-bold text-foreground line-clamp-2">{show.name}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Selected Show + Player */}
          {selectedImdb && (
            <div className="space-y-6">
              {/* Show Info */}
              {selectedShow && (
                <div className="flex items-start gap-6 bg-card border border-border rounded-2xl p-6">
                  {selectedShow.image?.medium && (
                    <img
                      src={selectedShow.image.medium}
                      alt={selectedShow.name}
                      className="w-20 h-28 object-cover rounded-xl flex-shrink-0"
                    />
                  )}
                  <div className="flex-1">
                    <h2 className="text-3xl font-heading tracking-wide mb-1">{selectedShow.name}</h2>
                    <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground mb-2">
                      {selectedShow.rating.average && (
                        <span className="flex items-center gap-1 text-yellow-400">
                          <Star className="w-4 h-4 fill-current" />
                          {selectedShow.rating.average}
                        </span>
                      )}
                      <span className="capitalize">{selectedShow.status}</span>
                      {selectedShow.premiered && <span>{selectedShow.premiered.slice(0, 4)}</span>}
                      {selectedShow.language && <span>{selectedShow.language}</span>}
                    </div>
                    {selectedShow.genres.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {selectedShow.genres.map(g => (
                          <span key={g} className="text-xs bg-primary/20 border border-primary/30 text-primary px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                            {g}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => { setSelectedShow(null); setSelectedImdb(null); }}
                    className="text-muted-foreground hover:text-foreground text-sm transition-colors"
                  >
                    Cambiar Serie
                  </button>
                </div>
              )}

              {!selectedShow && selectedImdb && (
                <div className="flex items-center justify-between bg-card border border-border rounded-xl p-4">
                  <p className="font-bold text-foreground">Transmitiendo IMDb: {selectedImdb}</p>
                  <button
                    onClick={() => setSelectedImdb(null)}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Cambiar
                  </button>
                </div>
              )}

              {/* Episode Selector */}
              <div className="bg-card border border-border rounded-2xl p-6">
                <h3 className="text-xl font-heading tracking-wide mb-4">Seleccionar Episodio</h3>
                <div className="flex flex-wrap gap-4 items-center">
                  <div className="flex items-center gap-2">
                    <label className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Temporada</label>
                    <div className="relative">
                      <select
                        value={season}
                        onChange={e => { setSeason(Number(e.target.value)); setEpisode(1); }}
                        className="bg-background border border-border text-foreground rounded-lg pl-3 pr-8 py-2 text-sm focus:border-primary outline-none appearance-none cursor-pointer"
                        data-testid="select-season"
                      >
                        {seasonOptions.map(s => (
                          <option key={s.id} value={s.number}>Temporada {s.number}</option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <label className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Episodio</label>
                    <div className="relative">
                      <select
                        value={episode}
                        onChange={e => setEpisode(Number(e.target.value))}
                        className="bg-background border border-border text-foreground rounded-lg pl-3 pr-8 py-2 text-sm focus:border-primary outline-none appearance-none cursor-pointer"
                        data-testid="select-episode"
                      >
                        {Array.from({ length: Math.max(episodeCount ?? 20, 1) }, (_, i) => (
                          <option key={i + 1} value={i + 1}>Episodio {i + 1}</option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Server Switcher */}
              <div className="flex items-center gap-3">
                <span className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Servidor:</span>
                {SERVERS.map((srv, i) => (
                  <button
                    key={srv}
                    onClick={() => setActiveServer(i)}
                    className={`px-4 py-2 rounded-lg text-sm font-bold uppercase tracking-wider transition-all ${
                      activeServer === i
                        ? "bg-primary text-primary-foreground shadow-[0_0_12px_rgba(0,212,255,0.4)]"
                        : "bg-card border border-border text-muted-foreground hover:border-primary hover:text-primary"
                    }`}
                    data-testid={`btn-server-${i}`}
                  >
                    {srv}
                  </button>
                ))}
              </div>

              {/* Video Player */}
              <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-2xl">
                <div className="w-full aspect-video relative bg-black">
                  <iframe
                    key={`${selectedImdb}-${season}-${episode}-${activeServer}`}
                    src={getEmbedUrl(activeServer, selectedImdb)}
                    width="100%"
                    height="100%"
                    allowFullScreen
                    className="absolute inset-0 w-full h-full"
                    title={`S${season}E${episode}`}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </PageTransition>
  );
}
