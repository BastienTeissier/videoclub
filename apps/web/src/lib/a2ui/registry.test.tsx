import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { A2UIRenderer } from "./registry";

vi.mock("@/contexts/watchlist-context", () => ({
  useWatchlist: () => ({
    isInWatchlist: () => true,
    toggleWatchlist: vi.fn(),
  }),
}));

vi.mock("@repo/ui", () => ({
  toast: vi.fn(),
}));

const fakeMovie = (id: number) => ({
  id: `00000000-0000-4000-8000-00000000000${id}`,
  tmdbId: id,
  title: `Movie ${id}`,
  year: 2024,
  synopsis: null,
  genres: null,
  cast: null,
  directors: null,
  runtime: null,
  language: null,
  posterUrl: null,
  backdropUrl: null,
  popularity: null,
  releaseDate: null,
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-01T00:00:00.000Z",
});

describe("A2UIRenderer", () => {
  it("renders matching component for known surface type", () => {
    render(
      <A2UIRenderer
        surface={{
          type: "watchlist-grid",
          items: [fakeMovie(1)],
          count: 1,
        }}
      />,
    );

    expect(screen.getByText("My Watchlist (1)")).toBeInTheDocument();
  });

  it("returns null for unknown surface type", () => {
    const { container } = render(
      <A2UIRenderer surface={{ type: "unknown-surface" }} />,
    );

    expect(container.innerHTML).toBe("");
  });

  it("returns null for invalid payload", () => {
    const { container } = render(
      <A2UIRenderer
        surface={{
          type: "watchlist-grid",
          // missing required fields
        }}
      />,
    );

    expect(container.innerHTML).toBe("");
  });
});
