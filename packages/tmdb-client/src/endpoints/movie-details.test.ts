import { describe, it, expect, vi, beforeEach } from "vitest";
import { TmdbClient } from "../client.js";
import { getMovieDetails } from "./movie-details.js";

vi.mock("../client.js", () => ({
  TmdbClient: vi.fn(),
}));

describe("getMovieDetails", () => {
  let client: TmdbClient;
  const mockGet = vi.fn();

  beforeEach(() => {
    mockGet.mockReset();
    client = { get: mockGet } as unknown as TmdbClient;
  });

  it("calls /movie/:id with credits appended", async () => {
    const details = {
      id: 550,
      title: "Fight Club",
      credits: { cast: [], crew: [] },
    };
    mockGet.mockResolvedValueOnce(details);

    const result = await getMovieDetails(client, 550);

    expect(mockGet).toHaveBeenCalledWith("/movie/550", {
      append_to_response: "credits",
    });
    expect(result).toEqual(details);
  });
});
