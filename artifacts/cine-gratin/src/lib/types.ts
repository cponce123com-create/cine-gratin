export interface VideoSource {
  label: string;
  url: string;
  type: string;
}

export interface SeasonData {
  season: number;
  name: string;
  episodes: number;
}

export interface Movie {
  id: string;
  imdb_id?: string;
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

export interface Series {
  id: string;
  imdb_id?: string;
  title: string;
  synopsis: string;
  year: number;
  end_year?: number;
  genres: string[];
  rating: number;
  total_seasons?: number;
  seasons_data?: SeasonData[];
  poster_url: string;
  background_url: string;
  featured?: boolean;
}
