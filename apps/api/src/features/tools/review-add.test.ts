import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@repo/db", () => ({
  moviesRepository: vi.fn(),
}));

import { moviesRepository } from "@repo/db";
import { createReviewAddTool } from "./review-add.js";

const mockFindById = vi.fn();
const mockSearchStructured = vi.fn();

const mockMoviesRepository = vi.mocked(moviesRepository);

beforeEach(() => {
  vi.clearAllMocks();
  mockMoviesRepository.mockReturnValue({
    findById: mockFindById,
    searchByTitle: vi.fn(),
    searchStructured: mockSearchStructured,
    upsertFromTmdb: vi.fn(),
  } as ReturnType<typeof moviesRepository>);
});

const fakeMovie = (id: number) => ({
  id: `uuid-${id}`,
  tmdbId: id,
  title: `Movie ${id}`,
  year: 2024,
  synopsis: "A movie",
  genres: ["Drama"],
  cast: ["Actor"],
  directors: ["Director"],
  runtime: 120,
  language: "en",
  posterUrl: null,
  backdropUrl: null,
  popularity: 10,
  releaseDate: "2024-01-01",
  createdAt: new Date("2024-01-01T00:00:00Z"),
  updatedAt: new Date("2024-01-01T00:00:00Z"),
});

function makeTool() {
  return createReviewAddTool(
    {} as Parameters<typeof createReviewAddTool>[0],
    "user-1",
  );
}

const toolContext = {
  toolCallId: "tc1",
  messages: [],
  abortSignal: undefined as unknown as AbortSignal,
};

describe("createReviewAddTool", () => {
  it("movieId provided — returns review-form surface, skips search", async () => {
    const movie = fakeMovie(1);
    mockFindById.mockResolvedValue(movie);

    const tool = makeTool();
    const result = await tool.execute!(
      { title: "Movie 1", movieId: "uuid-1", rating: 4.5, text: "loved it" },
      toolContext,
    );

    expect(mockFindById).toHaveBeenCalledWith("uuid-1");
    expect(mockSearchStructured).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      type: "review-form",
      rating: 4.5,
      text: "loved it",
    });
    expect((result as { movie: { id: string } }).movie.id).toBe("uuid-1");
  });

  it("movieId provided but movie missing — returns not_found", async () => {
    mockFindById.mockResolvedValue(null);

    const tool = makeTool();
    const result = await tool.execute!(
      { title: "Movie 1", movieId: "uuid-missing", rating: 4 },
      toolContext,
    );

    expect(result).toMatchObject({ error: "not_found" });
    expect((result as { message: string }).message).toContain("uuid-missing");
  });

  it("title only, 1 match — returns review-form surface", async () => {
    const movie = fakeMovie(1);
    mockSearchStructured.mockResolvedValue([movie]);

    const tool = makeTool();
    const result = await tool.execute!(
      { title: "Movie 1", rating: 3.5, text: "ok" },
      toolContext,
    );

    expect(mockSearchStructured).toHaveBeenCalledWith({ title: "Movie 1" });
    expect(result).toMatchObject({
      type: "review-form",
      rating: 3.5,
      text: "ok",
    });
    expect((result as { movie: { id: string } }).movie.id).toBe("uuid-1");
  });

  it("title only, 0 matches — returns not_found error", async () => {
    mockSearchStructured.mockResolvedValue([]);

    const tool = makeTool();
    const result = await tool.execute!(
      { title: "Unknown", rating: 4 },
      toolContext,
    );

    expect(result).toMatchObject({ error: "not_found" });
    expect((result as { message: string }).message).toContain("Unknown");
    expect((result as { message: string }).message).toContain(
      "Search for it first",
    );
  });

  it("title only, multiple matches — returns clarification with action review", async () => {
    mockSearchStructured.mockResolvedValue([
      fakeMovie(1),
      fakeMovie(2),
      fakeMovie(3),
    ]);

    const tool = makeTool();
    const result = await tool.execute!(
      { title: "Movie", rating: 4 },
      toolContext,
    );

    expect(result).toMatchObject({
      clarification_needed: true,
      action: "review",
    });
    expect((result as { candidates: unknown[] }).candidates).toHaveLength(3);
  });

  it("searchStructured throws — returns service_error", async () => {
    mockSearchStructured.mockRejectedValue(new Error("DB down"));

    const tool = makeTool();
    const result = await tool.execute!(
      { title: "Movie 1", rating: 4 },
      toolContext,
    );

    expect(result).toMatchObject({ error: "service_error" });
  });

  it("text omitted — surface has no text field", async () => {
    const movie = fakeMovie(1);
    mockSearchStructured.mockResolvedValue([movie]);

    const tool = makeTool();
    const result = await tool.execute!(
      { title: "Movie 1", rating: 3 },
      toolContext,
    );

    expect(result).toMatchObject({
      type: "review-form",
      rating: 3,
    });
    expect((result as { text?: string }).text).toBeUndefined();
  });
});
