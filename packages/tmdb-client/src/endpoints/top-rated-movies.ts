import { createMovieListEndpoint } from "./create-movie-list-endpoint.js";

export const getTopRatedMovies = createMovieListEndpoint("/movie/top_rated");
