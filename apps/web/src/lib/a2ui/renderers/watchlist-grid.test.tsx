import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ComponentNode } from "@repo/contracts";
import { WatchlistGrid } from "./watchlist-grid";
import { applyMessage, clearAllSurfaces } from "../store";

const mockIsInWatchlist = vi.fn();

vi.mock("@/contexts/watchlist-context", () => ({
  useWatchlist: () => ({
    isInWatchlist: mockIsInWatchlist,
    toggleWatchlist: vi.fn(),
  }),
}));

vi.mock("@/contexts/review-context", () => ({
  useReviews: () => ({
    getReviewRating: () => undefined,
    upsertReview: vi.fn(),
    deleteReview: vi.fn(),
    refetch: vi.fn(),
  }),
}));

vi.mock("@repo/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@repo/ui")>();
  return { ...actual, toast: vi.fn() };
});

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

const node: ComponentNode = {
  id: "grid",
  component: "WatchlistGrid",
  data: { path: "/state" },
};

function seed(state: { items: ReturnType<typeof fakeMovie>[]; state: "ok" | "empty" | "error"; message?: string }) {
  applyMessage({ createSurface: { surfaceId: "watchlist", catalogId: "videoclub" } });
  applyMessage({
    updateDataModel: { surfaceId: "watchlist", path: "/state", value: state },
  });
}

describe("WatchlistGrid (protocol)", () => {
  beforeEach(() => {
    clearAllSurfaces();
    mockIsInWatchlist.mockReset();
  });

  it("renders header with filtered count when state=ok", () => {
    mockIsInWatchlist.mockReturnValue(true);
    seed({
      items: [fakeMovie(1), fakeMovie(2), fakeMovie(3), fakeMovie(4), fakeMovie(5)],
      state: "ok",
    });

    render(<WatchlistGrid node={node} surfaceId="watchlist" />);
    expect(screen.getByText("My Watchlist (5)")).toBeInTheDocument();
  });

  it("renders poster cards for active items", () => {
    mockIsInWatchlist.mockReturnValue(true);
    seed({
      items: [fakeMovie(1), fakeMovie(2), fakeMovie(3)],
      state: "ok",
    });

    render(<WatchlistGrid node={node} surfaceId="watchlist" />);
    expect(screen.getByText("Movie 1")).toBeInTheDocument();
    expect(screen.getByText("Movie 2")).toBeInTheDocument();
    expect(screen.getByText("Movie 3")).toBeInTheDocument();
  });

  it("renders empty-state message when state=empty", () => {
    seed({
      items: [],
      state: "empty",
      message: "Your watchlist is empty. Search for movies to get started!",
    });

    render(<WatchlistGrid node={node} surfaceId="watchlist" />);
    expect(
      screen.getByText(
        "Your watchlist is empty. Search for movies to get started!",
      ),
    ).toBeInTheDocument();
  });

  it("renders error message when state=error", () => {
    seed({
      items: [],
      state: "error",
      message:
        "Sorry, I couldn't load your watchlist right now. Please try again.",
    });

    render(<WatchlistGrid node={node} surfaceId="watchlist" />);
    expect(
      screen.getByText(
        "Sorry, I couldn't load your watchlist right now. Please try again.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/My Watchlist/)).not.toBeInTheDocument();
  });

  it("filters out items removed from context", () => {
    mockIsInWatchlist.mockImplementation(
      (id: string) => id !== "00000000-0000-4000-8000-000000000002",
    );
    seed({
      items: [fakeMovie(1), fakeMovie(2), fakeMovie(3)],
      state: "ok",
    });

    render(<WatchlistGrid node={node} surfaceId="watchlist" />);
    expect(screen.getByText("My Watchlist (2)")).toBeInTheDocument();
    expect(screen.getByText("Movie 1")).toBeInTheDocument();
    expect(screen.queryByText("Movie 2")).not.toBeInTheDocument();
    expect(screen.getByText("Movie 3")).toBeInTheDocument();
  });
});