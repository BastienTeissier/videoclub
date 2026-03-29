import { createMovieListEndpoint } from "./create-movie-list-endpoint.js";

export const getNowPlayingMovies = createMovieListEndpoint("/movie/now_playing");
