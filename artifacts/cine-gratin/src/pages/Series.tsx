import { useState, useMemo } from "react";
import { useSeriesList } from "@/hooks/useApi";
import { MediaCard } from "@/components/ui/MediaCard";
import { Search, Play } from "lucide-react";
import { Input } from "@/components/ui/input";

export default function Series() {
  const { data: seriesList, isLoading } = useSeriesList();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedGenre, setSelectedGenre] = useState<string>("All");

  const genres = useMemo(() => {
    if (!seriesList) return ["All"];
    const allGenres = seriesList.flatMap(s => s.genres);
    return ["All", ...Array.from(new Set(allGenres))].sort();
  }, [seriesList]);

  const filteredSeries = useMemo(() => {
    if (!seriesList) return [];
    return seriesList.filter(series => {
      const matchesSearch = series.title.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesGenre = selectedGenre === "All" || series.genres.includes(selectedGenre);
      return matchesSearch && matchesGenre;
    });
  }, [seriesList, searchTerm, selectedGenre]);

  if (isLoading) {
    return (
      <div className="min-h-screen pt-24 flex items-center justify-center">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
            <Play className="w-6 h-6 text-primary animate-bounce" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 pt-24 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <span className="w-2 h-8 bg-primary rounded-full inline-block"></span>
          Series
        </h1>
        
        <div className="flex flex-col sm:flex-row gap-4 w-full md:w-auto">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              type="text" 
              placeholder="Buscar series..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 bg-card border-card-border"
            />
          </div>
          
          <select 
            value={selectedGenre}
            onChange={(e) => setSelectedGenre(e.target.value)}
            className="flex h-10 w-full sm:w-48 rounded-md border border-input bg-card px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {genres.map(genre => (
              <option key={genre} value={genre}>{genre === "All" ? "Todos los géneros" : genre}</option>
            ))}
          </select>
        </div>
      </div>

      {filteredSeries.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-xl text-muted-foreground">No se encontraron series.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 md:gap-6">
          {filteredSeries.map(series => (
            <MediaCard
              key={series.id}
              id={series.id}
              title={series.title}
              posterUrl={series.poster_url}
              year={series.year}
              type="series"
            />
          ))}
        </div>
      )}
    </div>
  );
}
