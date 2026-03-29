import { describe, it, expect } from "vitest";
import { mapTmdbToNewMovie } from "./mappers.js";
import type { TmdbMovieDetails } from "./types.js";

const sampleDetails: TmdbMovieDetails = {
  id: 550,
  title: "Fight Club",
  overview: "An insomniac office worker and a devil-may-care soap maker form an underground fight club.",
  release_date: "1999-10-15",
  genres: [
    { id: 18, name: "Drama" },
    { id: 53, name: "Thriller" },
  ],
  original_language: "en",
  popularity: 61.4,
  poster_path: "/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg",
  backdrop_path: "/hZkgoQYus5dXo3H8T7Uef6DNknx.jpg",
  runtime: 139,
  credits: {
    cast: [
      { name: "Brad Pitt", order: 0 },
      { name: "Edward Norton", order: 1 },
      { name: "Helena Bonham Carter", order: 2 },
    ],
    crew: [
      { name: "David Fincher", job: "Director" },
      { name: "Jim Uhls", job: "Screenplay" },
    ],
  },
};

describe("mapTmdbToNewMovie", () => {
  it("maps TMDb details to TmdbMovieMapped shape", () => {
    const result = mapTmdbToNewMovie(sampleDetails);

    expect(result).toEqual({
      tmdbId: 550,
      title: "Fight Club",
      year: 1999,
      synopsis: "An insomniac office worker and a devil-may-care soap maker form an underground fight club.",
      genres: ["Drama", "Thriller"],
      cast: ["Brad Pitt", "Edward Norton", "Helena Bonham Carter"],
      directors: ["David Fincher"],
      runtime: 139,
      language: "en",
      posterUrl: "/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg",
      backdropUrl: "/hZkgoQYus5dXo3H8T7Uef6DNknx.jpg",
      popularity: 61.4,
      releaseDate: "1999-10-15",
    });
  });

  it("handles missing release_date", () => {
    const noDate = { ...sampleDetails, release_date: "" };
    const result = mapTmdbToNewMovie(noDate);

    expect(result.year).toBeNull();
    expect(result.releaseDate).toBeNull();
  });

  it("limits cast to top 10 by order", () => {
    const manyCast: TmdbMovieDetails = {
      ...sampleDetails,
      credits: {
        crew: sampleDetails.credits!.crew,
        cast: Array.from({ length: 20 }, (_, i) => ({
          name: `Actor ${i}`,
          order: i,
        })),
      },
    };

    const result = mapTmdbToNewMovie(manyCast);
    expect(result.cast).toHaveLength(10);
    expect(result.cast[0]).toBe("Actor 0");
    expect(result.cast[9]).toBe("Actor 9");
  });

  it("filters only directors from crew", () => {
    const result = mapTmdbToNewMovie(sampleDetails);
    expect(result.directors).toEqual(["David Fincher"]);
  });

  it("handles missing credits gracefully", () => {
    const { credits: _, ...noCredits } = sampleDetails;
    const result = mapTmdbToNewMovie(noCredits as typeof sampleDetails);

    expect(result.cast).toEqual([]);
    expect(result.directors).toEqual([]);
  });
});
