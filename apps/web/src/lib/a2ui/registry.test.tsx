import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { A2UIRenderer } from "./registry";
import type { A2UIMessage } from "@repo/contracts";
import { applyMessage, clearAllSurfaces } from "./store";

function discoveryMessages(movies: ReturnType<typeof fakeMovie>[]): A2UIMessage[] {
  return [
    { createSurface: { surfaceId: "discovery", catalogId: "videoclub" } },
    {
      updateComponents: {
        surfaceId: "discovery",
        components: [
          { id: "root", component: "Column", children: ["filters", "grid"] },
          { id: "filters", component: "MovieFilterPanel", data: { path: "/filters" } },
          { id: "grid", component: "Skeleton" },
        ],
      },
    },
    { updateDataModel: { surfaceId: "discovery", path: "/filters", value: { genres: ["Comedy"] } } },
    {
      updateComponents: {
        surfaceId: "discovery",
        components: [{ id: "grid", component: "MovieGrid", data: { path: "/movies" } }],
      },
    },
    { updateDataModel: { surfaceId: "discovery", path: "/movies", value: movies } },
  ];
}

vi.mock("@/contexts/watchlist-context", () => ({
  useWatchlist: () => ({
    isInWatchlist: () => true,
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

describe("A2UIRenderer (protocol)", () => {
  beforeEach(() => {
    clearAllSurfaces();
  });

  it("renders skeleton then MovieGrid through a recorded discovery message sequence", () => {
    const messages = discoveryMessages([fakeMovie(1), fakeMovie(2)]);

    // Apply messages up to skeleton frame (first three)
    for (let i = 0; i < 3; i++) applyMessage(messages[i]!);

    const { rerender } = render(<A2UIRenderer surfaceId="discovery" />);
    // Skeleton present (no movie cards yet)
    expect(screen.queryByText("Movie 1")).not.toBeInTheDocument();
    expect(screen.getByText("Comedy")).toBeInTheDocument();

    // Apply remaining messages: real grid + /movies
    for (let i = 3; i < messages.length; i++) applyMessage(messages[i]!);
    rerender(<A2UIRenderer surfaceId="discovery" />);

    expect(screen.getByText("Movie 1")).toBeInTheDocument();
    expect(screen.getByText("Movie 2")).toBeInTheDocument();
  });

  it("renders nothing when surfaceId has no surface", () => {
    const { container } = render(<A2UIRenderer surfaceId="ghost" />);
    expect(container.innerHTML).toBe("");
  });

  it("unknown component name skips that node, sibling nodes still render", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    applyMessage({
      createSurface: { surfaceId: "x", catalogId: "videoclub" },
    });
    applyMessage({
      updateComponents: {
        surfaceId: "x",
        components: [
          { id: "root", component: "Column", children: ["a", "b"] },
          { id: "a", component: "FooBar" },
          { id: "b", component: "Skeleton" },
        ],
      },
    });

    render(<A2UIRenderer surfaceId="x" />);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("A2UIRenderer (review-form via A2UI store)", () => {
  it("renders the review form when bound to surface state", () => {
    applyMessage({
      createSurface: { surfaceId: "review-form", catalogId: "videoclub" },
    });
    applyMessage({
      updateComponents: {
        surfaceId: "review-form",
        components: [
          { id: "root", component: "Column", children: ["form"] },
          { id: "form", component: "ReviewForm", data: { path: "/state" } },
        ],
      },
    });
    applyMessage({
      updateDataModel: {
        surfaceId: "review-form",
        path: "/state",
        value: { movie: fakeMovie(1), rating: 4, text: "test" },
      },
    });

    render(<A2UIRenderer surfaceId="review-form" />);
    expect(screen.getByText("Movie 1")).toBeInTheDocument();
  });
});