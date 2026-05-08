import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReviewsGridSurface } from "@repo/contracts";
import { ReviewsGrid } from "./reviews-grid";

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

describe("ReviewsGrid", () => {
  it("renders header with count", () => {
    const data: ReviewsGridSurface = {
      type: "reviews-grid",
      items: [fakeReview(1), fakeReview(2)],
      count: 2,
    };

    render(<ReviewsGrid data={data} />);

    expect(screen.getByText("My Reviews (2)")).toBeInTheDocument();
  });

  it("renders rating value, text excerpt, and formatted date for each item", () => {
    const data: ReviewsGridSurface = {
      type: "reviews-grid",
      items: [
        fakeReview(1, {
          rating: 4.5,
          text: "Loved every minute of it",
          updatedAt: "2024-01-15T12:00:00.000Z",
        }),
      ],
      count: 1,
    };

    render(<ReviewsGrid data={data} />);

    expect(screen.getByText("Loved every minute of it")).toBeInTheDocument();
    expect(screen.getByText("4.5")).toBeInTheDocument();
    expect(screen.getByText("Jan 15, 2024")).toBeInTheDocument();
  });

  it("omits text paragraph when item.text is null", () => {
    const data: ReviewsGridSurface = {
      type: "reviews-grid",
      items: [fakeReview(1, { text: null })],
      count: 1,
    };

    const { container } = render(<ReviewsGrid data={data} />);
    expect(container.querySelector(".line-clamp-2")).toBeNull();
  });

  it("renders empty-state message", () => {
    const data: ReviewsGridSurface = {
      type: "reviews-grid",
      items: [],
      count: 0,
      message: "You haven't reviewed any movies yet.",
    };

    render(<ReviewsGrid data={data} />);

    expect(
      screen.getByText("You haven't reviewed any movies yet."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/My Reviews/)).not.toBeInTheDocument();
  });

  it("renders error message without grid", () => {
    const data: ReviewsGridSurface = {
      type: "reviews-grid",
      items: [],
      count: 0,
      error: true,
      message:
        "Sorry, I couldn't load your reviews right now. Please try again.",
    };

    render(<ReviewsGrid data={data} />);

    expect(
      screen.getByText(
        "Sorry, I couldn't load your reviews right now. Please try again.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/My Reviews/)).not.toBeInTheDocument();
  });
});
