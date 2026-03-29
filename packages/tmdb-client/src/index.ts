export { TmdbClient } from "./client.js";
export type {
  TmdbMovie,
  TmdbPaginatedResponse,
  TmdbMovieDetails,
  TmdbGenre,
} from "./types.js";
export {
  getPopularMovies,
  getTopRatedMovies,
  getTrendingMovies,
  getNowPlayingMovies,
  getUpcomingMovies,
  getMovieDetails,
  searchMovies,
} from "./endpoints/index.js";
export { mapTmdbMovieDetails } from "./mappers.js";
export type { TmdbMovieMapped } from "./mappers.js";
