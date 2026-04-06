interface GenreFilterProps {
  genres: string[];
  selected: string;
  onSelect: (genre: string) => void;
}

export default function GenreFilter({ genres, selected, onSelect }: GenreFilterProps) {
  return (
    <div className="flex flex-wrap gap-2">
      <button
        onClick={() => onSelect("Todos")}
        className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
          selected === "Todos"
            ? "bg-brand-red text-white"
            : "bg-brand-surface border border-brand-border text-gray-400 hover:text-white hover:border-gray-500"
        }`}
      >
        Todos
      </button>
      {genres.map((genre) => (
        <button
          key={genre}
          onClick={() => onSelect(genre)}
          className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
            selected === genre
              ? "bg-brand-red text-white"
              : "bg-brand-surface border border-brand-border text-gray-400 hover:text-white hover:border-gray-500"
          }`}
        >
          {genre}
        </button>
      ))}
    </div>
  );
}
