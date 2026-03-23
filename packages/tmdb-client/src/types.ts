export interface TmdbMovie {
  id: number;
  title: string;
  overview: string;
  release_date: string;
  genre_ids: number[];
  original_language: string;
  popularity: number;
  poster_path: string | null;
  backdrop_path: string | null;
  adult: boolean;
  vote_average: number;
  vote_count: number;
}

export interface TmdbPaginatedResponse<T> {
  page: number;
  results: T[];
  total_pages: number;
  total_results: number;
}

export interface TmdbMovieDetails {
  id: number;
  title: string;
  overview: string;
  release_date: string;
  genres: { id: number; name: string }[];
  original_language: string;
  popularity: number;
  poster_path: string | null;
  backdrop_path: string | null;
  runtime: number | null;
  credits?: {
    cast: { name: string; order: number }[];
    crew: { name: string; job: string }[];
  };
}

export interface TmdbGenre {
  id: number;
  name: string;
}
