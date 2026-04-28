import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockUpsert, mockDelete, mockGet, mockListRatings } = vi.hoisted(() => ({
  mockUpsert: vi.fn(),
  mockDelete: vi.fn(),
  mockGet: vi.fn(),
  mockListRatings: vi.fn(),
}));

vi.mock("../../services/review.js", () => ({
  reviewService: vi.fn(() => ({
    upsert: mockUpsert,
    delete: mockDelete,
    get: mockGet,
    listRatings: mockListRatings,
  })),
}));

vi.mock("../../lib/db.js", () => ({
  db: {},
}));

import { app } from "../../app.js";

const validMovieId = "550e8400-e29b-41d4-a716-446655440000";

const sampleReview = {
  id: "rev-1",
  movieId: validMovieId,
  rating: 4,
  text: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

const putReview = (movieId: string, body: unknown) =>
  app.request(`/api/v1/reviews/${movieId}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe("PUT /api/v1/reviews/:movieId", () => {
  it("valid body { rating: 4 } → 200 with review", async () => {
    mockUpsert.mockResolvedValue({
      review: sampleReview,
      message: "Review saved for Arrival",
    });
    const res = await putReview(validMovieId, { rating: 4 });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      review: { rating: number };
      message: string;
    };
    expect(body.review.rating).toBe(4);
  });

  it("valid body { rating: 4.5, text: 'Great' } updates same row → 200", async () => {
    mockUpsert.mockResolvedValue({
      review: { ...sampleReview, rating: 4.5, text: "Great" },
      message: "Review saved for Arrival",
    });
    const res1 = await putReview(validMovieId, {
      rating: 4.5,
      text: "Great",
    });
    expect(res1.status).toBe(200);

    mockUpsert.mockResolvedValue({
      review: { ...sampleReview, rating: 3, text: null },
      message: "Review saved for Arrival",
    });
    const res2 = await putReview(validMovieId, { rating: 3 });
    expect(res2.status).toBe(200);
    const body2 = (await res2.json()) as {
      review: { rating: number; text: string | null };
    };
    expect(body2.review.rating).toBe(3);
  });

  it("rating > 5 → 400", async () => {
    const res = await putReview(validMovieId, { rating: 6 });
    expect(res.status).toBe(400);
  });

  it("rating not multiple of 0.5 → 400", async () => {
    const res = await putReview(validMovieId, { rating: 3.3 });
    expect(res.status).toBe(400);
  });

  it("missing rating → 400", async () => {
    const res = await putReview(validMovieId, {});
    expect(res.status).toBe(400);
  });

  it("invalid UUID param → 400", async () => {
    const res = await putReview("not-a-uuid", { rating: 4 });
    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/v1/reviews/:movieId", () => {
  it("exists → 200 { deleted: true }", async () => {
    mockDelete.mockResolvedValue({
      deleted: true,
      message: "Review deleted for Arrival",
    });
    const res = await app.request(`/api/v1/reviews/${validMovieId}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { deleted: boolean };
    expect(body.deleted).toBe(true);
  });

  it("absent → 200 { deleted: false }", async () => {
    mockDelete.mockResolvedValue({
      deleted: false,
      message: "No review found for this movie",
    });
    const res = await app.request(`/api/v1/reviews/${validMovieId}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { deleted: boolean };
    expect(body.deleted).toBe(false);
  });
});

describe("GET /api/v1/reviews/:movieId", () => {
  it("exists → 200 { review }", async () => {
    mockGet.mockResolvedValue({ review: sampleReview });
    const res = await app.request(`/api/v1/reviews/${validMovieId}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { review: { id: string } | null };
    expect(body.review?.id).toBe("rev-1");
  });

  it("absent → 200 { review: null }", async () => {
    mockGet.mockResolvedValue({ review: null });
    const res = await app.request(`/api/v1/reviews/${validMovieId}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { review: unknown };
    expect(body.review).toBeNull();
  });
});

describe("GET /api/v1/reviews", () => {
  it("returns { items: [{ movieId, rating }], count }", async () => {
    mockListRatings.mockResolvedValue({
      items: [{ movieId: validMovieId, rating: 4 }],
      count: 1,
    });
    const res = await app.request("/api/v1/reviews");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      items: { movieId: string; rating: number }[];
      count: number;
    };
    expect(body.count).toBe(1);
    expect(body.items[0]).toEqual({ movieId: validMovieId, rating: 4 });
  });
});
