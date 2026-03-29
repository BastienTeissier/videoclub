import { createMovieListEndpoint } from "./create-movie-list-endpoint.js";

export const getPopularMovies = createMovieListEndpoint("/movie/popular");
