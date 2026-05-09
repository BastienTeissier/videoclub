import { describe, expect, it } from "vitest";
import {
  mutationOutcomeSchema,
  wireMutationOutcomeSchema,
} from "./mutation-outcome.js";

const validMovie = {
  id: "11111111-1111-4111-8111-111111111111",
  tmdbId: 1,
  title: "Test",
  year: 2020,
  synopsis: null,
  genres: null,
  cast: null,
  directors: null,
  runtime: null,
  language: null,
  posterUrl: null,
  backdropUrl: null,
  popularity: null,
  releaseDate: null,
  createdAt: "2020-01-01T00:00:00.000Z",
  updatedAt: "2020-01-01T00:00:00.000Z",
};

describe("mutationOutcomeSchema", () => {
  it("parses success with affected domains", () => {
    const result = mutationOutcomeSchema.safeParse({
      kind: "success",
      affected: ["watchlist"],
      message: "Added.",
      movie: validMovie,
    });
    expect(result.success).toBe(true);
  });

  it("parses error with closed-enum code", () => {
    const result = mutationOutcomeSchema.safeParse({
      kind: "error",
      code: "no_review",
      message: "You haven't reviewed that movie.",
    });
    expect(result.success).toBe(true);
  });

  it("parses needs-clarification with at least two candidates", () => {
    const result = mutationOutcomeSchema.safeParse({
      kind: "needs-clarification",
      candidates: [validMovie, { ...validMovie, id: "22222222-2222-4222-8222-222222222222" }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects unknown kind", () => {
    const result = mutationOutcomeSchema.safeParse({ kind: "shrug", message: "" });
    expect(result.success).toBe(false);
  });

  it("rejects success with empty affected", () => {
    const result = mutationOutcomeSchema.safeParse({
      kind: "success",
      affected: [],
      message: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects error with unknown code", () => {
    const result = mutationOutcomeSchema.safeParse({
      kind: "error",
      code: "explosion",
      message: "boom",
    });
    expect(result.success).toBe(false);
  });

  it("rejects needs-clarification with one candidate", () => {
    const result = mutationOutcomeSchema.safeParse({
      kind: "needs-clarification",
      candidates: [validMovie],
    });
    expect(result.success).toBe(false);
  });
});

describe("wireMutationOutcomeSchema", () => {
  it("rejects needs-clarification (server-only marker)", () => {
    const result = wireMutationOutcomeSchema.safeParse({
      kind: "needs-clarification",
      candidates: [validMovie, { ...validMovie, id: "22222222-2222-4222-8222-222222222222" }],
    });
    expect(result.success).toBe(false);
  });

  it("accepts success", () => {
    const result = wireMutationOutcomeSchema.safeParse({
      kind: "success",
      affected: ["reviews"],
      message: "Deleted.",
    });
    expect(result.success).toBe(true);
  });

  it("accepts error", () => {
    const result = wireMutationOutcomeSchema.safeParse({
      kind: "error",
      code: "service_error",
      message: "boom",
    });
    expect(result.success).toBe(true);
  });
});
