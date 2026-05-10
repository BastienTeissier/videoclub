import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@repo/db", () => ({
  moviesRepository: vi.fn(),
}));

vi.mock("../../services/movie-night.js", () => ({
  movieNightService: vi.fn(),
}));

import { moviesRepository } from "@repo/db";
import { movieNightService } from "../../services/movie-night.js";
import { createCommitMovieNightTool } from "./commit-movie-night.js";

const mockFindById = vi.fn();
const mockCommit = vi.fn();

const mockMoviesRepository = vi.mocked(moviesRepository);
const mockMovieNightService = vi.mocked(movieNightService);

beforeEach(() => {
  vi.clearAllMocks();
  mockMoviesRepository.mockReturnValue({
    findById: mockFindById,
    findByIds: vi.fn(),
    searchByTitle: vi.fn(),
    searchStructured: vi.fn(),
    upsertFromTmdb: vi.fn(),
  } as ReturnType<typeof moviesRepository>);
  mockMovieNightService.mockReturnValue({
    commit: mockCommit,
  } as ReturnType<typeof movieNightService>);
});

const fakeMovie = (id: string, title: string) => ({
  id,
  tmdbId: 1,
  title,
  year: 2024,
  synopsis: null,
  genres: ["Drama"],
  cast: [],
  directors: [],
  runtime: 120,
  language: "en",
  posterUrl: null,
  backdropUrl: null,
  popularity: 10,
  releaseDate: "2024-01-01",
  createdAt: new Date("2024-01-01T00:00:00Z"),
  updatedAt: new Date("2024-01-01T00:00:00Z"),
});

const fakePlan = (overrides: Partial<{
  id: string;
  userId: string;
  runId: string;
  pickedMovieId: string;
  backupMovieIds: string[];
  reason: string | null;
}> = {}) => ({
  id: "plan-1",
  userId: "user-1",
  runId: "run-1",
  pickedMovieId: "uuid-picked",
  backupMovieIds: [],
  reason: null,
  createdAt: new Date("2025-01-01T00:00:00Z"),
  ...overrides,
});

const toolContext = {
  toolCallId: "tc1",
  messages: [],
  abortSignal: undefined as unknown as AbortSignal,
};

function makeTool(runDbId = "run-1") {
  return createCommitMovieNightTool(
    {} as Parameters<typeof createCommitMovieNightTool>[0],
    "user-1",
    runDbId,
  );
}

describe("createCommitMovieNightTool", () => {
  it("happy path — inserts row and returns success envelope", async () => {
    const picked = fakeMovie("uuid-picked", "Dune");
    mockFindById.mockResolvedValue(picked);
    mockCommit.mockResolvedValue(
      fakePlan({
        pickedMovieId: "uuid-picked",
        backupMovieIds: ["b", "c"],
        reason: "feel-good",
      }),
    );

    const t = makeTool();
    const result = await t.execute!(
      {
        pickedMovieId: "uuid-picked",
        backupMovieIds: ["b", "c"],
        reason: "feel-good",
      },
      toolContext,
    );

    expect(mockFindById).toHaveBeenCalledWith("uuid-picked");
    expect(mockCommit).toHaveBeenCalledWith({
      userId: "user-1",
      runId: "run-1",
      pickedMovieId: "uuid-picked",
      backupMovieIds: ["b", "c"],
      reason: "feel-good",
    });
    expect(result).toMatchObject({
      kind: "success",
      affected: [],
      message: "Locked in Dune for tonight.",
    });
    expect((result as { plan: { reason: string | null } }).plan.reason).toBe(
      "feel-good",
    );
    expect((result as { movie: { id: string } }).movie.id).toBe("uuid-picked");
  });

  it("empty reason → stored as null", async () => {
    const picked = fakeMovie("uuid-picked", "Dune");
    mockFindById.mockResolvedValue(picked);
    mockCommit.mockResolvedValue(
      fakePlan({ pickedMovieId: "uuid-picked", reason: null }),
    );

    const t = makeTool();
    await t.execute!(
      { pickedMovieId: "uuid-picked", backupMovieIds: [], reason: "" },
      toolContext,
    );

    expect(mockCommit).toHaveBeenCalledWith(
      expect.objectContaining({ reason: null }),
    );
  });

  it("unknown pickedMovieId → returns error not_found, no DB write", async () => {
    mockFindById.mockResolvedValue(null);

    const t = makeTool();
    const result = await t.execute!(
      {
        pickedMovieId: "uuid-missing",
        backupMovieIds: [],
        reason: "x",
      },
      toolContext,
    );

    expect(result).toMatchObject({ kind: "error", code: "not_found" });
    expect(mockCommit).not.toHaveBeenCalled();
  });

  it("empty backups → row written with empty array", async () => {
    const picked = fakeMovie("uuid-picked", "Dune");
    mockFindById.mockResolvedValue(picked);
    mockCommit.mockResolvedValue(
      fakePlan({ pickedMovieId: "uuid-picked", backupMovieIds: [] }),
    );

    const t = makeTool();
    await t.execute!(
      { pickedMovieId: "uuid-picked", backupMovieIds: [], reason: "x" },
      toolContext,
    );

    expect(mockCommit).toHaveBeenCalledWith(
      expect.objectContaining({ backupMovieIds: [] }),
    );
  });

  it("runDbId binding — row points at the supplied runDbId", async () => {
    const picked = fakeMovie("uuid-picked", "Dune");
    mockFindById.mockResolvedValue(picked);
    mockCommit.mockResolvedValue(
      fakePlan({ runId: "run-other", pickedMovieId: "uuid-picked" }),
    );

    const t = makeTool("run-other");
    await t.execute!(
      { pickedMovieId: "uuid-picked", backupMovieIds: [], reason: "x" },
      toolContext,
    );

    expect(mockCommit).toHaveBeenCalledWith(
      expect.objectContaining({ runId: "run-other" }),
    );
  });
});
