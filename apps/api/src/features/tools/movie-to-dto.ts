import type { MovieDto } from "@repo/contracts";

export function movieToDto(movie: {
  id: string;
  tmdbId: number;
  title: string;
  year: number | null;
  synopsis: string | null;
  genres: string[] | null;
  cast: string[] | null;
  directors: string[] | null;
  runtime: number | null;
  language: string | null;
  posterUrl: string | null;
  backdropUrl: string | null;
  popularity: number | null;
  releaseDate: string | null;
  createdAt: Date;
  updatedAt: Date;
}): MovieDto {
  return {
    id: movie.id,
    tmdbId: movie.tmdbId,
    title: movie.title,
    year: movie.year,
    synopsis: movie.synopsis,
    genres: movie.genres,
    cast: movie.cast,
    directors: movie.directors,
    runtime: movie.runtime,
    language: movie.language,
    posterUrl: movie.posterUrl,
    backdropUrl: movie.backdropUrl,
    popularity: movie.popularity,
    releaseDate: movie.releaseDate,
    createdAt: movie.createdAt.toISOString(),
    updatedAt: movie.updatedAt.toISOString(),
  };
}
