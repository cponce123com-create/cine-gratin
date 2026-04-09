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

export interface SagaSection {
  id: string;
  label: string;
  keywords: string[];
}

export const SAGA_SECTIONS: SagaSection[] = [
  { id: "marvel", label: "Universo Marvel", keywords: ["iron man", "vengadores", "avengers", "capitán américa", "captain america", "thor", "hulk", "black widow", "doctor strange", "spider-man", "guardians of the galaxy", "guardianes de la galaxia", "ant-man", "black panther", "eternals", "shang-chi", "wakanda"] },
  { id: "dc", label: "DC Universe", keywords: ["batman", "superman", "wonder woman", "aquaman", "the flash", "shazam", "black adam", "joker", "suicide squad", "birds of prey", "green lantern"] },
  { id: "harry-potter", label: "Harry Potter", keywords: ["harry potter", "animales fantásticos", "fantastic beasts"] },
  { id: "lord-of-the-rings", label: "El Señor de los Anillos", keywords: ["señor de los anillos", "lord of the rings", "hobbit"] },
  { id: "star-wars", label: "Star Wars", keywords: ["star wars", "mandalorian", "andor", "obi-wan", "boba fett", "ahsoka", "clone wars"] },
  { id: "fast-furious", label: "Fast & Furious", keywords: ["fast & furious", "rápido y furioso", "fast and furious", "hobbs & shaw"] },
  { id: "mission-impossible", label: "Misión: Imposible", keywords: ["mission: impossible", "misión: imposible", "mission impossible"] },
  { id: "john-wick", label: "John Wick", keywords: ["john wick", "continental"] },
  { id: "jurassic", label: "Jurassic Park", keywords: ["jurassic park", "jurassic world", "jurassic"] },
  { id: "transformers", label: "Transformers", keywords: ["transformers", "bumblebee"] },
  { id: "x-men", label: "X-Men", keywords: ["x-men", "wolverine", "deadpool", "logan", "magneto"] },
  { id: "yellowstone", label: "Universo Yellowstone", keywords: ["yellowstone", "1883", "1923"] },
  { id: "alien", label: "Alien", keywords: ["alien", "aliens", "prometheus", "covenant", "predator"] },
  { id: "indiana-jones", label: "Indiana Jones", keywords: ["indiana jones"] },
  { id: "pirates", label: "Piratas del Caribe", keywords: ["piratas del caribe", "pirates of the caribbean"] },
  { id: "terminator", label: "Terminator", keywords: ["terminator"] },
  { id: "matrix", label: "Matrix", keywords: ["matrix", "the matrix"] },
  { id: "planet-of-apes", label: "El Planeta de los Simios", keywords: ["planet of the apes", "planeta de los simios", "kingdom of the planet"] },
  { id: "despicable", label: "Mi Villano Favorito", keywords: ["despicable me", "mi villano favorito", "minions", "gru"] },
  { id: "toy-story", label: "Toy Story", keywords: ["toy story", "buzz lightyear"] },
  { id: "ice-age", label: "La Era del Hielo", keywords: ["ice age", "era del hielo"] },
  { id: "shrek", label: "Shrek", keywords: ["shrek", "puss in boots", "el gato con botas"] },
  { id: "hunger-games", label: "Los Juegos del Hambre", keywords: ["hunger games", "juegos del hambre", "catching fire", "mockingjay", "ballad of songbirds"] },
  { id: "twilight", label: "Crepúsculo", keywords: ["twilight", "crepúsculo", "new moon", "eclipse", "breaking dawn"] },
  { id: "bourne", label: "Jason Bourne", keywords: ["bourne", "jason bourne"] },
  { id: "rocky-creed", label: "Rocky / Creed", keywords: ["rocky", "creed"] },
  { id: "james-bond", label: "James Bond 007", keywords: ["james bond", "007", "skyfall", "spectre", "casino royale", "no time to die", "quantum of solace"] },
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
