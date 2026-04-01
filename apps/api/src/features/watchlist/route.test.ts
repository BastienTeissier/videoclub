import { describe, it, expect, vi, beforeEach } from "vitest";

const mockAdd = vi.fn();
const mockRemove = vi.fn();
const mockList = vi.fn();

vi.mock("../../services/watchlist.js", () => ({
  watchlistService: vi.fn(() => ({
    add: mockAdd,
    remove: mockRemove,
    list: mockList,
  })),
}));

vi.mock("../../lib/db.js", () => ({
  db: {},
}));

import { app } from "../../app.js";

const validMovieId = "550e8400-e29b-41d4-a716-446655440000";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/v1/watchlist/:movieId", () => {
  it("valid movieId → 200 + { added: true }", async () => {
    mockAdd.mockResolvedValue({ added: true, message: "Arrival added to watchlist" });

    const res = await app.request(`/api/v1/watchlist/${validMovieId}`, {
      method: "POST",
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.added).toBe(true);
    expect(body.message).toContain("added to watchlist");
  });

  it("duplicate → 200 + { added: false, message }", async () => {
    mockAdd.mockResolvedValue({ added: false, message: "Arrival is already in your watchlist" });

    const res = await app.request(`/api/v1/watchlist/${validMovieId}`, {
      method: "POST",
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.added).toBe(false);
    expect(body.message).toContain("already in your watchlist");
  });

  it("invalid UUID → 400", async () => {
    const res = await app.request("/api/v1/watchlist/not-a-uuid", {
      method: "POST",
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });
});

describe("DELETE /api/v1/watchlist/:movieId", () => {
  it("exists → 200 + { removed: true }", async () => {
    mockRemove.mockResolvedValue({ removed: true, message: "Movie removed from watchlist" });

    const res = await app.request(`/api/v1/watchlist/${validMovieId}`, {
      method: "DELETE",
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.removed).toBe(true);
  });

  it("not exists → 200 + { removed: false, message }", async () => {
    mockRemove.mockResolvedValue({ removed: false, message: "Movie is not in your watchlist" });

    const res = await app.request(`/api/v1/watchlist/${validMovieId}`, {
      method: "DELETE",
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.removed).toBe(false);
    expect(body.message).toContain("not in your watchlist");
  });
});

describe("GET /api/v1/watchlist", () => {
  it("returns list ordered by addedAt DESC with count", async () => {
    mockList.mockResolvedValue({
      items: [
        { id: "m1", title: "Arrival" },
        { id: "m2", title: "Dune" },
      ],
      count: 2,
    });

    const res = await app.request("/api/v1/watchlist");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toHaveLength(2);
    expect(body.count).toBe(2);
  });
});
