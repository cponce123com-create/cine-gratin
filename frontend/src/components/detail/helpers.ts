import type { TmdbVideo } from "@/lib/types";
import { BASE_URL } from "@/lib/api";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TmdbImage {
  url: string;
  url_original: string;
  thumb: string;
}

export interface TmdbImages {
  backdrops: TmdbImage[];
  posters: TmdbImage[];
}

export interface TmdbRecommendation {
  tmdb_id: number;
  media_type: string;
  title: string;
  poster_url: string;
  year: string;
  rating: number;
  overview: string;
}

export interface PersonProfile {
  id: number;
  name: string;
  biography: string;
  birthday: string | null;
  deathday: string | null;
  place_of_birth: string | null;
  known_for_department: string;
  profile_url: string;
  profile_photos: string[];
  known_for: {
    id: number;
    media_type: string;
    title: string;
    character: string;
    poster_url: string;
    year: string;
    rating: number;
  }[];
  all_credits: {
    id: number;
    media_type: string;
    title: string;
    character: string;
    year: string;
    poster_url?: string;
  }[];
}

// ── Video helpers ─────────────────────────────────────────────────────────────

const VIDEO_ORDER = ["Trailer", "Teaser", "Clip", "Featurette", "Behind the Scenes", "Bloopers"];

export function sortVideos(videos: TmdbVideo[]): TmdbVideo[] {
  return [...videos].sort((a, b) => {
    const ia = VIDEO_ORDER.indexOf(a.type);
    const ib = VIDEO_ORDER.indexOf(b.type);
    const orderA = ia === -1 ? 99 : ia;
    const orderB = ib === -1 ? 99 : ib;
    if (orderA !== orderB) return orderA - orderB;
    if (a.official && !b.official) return -1;
    if (!a.official && b.official) return 1;
    return 0;
  });
}

// ── Fetch helpers ─────────────────────────────────────────────────────────────

export async function fetchPerson(personId: number): Promise<PersonProfile> {
  const res = await fetch(`${BASE_URL}/api/tmdb/person/${personId}`);
  if (!res.ok) throw new Error("No se pudo cargar el perfil");
  return res.json();
}

export async function fetchImages(imdbId: string, type: "movie" | "series"): Promise<TmdbImages> {
  const res = await fetch(`${BASE_URL}/api/tmdb/images/${imdbId}?type=${type}`);
  if (!res.ok) throw new Error("No se pudieron cargar imágenes");
  return res.json();
}

export async function fetchRecommendations(
  imdbId: string,
  type: "movie" | "series",
): Promise<TmdbRecommendation[]> {
  const res = await fetch(`${BASE_URL}/api/tmdb/recommendations/${imdbId}?type=${type}`);
  if (!res.ok) return [];
  return res.json();
}
