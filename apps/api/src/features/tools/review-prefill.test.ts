import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@repo/db", () => ({
  moviesRepository: vi.fn(),
}));

import { moviesRepository } from "@repo/db";
import { createReviewPrefillTool } from "./review-prefill.js";

const mockFindById = vi.fn();
const mockSearchStructured = vi.fn();

const mockMoviesRepository = vi.mocked(moviesRepository);

beforeEach(() => {
  vi.clearAllMocks();
  mockMoviesRepository.mockReturnValue({
    findById: mockFindById,
    findByIds: vi.fn(),
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
  return createReviewPrefillTool(
    {} as Parameters<typeof createReviewPrefillTool>[0],
    "user-1",
  );
}

const toolContext = {
  toolCallId: "tc1",
  messages: [],
  abortSignal: undefined as unknown as AbortSignal,
};

describe("createReviewPrefillTool", () => {
  it("movieId provided — emits review-form surface (data + a2uiMessages), skips search", async () => {
    const movie = fakeMovie(1);
    mockFindById.mockResolvedValue(movie);

    const tool = makeTool();
    const result = await tool.execute!(
      { title: "Movie 1", movieId: "uuid-1", rating: 4.5, text: "loved it" },
      toolContext,
    );

    expect(mockFindById).toHaveBeenCalledWith("uuid-1");
    expect(mockSearchStructured).not.toHaveBeenCalled();

    const r = result as {
      data: { movie: { id: string }; rating: number; text?: string };
      a2uiMessages: unknown[];
    };
    expect(r.data.movie.id).toBe("uuid-1");
    expect(r.data.rating).toBe(4.5);
    expect(r.data.text).toBe("loved it");
    expect(Array.isArray(r.a2uiMessages)).toBe(true);
    expect(r.a2uiMessages.length).toBeGreaterThan(0);
  });

  it("movieId provided but movie missing — returns kind:error code:not_found", async () => {
    mockFindById.mockResolvedValue(null);

    const tool = makeTool();
    const result = await tool.execute!(
      { title: "Movie 1", movieId: "uuid-missing", rating: 4 },
      toolContext,
    );

    expect(result).toMatchObject({ kind: "error", code: "not_found" });
    expect((result as { message: string }).message).toContain("uuid-missing");
  });

  it("title only, 1 match — emits review-form surface", async () => {
    const movie = fakeMovie(1);
    mockSearchStructured.mockResolvedValue([movie]);

    const tool = makeTool();
    const result = await tool.execute!(
      { title: "Movie 1", rating: 3.5, text: "ok" },
      toolContext,
    );

    expect(mockSearchStructured).toHaveBeenCalledWith({ title: "Movie 1" });
    const r = result as {
      data: { movie: { id: string }; rating: number; text?: string };
      a2uiMessages: unknown[];
    };
    expect(r.data.movie.id).toBe("uuid-1");
    expect(r.data.rating).toBe(3.5);
    expect(r.data.text).toBe("ok");
    expect(r.a2uiMessages.length).toBeGreaterThan(0);
  });

  it("title only, 0 matches — returns kind:error code:not_found", async () => {
    mockSearchStructured.mockResolvedValue([]);

    const tool = makeTool();
    const result = await tool.execute!(
      { title: "Unknown", rating: 4 },
      toolContext,
    );

    expect(result).toMatchObject({ kind: "error", code: "not_found" });
    expect((result as { message: string }).message).toContain("Unknown");
    expect((result as { message: string }).message).toContain(
      "Search for it first",
    );
  });

  it("title only, multiple matches — returns kind:needs-clarification with candidates", async () => {
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

    expect(result).toMatchObject({ kind: "needs-clarification" });
    expect((result as { candidates: unknown[] }).candidates).toHaveLength(3);
  });

  it("searchStructured throws — returns kind:error code:service_error", async () => {
    mockSearchStructured.mockRejectedValue(new Error("DB down"));

    const tool = makeTool();
    const result = await tool.execute!(
      { title: "Movie 1", rating: 4 },
      toolContext,
    );

    expect(result).toMatchObject({ kind: "error", code: "service_error" });
  });

  it("text omitted — surface data has no text field", async () => {
    const movie = fakeMovie(1);
    mockSearchStructured.mockResolvedValue([movie]);

    const tool = makeTool();
    const result = await tool.execute!(
      { title: "Movie 1", rating: 3 },
      toolContext,
    );

    const r = result as {
      data: { movie: { id: string }; rating: number; text?: string };
    };
    expect(r.data.rating).toBe(3);
    expect(r.data.text).toBeUndefined();
  });
});
