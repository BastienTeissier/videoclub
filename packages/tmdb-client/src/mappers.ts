import type { TmdbMovieDetails } from "./types.js";

export interface TmdbMovieMapped {
  tmdbId: number;
  title: string;
  year: number | null;
  synopsis: string | null;
  genres: string[];
  cast: string[];
  directors: string[];
  runtime: number | null;
  language: string;
  posterUrl: string | null;
  backdropUrl: string | null;
  popularity: number;
  releaseDate: string | null;
}

export function mapTmdbToNewMovie(details: TmdbMovieDetails): TmdbMovieMapped {
  const year = details.release_date
    ? parseInt(details.release_date.split("-")[0]!, 10)
    : null;

  const credits = details.credits ?? { cast: [], crew: [] };

  const directors = credits.crew
    .filter((c) => c.job === "Director")
    .map((c) => c.name);

  const cast = credits.cast
    .sort((a, b) => a.order - b.order)
    .slice(0, 10)
    .map((c) => c.name);

  return {
    tmdbId: details.id,
    title: details.title,
    year: isNaN(year ?? NaN) ? null : year,
    synopsis: details.overview || null,
    genres: details.genres.map((g) => g.name),
    cast,
    directors,
    runtime: details.runtime,
    language: details.original_language,
    posterUrl: details.poster_path,
    backdropUrl: details.backdrop_path,
    popularity: details.popularity,
    releaseDate: details.release_date || null,
  };
}
