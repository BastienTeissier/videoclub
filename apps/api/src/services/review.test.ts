import { describe, it, expect, vi, beforeEach } from "vitest";

const mockUpsert = vi.fn();
const mockDelete = vi.fn();
const mockFindByUserAndMovie = vi.fn();
const mockListByUser = vi.fn();
const mockFindById = vi.fn();

vi.mock("@repo/db", () => ({
  reviewsRepository: vi.fn(() => ({
    upsert: mockUpsert,
    delete: mockDelete,
    findByUserAndMovie: mockFindByUserAndMovie,
    listByUser: mockListByUser,
  })),
  moviesRepository: vi.fn(() => ({
    findById: mockFindById,
  })),
}));

import { reviewService } from "./review.js";

const mockDb = {} as import("@repo/db").Database;
const userId = "user-1";
const movieId = "550e8400-e29b-41d4-a716-446655440000";

const sampleRow = {
  id: "rev-1",
  userId,
  movieId,
  rating: 4.5,
  text: "Loved it",
  createdAt: new Date("2026-04-01T00:00:00Z"),
  updatedAt: new Date("2026-04-02T00:00:00Z"),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockFindById.mockResolvedValue({ title: "Arrival" });
});

describe("reviewService", () => {
  it("upsert — returns review + insert message", async () => {
    mockUpsert.mockResolvedValue(sampleRow);
    const service = reviewService(mockDb);
    const result = await service.upsert(userId, movieId, { rating: 4.5 });
    expect(result.review.rating).toBe(4.5);
    expect(result.review.id).toBe("rev-1");
    expect(result.message).toBe("Review saved for Arrival");
  });

  it("upsert — returns review + update message on subsequent call", async () => {
    mockUpsert.mockResolvedValue({ ...sampleRow, rating: 3 });
    const service = reviewService(mockDb);
    const result = await service.upsert(userId, movieId, {
      rating: 3,
      text: "ok",
    });
    expect(result.review.rating).toBe(3);
    expect(result.message).toBe("Review saved for Arrival");
  });

  it("delete — row absent returns { deleted: false, message }", async () => {
    mockDelete.mockResolvedValue(0);
    const service = reviewService(mockDb);
    const result = await service.delete(userId, movieId);
    expect(result.deleted).toBe(false);
    expect(result.message).toContain("No review found");
  });

  it("delete — row present returns { deleted: true, friendly message }", async () => {
    mockDelete.mockResolvedValue(1);
    const service = reviewService(mockDb);
    const result = await service.delete(userId, movieId);
    expect(result.deleted).toBe(true);
    expect(result.message).toBe("Review deleted for Arrival");
  });

  it("get — row absent returns { review: null }", async () => {
    mockFindByUserAndMovie.mockResolvedValue(null);
    const service = reviewService(mockDb);
    const result = await service.get(userId, movieId);
    expect(result.review).toBeNull();
  });

  it("get — row present returns ReviewDto", async () => {
    mockFindByUserAndMovie.mockResolvedValue(sampleRow);
    const service = reviewService(mockDb);
    const result = await service.get(userId, movieId);
    expect(result.review?.rating).toBe(4.5);
    expect(result.review?.text).toBe("Loved it");
  });

  it("listRatings — maps rows to (movieId, rating) shape", async () => {
    mockListByUser.mockResolvedValue([
      { ...sampleRow, movieId: "m1", rating: 4 },
      { ...sampleRow, movieId: "m2", rating: 2.5 },
    ]);
    const service = reviewService(mockDb);
    const result = await service.listRatings(userId);
    expect(result.count).toBe(2);
    expect(result.items).toEqual([
      { movieId: "m1", rating: 4 },
      { movieId: "m2", rating: 2.5 },
    ]);
  });
});
