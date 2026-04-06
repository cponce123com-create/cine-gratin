export interface VideoSource {
  label: string;
  url: string;
  type: string;
}

export interface Movie {
  id: string;
  title: string;
  synopsis: string;
  year: number;
  genres: string[];
  rating: number;
  duration_min: number;
  poster_url: string;
  background_url: string;
  trailer_url: string;
  video_sources: VideoSource[];
  featured?: boolean;
}

export interface Episode {
  number: number;
  title: string;
  duration_min: number;
  video_sources: VideoSource[];
}

export interface Season {
  number: number;
  episodes: Episode[];
}

export interface Series {
  id: string;
  title: string;
  synopsis: string;
  year: number;
  genres: string[];
  rating: number;
  seasons: Season[];
  poster_url: string;
  background_url: string;
  featured?: boolean;
}
