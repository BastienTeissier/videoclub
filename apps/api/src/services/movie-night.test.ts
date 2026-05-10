import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCreate = vi.fn();

vi.mock("@repo/db", () => ({
  movieNightPlansRepository: vi.fn(() => ({
    create: mockCreate,
  })),
}));

import { movieNightService } from "./movie-night.js";

const mockDb = {} as import("@repo/db").Database;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("movieNightService", () => {
  it("commit proxies to repo and returns the created row", async () => {
    const created = {
      id: "plan-1",
      userId: "user-1",
      runId: "run-1",
      pickedMovieId: "movie-picked",
      backupMovieIds: ["movie-backup-1"],
      reason: "feel-good",
      createdAt: new Date("2025-01-01T00:00:00Z"),
    };
    mockCreate.mockResolvedValue(created);

    const service = movieNightService(mockDb);
    const result = await service.commit({
      userId: "user-1",
      runId: "run-1",
      pickedMovieId: "movie-picked",
      backupMovieIds: ["movie-backup-1"],
      reason: "feel-good",
    });

    expect(mockCreate).toHaveBeenCalledWith({
      userId: "user-1",
      runId: "run-1",
      pickedMovieId: "movie-picked",
      backupMovieIds: ["movie-backup-1"],
      reason: "feel-good",
    });
    expect(result).toBe(created);
  });

  it("commit preserves null reason", async () => {
    mockCreate.mockResolvedValue({
      id: "plan-2",
      userId: "user-2",
      runId: "run-2",
      pickedMovieId: "movie-picked",
      backupMovieIds: [],
      reason: null,
      createdAt: new Date(),
    });

    const service = movieNightService(mockDb);
    await service.commit({
      userId: "user-2",
      runId: "run-2",
      pickedMovieId: "movie-picked",
      backupMovieIds: [],
      reason: null,
    });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ reason: null }),
    );
  });
});
