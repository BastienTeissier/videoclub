export { TmdbClient } from "./client.js";
export type {
  TmdbMovie,
  TmdbPaginatedResponse,
  TmdbMovieDetails,
  TmdbGenre,
} from "./types.js";
export {
  getPopularMovies,
  getMovieDetails,
  searchMovies,
} from "./endpoints/index.js";
