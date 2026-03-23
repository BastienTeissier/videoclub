import { describe, it, expect, vi, beforeEach } from "vitest";
import { TmdbClient } from "./client.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

beforeEach(() => {
  mockFetch.mockReset();
});

describe("TmdbClient", () => {
  it("sends GET request with bearer auth header", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ results: [] }),
    });

    const client = new TmdbClient("test-api-key");
    await client.get("/movie/popular", { page: "1" });

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, options] = mockFetch.mock.calls[0]!;
    expect(url).toBe(
      "https://api.themoviedb.org/3/movie/popular?page=1"
    );
    expect(options.headers).toEqual({
      Authorization: "Bearer test-api-key",
      Accept: "application/json",
    });
  });

  it("returns parsed JSON on success", async () => {
    const payload = { page: 1, results: [{ id: 1 }], total_pages: 1 };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(payload),
    });

    const client = new TmdbClient("key");
    const result = await client.get("/movie/popular");
    expect(result).toEqual(payload);
  });

  it("throws on non-ok response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
    });

    const client = new TmdbClient("bad-key");
    await expect(client.get("/movie/popular")).rejects.toThrow(
      "TMDb API error: 401 Unauthorized"
    );
  });
});
