import { describe, it, expect, vi, beforeEach } from "vitest";

const mockAdd = vi.fn();
const mockRemove = vi.fn();
const mockListByUser = vi.fn();
const mockGetWatchlistedMovieIds = vi.fn();

vi.mock("@repo/db", () => ({
  watchlistRepository: vi.fn(() => ({
    add: mockAdd,
    remove: mockRemove,
    listByUser: mockListByUser,
    getWatchlistedMovieIds: mockGetWatchlistedMovieIds,
  })),
  movies: { id: "id", title: "title" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((...args: unknown[]) => ({ type: "eq", args })),
}));

const mockDbSelect = vi.fn();
const mockDbFrom = vi.fn();
const mockDbWhere = vi.fn();
const mockDbLimit = vi.fn();

const mockDb = {
  select: mockDbSelect,
} as unknown as import("@repo/db").Database;

mockDbSelect.mockReturnValue({ from: mockDbFrom });
mockDbFrom.mockReturnValue({ where: mockDbWhere });
mockDbWhere.mockReturnValue({ limit: mockDbLimit });

import { watchlistService } from "./watchlist.js";

const userId = "user-1";
const movieId = "movie-uuid-1";

beforeEach(() => {
  vi.clearAllMocks();
  mockDbSelect.mockReturnValue({ from: mockDbFrom });
  mockDbFrom.mockReturnValue({ where: mockDbWhere });
  mockDbWhere.mockReturnValue({ limit: mockDbLimit });
  mockDbLimit.mockResolvedValue([{ title: "Arrival" }]);
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
