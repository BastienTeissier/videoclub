import { createMovieListEndpoint } from "./create-movie-list-endpoint.js";

export const getUpcomingMovies = createMovieListEndpoint("/movie/upcoming");
