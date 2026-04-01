import { describe, it, expect, vi, beforeEach } from "vitest";

const mockAdd = vi.fn();
const mockRemove = vi.fn();
const mockListByUser = vi.fn();
const mockGetWatchlistedMovieIds = vi.fn();
const mockFindById = vi.fn();

vi.mock("@repo/db", () => ({
  watchlistRepository: vi.fn(() => ({
    add: mockAdd,
    remove: mockRemove,
    listByUser: mockListByUser,
    getWatchlistedMovieIds: mockGetWatchlistedMovieIds,
  })),
  moviesRepository: vi.fn(() => ({
    findById: mockFindById,
  })),
}));

import { watchlistService } from "./watchlist.js";

const mockDb = {} as import("@repo/db").Database;
const userId = "user-1";
const movieId = "movie-uuid-1";

beforeEach(() => {
  vi.clearAllMocks();
  mockFindById.mockResolvedValue({ title: "Arrival" });
});

describe("watchlistService", () => {
  it("add — movie not in watchlist → { added: true, message }", async () => {
    mockAdd.mockResolvedValue({ id: "wl-1", userId, movieId });

    const service = watchlistService(mockDb);
    const result = await service.add(userId, movieId);

    expect(result.added).toBe(true);
    expect(result.message).toContain("Arrival");
    expect(result.message).toContain("added to watchlist");
  });

  it("add — movie already in watchlist → { added: false, message }", async () => {
    mockAdd.mockResolvedValue(null);

    const service = watchlistService(mockDb);
    const result = await service.add(userId, movieId);

    expect(result.added).toBe(false);
    expect(result.message).toContain("already in your watchlist");
  });

  it("remove — movie in watchlist → { removed: true, message }", async () => {
    mockRemove.mockResolvedValue(1);

    const service = watchlistService(mockDb);
    const result = await service.remove(userId, movieId);

    expect(result.removed).toBe(true);
    expect(result.message).toBe("Movie removed from watchlist");
  });

  it("remove — movie not in watchlist → { removed: false, message }", async () => {
    mockRemove.mockResolvedValue(0);

    const service = watchlistService(mockDb);
    const result = await service.remove(userId, movieId);

    expect(result.removed).toBe(false);
    expect(result.message).toContain("not in your watchlist");
  });

  it("list — returns movies with count", async () => {
    const movies = [
      { id: "m1", title: "Arrival" },
      { id: "m2", title: "Dune" },
      { id: "m3", title: "Heat" },
    ];
    mockListByUser.mockResolvedValue(movies);

    const service = watchlistService(mockDb);
    const result = await service.list(userId);

    expect(result.items).toHaveLength(3);
    expect(result.count).toBe(3);
  });

  it("list — empty watchlist → { items: [], count: 0 }", async () => {
    mockListByUser.mockResolvedValue([]);

    const service = watchlistService(mockDb);
    const result = await service.list(userId);

    expect(result.items).toHaveLength(0);
    expect(result.count).toBe(0);
  });
});
