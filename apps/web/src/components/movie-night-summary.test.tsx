import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  SURFACE_IDS,
  VIDEOCLUB_CATALOG_ID,
  type MovieDto,
} from "@repo/contracts";
import { applyMessage, clearAllSurfaces } from "@/lib/a2ui/store";
import { MovieNightSummary } from "./movie-night-summary";

const movieA: MovieDto = {
  id: "11111111-1111-4111-8111-111111111111",
  tmdbId: 1,
  title: "Dune",
  year: 2021,
  synopsis: null,
  genres: null,
  cast: null,
  directors: null,
  runtime: 120,
  language: null,
  posterUrl: null,
  backdropUrl: null,
  popularity: null,
  releaseDate: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const movieB: MovieDto = { ...movieA, id: "22222222-2222-4222-8222-222222222222", title: "Arrival", year: 2016 };

beforeEach(() => {
  clearAllSurfaces();
});

function seedSurface(movies: MovieDto[]) {
  applyMessage({
    createSurface: {
      surfaceId: SURFACE_IDS.discovery,
      catalogId: VIDEOCLUB_CATALOG_ID,
    },
  });
  applyMessage({
    updateDataModel: {
      surfaceId: SURFACE_IDS.discovery,
      path: "/movies",
      value: movies,
    },
  });
}

describe("MovieNightSummary", () => {
  it("renders picked + backup titles when surface has the movies", () => {
    seedSurface([movieA, movieB]);
    render(
      <MovieNightSummary
        pickedMovieId={movieA.id}
        backupMovieIds={[movieB.id]}
      />,
    );
    expect(screen.getByText(/Dune \(2021\)/)).toBeInTheDocument();
    expect(screen.getByText(/Arrival \(2016\)/)).toBeInTheDocument();
  });

  it("falls back to ids when titles are missing from the surface", () => {
    seedSurface([]);
    render(
      <MovieNightSummary
        pickedMovieId={movieA.id}
        backupMovieIds={[movieB.id]}
      />,
    );
    expect(screen.getByText(new RegExp(movieA.id))).toBeInTheDocument();
    expect(screen.getByText(new RegExp(movieB.id))).toBeInTheDocument();
  });
});
