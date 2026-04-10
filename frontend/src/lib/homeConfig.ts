/**
 * Home page section configuration.
 * Edit this file to add, remove or reorder sections without touching Home.tsx.
 */

// ── Genre sections ────────────────────────────────────────────────────────────
// keywords: matched against each item's genres[] (case-insensitive substring)
// Content from TMDB arrives in Spanish (es-MX) so use Spanish genre names.

export interface GenreSection {
  id: string;
  label: string;
  keywords: string[];
}

export const GENRE_SECTIONS: GenreSection[] = [
  {
    id: "accion",
    label: "Acción",
    keywords: ["acción", "action", "acción y aventura", "action & adventure", "aventura", "adventure"],
  },
  {
    id: "comedia",
    label: "Comedia",
    keywords: ["comedia", "comedy"],
  },
  {
    id: "drama",
    label: "Drama",
    keywords: ["drama"],
  },
  {
    id: "terror",
    label: "Terror",
    keywords: ["terror", "horror"],
  },
  {
    id: "scifi",
    label: "Ciencia ficción",
    keywords: [
      "ciencia ficción",
      "science fiction",
      "sci-fi & fantasy",
      "ciencia ficción y fantasía",
      "fantasía",
      "fantasy",
    ],
  },
  {
    id: "animacion",
    label: "Animación",
    keywords: ["animación", "animation", "infantil", "familiar", "family"],
  },
  {
    id: "documental",
    label: "Documentales",
    keywords: ["documental", "documentary"],
  },
  {
    id: "crimen",
    label: "Crimen",
    keywords: ["crimen", "crime"],
  },
  {
    id: "suspenso",
    label: "Suspenso",
    keywords: ["suspenso", "thriller", "misterio", "mystery"],
  },
  {
    id: "romance",
    label: "Romance",
    keywords: ["romance", "romantic"],
  },

];

// ── Platform sections (future) ────────────────────────────────────────────────
// Requires a 'networks' field stored in the DB.
// Once the backend saves network/studio data, enable these in Home.tsx.

export interface PlatformSection {
  id: string;
  label: string;
  /** Colour used for the platform badge */
  accent: string;
  /** Network names to match against item.networks[] */
  networks: string[];
}

// ── Saga sections ─────────────────────────────────────────────────────────────
// keywords: matched against each item's title (case-insensitive substring)
// NOTA: Se recomienda usar palabras clave variadas para capturar diferentes formatos de títulos

export interface SagaSection {
  id: string;
  label: string;
  keywords: string[];
  collection_id?: number;
}

