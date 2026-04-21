import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { WatchlistGrid } from "./watchlist-grid";
import type { WatchlistGridSurface } from "@repo/contracts";

const mockIsInWatchlist = vi.fn();

vi.mock("@/contexts/watchlist-context", () => ({
  useWatchlist: () => ({
    isInWatchlist: mockIsInWatchlist,
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

describe("WatchlistGrid", () => {
  it("renders header with filtered count", () => {
    mockIsInWatchlist.mockReturnValue(true);

    const data: WatchlistGridSurface = {
      type: "watchlist-grid",
      items: [fakeMovie(1), fakeMovie(2), fakeMovie(3), fakeMovie(4), fakeMovie(5)],
      count: 5,
    };

    render(<WatchlistGrid data={data} />);

    expect(screen.getByText("My Watchlist (5)")).toBeInTheDocument();
  });

  it("renders poster cards for active items", () => {
    mockIsInWatchlist.mockReturnValue(true);

    const data: WatchlistGridSurface = {
      type: "watchlist-grid",
      items: [fakeMovie(1), fakeMovie(2), fakeMovie(3)],
      count: 3,
    };

    render(<WatchlistGrid data={data} />);

    expect(screen.getByText("Movie 1")).toBeInTheDocument();
    expect(screen.getByText("Movie 2")).toBeInTheDocument();
    expect(screen.getByText("Movie 3")).toBeInTheDocument();
  });

  it("renders empty-state message", () => {
    const data: WatchlistGridSurface = {
      type: "watchlist-grid",
      items: [],
      count: 0,
      message: "Your watchlist is empty. Search for movies to get started!",
    };

    render(<WatchlistGrid data={data} />);

    expect(
      screen.getByText(
        "Your watchlist is empty. Search for movies to get started!",
      ),
    ).toBeInTheDocument();
  });

  it("renders error message without grid", () => {
    const data: WatchlistGridSurface = {
      type: "watchlist-grid",
      items: [],
      count: 0,
      error: true,
      message:
        "Sorry, I couldn't load your watchlist right now. Please try again.",
    };

    render(<WatchlistGrid data={data} />);

    expect(
      screen.getByText(
        "Sorry, I couldn't load your watchlist right now. Please try again.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("My Watchlist")).not.toBeInTheDocument();
  });

  it("filters out items removed from context", () => {
    mockIsInWatchlist.mockImplementation((id: string) => id !== "00000000-0000-4000-8000-000000000002");

    const data: WatchlistGridSurface = {
      type: "watchlist-grid",
      items: [fakeMovie(1), fakeMovie(2), fakeMovie(3)],
      count: 3,
    };

    render(<WatchlistGrid data={data} />);

    expect(screen.getByText("My Watchlist (2)")).toBeInTheDocument();
    expect(screen.getByText("Movie 1")).toBeInTheDocument();
    expect(screen.queryByText("Movie 2")).not.toBeInTheDocument();
    expect(screen.getByText("Movie 3")).toBeInTheDocument();
  });
});
