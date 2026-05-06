export interface TmdbTrendingItem {
  tmdb_id: number;
  media_type: "movie" | "tv";
  title: string;
  poster_url: string;
  backdrop_url: string;
  year: string;
  rating: number;
  overview: string;
}

export interface TmdbTrailerItem {
  tmdb_id: number;
  title: string;
  backdrop_url: string;
  poster_url: string;
  year: string;
  trailer_key: string;
  trailer_name: string;
  youtube_url: string;
  thumbnail_url: string;
}

export interface DynamicSaga {
  collection_id: number;
  collection_name: string;
}

export interface SagaConfigRow {
  id: string;
  label: string;
  collection_id: number | null;
  keywords: string[];
  active: boolean;
}
