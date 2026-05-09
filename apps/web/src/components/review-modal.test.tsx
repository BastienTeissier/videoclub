import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import type { MovieDto } from "@repo/contracts";
import { ReviewModal } from "./review-modal";

const mockFetchReview = vi.fn();
vi.mock("@/lib/api/reviews", () => ({
  fetchReview: (...args: unknown[]) => mockFetchReview(...args),
}));

const mockUpsert = vi.fn();
const mockDelete = vi.fn();
vi.mock("@/hooks/use-movie-state", () => ({
  useMovieState: () => ({
    inWatchlist: false,
    reviewRating: undefined,
    toggleWatchlist: vi.fn(),
    upsertReview: mockUpsert,
    deleteReview: mockDelete,
  }),
}));

const movie: MovieDto = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  tmdbId: 1,
  title: "Arrival",
  year: 2016,
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
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ReviewModal", () => {
  it("opens with existing review → fetches and prefills", async () => {
    mockFetchReview.mockResolvedValue({
      review: {
        id: "rev-1",
        movieId: movie.id,
        rating: 4,
        text: "Loved it",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });
    render(
      <ReviewModal movie={movie} open={true} onOpenChange={() => {}} />
    );
    await waitFor(() => {
      expect(mockFetchReview).toHaveBeenCalledWith(movie.id);
    });
    await waitFor(() => {
      expect(screen.getByDisplayValue("Loved it")).toBeInTheDocument();
    });
    expect(
      screen.getByRole("button", { name: "Delete" })
    ).toBeInTheDocument();
  });

  it("opens without existing review → empty form, no Delete button", async () => {
    mockFetchReview.mockResolvedValue({ review: null });
    render(
      <ReviewModal movie={movie} open={true} onOpenChange={() => {}} />
    );
    await waitFor(() => {
      expect(mockFetchReview).toHaveBeenCalledWith(movie.id);
    });
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
    });
  });

  it("re-fetches on close + re-open", async () => {
    mockFetchReview.mockResolvedValue({ review: null });
    const { rerender } = render(
      <ReviewModal movie={movie} open={true} onOpenChange={() => {}} />
    );
    await waitFor(() => expect(mockFetchReview).toHaveBeenCalledTimes(1));
    rerender(
      <ReviewModal movie={movie} open={false} onOpenChange={() => {}} />
    );
    rerender(
      <ReviewModal movie={movie} open={true} onOpenChange={() => {}} />
    );
    await waitFor(() => expect(mockFetchReview).toHaveBeenCalledTimes(2));
  });
});
