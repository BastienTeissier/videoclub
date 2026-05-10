import { describe, expect, it } from "vitest";
import {
  clarificationInterrupt,
  commitMovieNightInterrupt,
  interruptRunFinishedResultSchema,
  interruptSchema,
} from "./interrupts";

const movieA = {
  id: "11111111-1111-4111-8111-111111111111",
  tmdbId: 1,
  title: "Test A",
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
const movieB = { ...movieA, id: "22222222-2222-4222-8222-222222222222", title: "Test B" };

describe("clarificationInterrupt", () => {
  it("builds an interrupt with candidate ids in the responseSchema enum", () => {
    const interrupt = clarificationInterrupt("call-1", [movieA, movieB]);
    expect(interrupt.id).toBe("call-1");
    expect(interrupt.reason).toBe("clarification");
    const schema = interrupt.responseSchema as {
      properties: { pickedMovieId: { enum: string[] } };
    };
    expect(schema.properties.pickedMovieId.enum).toEqual([movieA.id, movieB.id]);
  });

  it("produces a valid Interrupt per schema", () => {
    const interrupt = clarificationInterrupt("call-1", [movieA, movieB]);
    expect(interruptSchema.safeParse(interrupt).success).toBe(true);
  });
});

describe("commitMovieNightInterrupt", () => {
  it("produces a valid Interrupt with editedReason in responseSchema", () => {
    const interrupt = commitMovieNightInterrupt("call-2", {
      pickedMovieId: movieA.id,
      backupMovieIds: [movieB.id],
      reason: "vibe",
    });
    expect(interrupt.reason).toBe("approval");
    const schema = interrupt.responseSchema as {
      properties: { editedReason: { "ui:widget": string } };
    };
    expect(schema.properties.editedReason["ui:widget"]).toBe("textarea");
    expect(interruptSchema.safeParse(interrupt).success).toBe(true);
  });
});

describe("interruptRunFinishedResultSchema", () => {
  it("requires at least one interrupt", () => {
    const result = interruptRunFinishedResultSchema.safeParse({
      type: "interrupt",
      interrupts: [],
    });
    expect(result.success).toBe(false);
  });

  it("parses valid result envelope", () => {
    const result = interruptRunFinishedResultSchema.safeParse({
      type: "interrupt",
      interrupts: [clarificationInterrupt("call-1", [movieA, movieB])],
    });
    expect(result.success).toBe(true);
  });
});