export const SAGA_SECTIONS: SagaSection[] = [
  { id: "marvel", label: "Universo Marvel", collection_id: 420, keywords: ["iron man", "vengadores", "avengers", "capitán américa", "captain america", "thor", "hulk", "black widow", "doctor strange", "spider-man", "spiderman", "guardians of the galaxy", "guardianes de la galaxia", "ant-man", "antman", "black panther", "eternals", "shang-chi", "shangchi", "wakanda", "marvel"] },
  { id: "dc", label: "DC Universe", keywords: ["batman", "superman", "wonder woman", "aquaman", "the flash", "shazam", "black adam", "joker", "suicide squad", "birds of prey", "green lantern", "dc universe"] },
  { id: "harry-potter", label: "Harry Potter", collection_id: 1241, keywords: ["harry potter", "animales fantásticos", "fantastic beasts", "potter"] },
  { id: "lord-of-the-rings", label: "El Señor de los Anillos", collection_id: 119, keywords: ["señor de los anillos", "lord of the rings", "hobbit", "anillos", "rings"] },
  { id: "star-wars", label: "Star Wars", collection_id: 10, keywords: ["star wars", "mandalorian", "andor", "obi-wan", "obiwan", "boba fett", "ahsoka", "clone wars", "skywalker"] },
  { id: "fast-furious", label: "Fast & Furious", collection_id: 9735, keywords: ["fast & furious", "fast and furious", "2 fast 2 furious", "tokyo drift", "fast five", "furious 6", "furious 7", "furious seven", "fate of the furious", "hobbs & shaw", "hobbs and shaw"] },
  { id: "mission-impossible", label: "Misión: Imposible", collection_id: 87359, keywords: ["mission: impossible", "mission impossible", "misión: imposible", "mision: imposible", "mision imposible"] },
  { id: "john-wick", label: "John Wick", collection_id: 404609, keywords: ["john wick", "continental", "wick"] },
  { id: "jurassic", label: "Jurassic Park", collection_id: 328, keywords: ["jurassic park", "jurassic world", "jurassic"] },
  { id: "transformers", label: "Transformers", collection_id: 8650, keywords: ["transformers", "bumblebee", "transformer"] },
  { id: "x-men", label: "X-Men", collection_id: 748, keywords: ["x-men", "xmen", "wolverine", "deadpool", "logan", "magneto", "professor x"] },
  { id: "yellowstone", label: "Universo Yellowstone", keywords: ["yellowstone", "1883", "1923", "marshals"] },
  { id: "alien", label: "Alien", collection_id: 8091, keywords: ["alien", "aliens", "prometheus", "covenant", "predator"] },
  { id: "indiana-jones", label: "Indiana Jones", collection_id: 84, keywords: ["indiana jones", "indiana"] },
  { id: "pirates", label: "Piratas del Caribe", collection_id: 295, keywords: ["piratas del caribe", "pirates of the caribbean", "pirates caribbean", "caribe"] },
  { id: "terminator", label: "Terminator", collection_id: 528, keywords: ["terminator"] },
  { id: "matrix", label: "Matrix", collection_id: 2344, keywords: ["matrix", "the matrix"] },
  { id: "planet-of-apes", label: "El Planeta de los Simios", collection_id: 173710, keywords: ["planet of the apes", "planeta de los simios", "kingdom of the planet", "apes"] },
  { id: "despicable", label: "Mi Villano Favorito", collection_id: 86066, keywords: ["despicable me", "despicable", "mi villano favorito", "minions", "gru"] },
  { id: "toy-story", label: "Toy Story", collection_id: 10194, keywords: ["toy story", "buzz lightyear", "woody"] },
  { id: "ice-age", label: "La Era del Hielo", collection_id: 8741, keywords: ["ice age", "era del hielo", "scrat"] },
  { id: "shrek", label: "Shrek", collection_id: 3733, keywords: ["shrek", "puss in boots", "puss", "el gato con botas", "gato con botas"] },
  { id: "hunger-games", label: "Los Juegos del Hambre", collection_id: 131635, keywords: ["hunger games", "juegos del hambre", "catching fire", "mockingjay", "ballad of songbirds", "katniss"] },
  { id: "twilight", label: "Crepúsculo", collection_id: 33514, keywords: ["twilight", "crepúsculo", "crepusculo", "new moon", "eclipse", "breaking dawn"] },
  { id: "bourne", label: "Jason Bourne", collection_id: 31562, keywords: ["bourne", "jason bourne"] },
  { id: "rocky-creed", label: "Rocky / Creed", collection_id: 1575, keywords: ["rocky", "creed"] },
  { id: "james-bond", label: "James Bond 007", collection_id: 645, keywords: ["james bond", "007", "skyfall", "spectre", "casino royale", "no time to die", "quantum of solace", "bond"] },
];

export const PLATFORM_SECTIONS: PlatformSection[] = [
  {
    id: "netflix",
    label: "Netflix",
    accent: "#E50914",
    networks: ["Netflix"],
  },
  {
    id: "disney",
    label: "Disney+",
    accent: "#0063E5",
    networks: ["Disney+", "Disney Channel", "National Geographic", "Freeform"],
  },
  {
    id: "hbo",
    label: "HBO / Max",
    accent: "#8B2FC9",
    networks: ["HBO", "Max", "Cinemax"],
  },
  {
    id: "amazon",
    label: "Prime Video",
    accent: "#00A8E1",
    networks: ["Amazon", "Prime Video", "Amazon Prime Video"],
  },
  {
    id: "apple",
    label: "Apple TV+",
    accent: "#555555",
    networks: ["Apple TV+", "Apple TV Plus"],
  },
  {
    id: "paramount",
    label: "Paramount+",
    accent: "#0064FF",
    networks: ["Paramount+", "Paramount Network", "Paramount"],
  },
  {
    id: "warner",
    label: "Warner Bros.",
    accent: "#004B87",
    networks: ["Warner Bros.", "Warner Bros. Pictures", "Warner TV", "WB"],
  },
  {
    id: "universal",
    label: "Universal",
    accent: "#ff0000",
    networks: ["Universal Pictures", "Universal"],
  },
  {
    id: "sony",
    label: "Sony Pictures",
    accent: "#000000",
    networks: ["Sony Pictures", "Columbia Pictures", "TriStar Pictures"],
  },
  {
    id: "fox",
    label: "20th Century Fox",
    accent: "#003366",
    networks: ["20th Century Fox", "20th Century Studios", "Fox"],
  },
  {
    id: "bbc",
    label: "BBC",
    accent: "#B80000",
    networks: ["BBC", "BBC One", "BBC Two", "BBC America"],
  },
];

// ── Custom sections ───────────────────────────────────────────────────────────

export interface CustomSection {
  id: string;
  label: string;
  type: "classics" | "old-animation" | "estrenos";
}

export const CUSTOM_SECTIONS: CustomSection[] = [
  {
    id: "estrenos",
    label: "🎬 Estrenos",
    type: "estrenos",
  },
  {
    id: "clasicas",
    label: "Clásicas",
    type: "classics",
  },
  {
    id: "animadas-antiguas",
    label: "Animadas Antiguas",
    type: "old-animation",
  },
];
