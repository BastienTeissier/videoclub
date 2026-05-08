import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ComponentNode } from "@repo/contracts";
import { ReviewsGrid } from "./reviews-grid";
import { applyMessage, clearAllSurfaces } from "../store";

vi.mock("@/contexts/watchlist-context", () => ({
  useWatchlist: () => ({
    isInWatchlist: () => false,
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

const fakeReview = (
  id: number,
  overrides: Partial<{ text: string | null; rating: number; updatedAt: string }> = {},
) => ({
  id: `rev-${id}`,
  movieId: `00000000-0000-4000-8000-00000000000${id}`,
  rating: overrides.rating ?? 4,
  text: overrides.text ?? null,
  createdAt: "2024-01-15T00:00:00.000Z",
  updatedAt: overrides.updatedAt ?? "2024-01-15T00:00:00.000Z",
  movie: fakeMovie(id),
});

const node: ComponentNode = {
  id: "grid",
  component: "ReviewsGrid",
  data: { path: "/state" },
};

function seed(state: { items: ReturnType<typeof fakeReview>[]; state: "ok" | "empty" | "error"; message?: string }) {
  applyMessage({ createSurface: { surfaceId: "reviews", catalogId: "videoclub" } });
  applyMessage({
    updateDataModel: { surfaceId: "reviews", path: "/state", value: state },
  });
}

describe("ReviewsGrid (protocol)", () => {
  beforeEach(() => {
    clearAllSurfaces();
  });

  it("renders header with count when state=ok", () => {
    seed({ items: [fakeReview(1), fakeReview(2)], state: "ok" });
    render(<ReviewsGrid node={node} surfaceId="reviews" />);
    expect(screen.getByText("My Reviews (2)")).toBeInTheDocument();
  });

  it("renders rating value, text excerpt, and formatted date", () => {
    seed({
      items: [
        fakeReview(1, {
          rating: 4.5,
          text: "Loved every minute of it",
          updatedAt: "2024-01-15T12:00:00.000Z",
        }),
      ],
      state: "ok",
    });
    render(<ReviewsGrid node={node} surfaceId="reviews" />);
    expect(screen.getByText("Loved every minute of it")).toBeInTheDocument();
    expect(screen.getByText("4.5")).toBeInTheDocument();
    expect(screen.getByText("Jan 15, 2024")).toBeInTheDocument();
  });

  it("omits text paragraph when item.text is null", () => {
    seed({ items: [fakeReview(1, { text: null })], state: "ok" });
    const { container } = render(<ReviewsGrid node={node} surfaceId="reviews" />);
    expect(container.querySelector(".line-clamp-2")).toBeNull();
  });

  it("renders empty-state message when state=empty", () => {
    seed({
      items: [],
      state: "empty",
      message: "You haven't reviewed any movies yet.",
    });
    render(<ReviewsGrid node={node} surfaceId="reviews" />);
    expect(
      screen.getByText("You haven't reviewed any movies yet."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/My Reviews/)).not.toBeInTheDocument();
  });

  it("renders error message when state=error", () => {
    seed({
      items: [],
      state: "error",
      message:
        "Sorry, I couldn't load your reviews right now. Please try again.",
    });
    render(<ReviewsGrid node={node} surfaceId="reviews" />);
    expect(
      screen.getByText(
        "Sorry, I couldn't load your reviews right now. Please try again.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/My Reviews/)).not.toBeInTheDocument();
  });
});
