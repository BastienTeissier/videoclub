import { describe, it, expect } from "vitest";
import type { MovieDto } from "@repo/contracts";
import { resolveComparisonCells, PLACEHOLDER } from "./comparison-cells.js";

const baseMovie: MovieDto = {
  id: "id-a",
  tmdbId: 1,
  title: "A",
  year: 2020,
  synopsis: null,
  genres: ["Drama", "Sci-Fi"],
  cast: null,
  directors: ["Some Director"],
  runtime: 120,
  language: null,
  posterUrl: null,
  backdropUrl: null,
  popularity: null,
  releaseDate: null,
  createdAt: "2020-01-01T00:00:00.000Z",
  updatedAt: "2020-01-01T00:00:00.000Z",
};

describe("resolveComparisonCells", () => {
  it("resolves all known criteria for each movie", () => {
    const cells = resolveComparisonCells(
      [baseMovie],
      ["runtime", "year", "director", "genres"],
    );
    expect(cells["id-a"]).toEqual({
      runtime: "120 min",
      year: "2020",
      director: "Some Director",
      genres: "Drama, Sci-Fi",
    });
  });

  it("returns the placeholder for criteria with no known getter", () => {
    const cells = resolveComparisonCells([baseMovie], ["mood", "vibes"]);
    expect(cells["id-a"]).toEqual({
      mood: PLACEHOLDER,
      vibes: PLACEHOLDER,
    });
  });

  it("returns placeholder when the underlying movie field is null/empty", () => {
    const movieMissing: MovieDto = {
      ...baseMovie,
      id: "id-b",
      runtime: null,
      directors: null,
      genres: [],
    };
    const cells = resolveComparisonCells(
      [movieMissing],
      ["runtime", "director", "genres"],
    );
    expect(cells["id-b"]).toEqual({
      runtime: PLACEHOLDER,
      director: PLACEHOLDER,
      genres: PLACEHOLDER,
    });
  });

  it("returns an empty cells map when criteria is empty", () => {
    const cells = resolveComparisonCells([baseMovie], []);
    expect(cells).toEqual({ "id-a": {} });
  });
});
