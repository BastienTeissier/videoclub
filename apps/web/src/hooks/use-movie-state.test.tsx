import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useMovieState } from "./use-movie-state";

const mockToggleWatchlist = vi.fn();
const mockUpsertReview = vi.fn();
const mockDeleteReview = vi.fn();
const mockIsInWatchlist = vi.fn();
const mockGetReviewRating = vi.fn();

vi.mock("@/contexts/watchlist-context", () => ({
  useWatchlist: () => ({
    watchlistedIds: new Set(),
    isInWatchlist: mockIsInWatchlist,
    toggleWatchlist: mockToggleWatchlist,
    addToWatchlist: vi.fn(),
    removeFromWatchlist: vi.fn(),
    refetch: vi.fn(),
  }),
}));

vi.mock("@/contexts/review-context", () => ({
  useReviews: () => ({
    reviewRatings: new Map(),
    getReviewRating: mockGetReviewRating,
    upsertReview: mockUpsertReview,
    deleteReview: mockDeleteReview,
    refetch: vi.fn(),
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useMovieState", () => {
  it("reads inWatchlist from useWatchlist().isInWatchlist for the bound movieId", () => {
    mockIsInWatchlist.mockReturnValue(true);
    const { result } = renderHook(() => useMovieState("movie-1"));
    expect(mockIsInWatchlist).toHaveBeenCalledWith("movie-1");
    expect(result.current.inWatchlist).toBe(true);
  });

  it("reads reviewRating from useReviews().getReviewRating for the bound movieId", () => {
    mockGetReviewRating.mockReturnValue(4.5);
    const { result } = renderHook(() => useMovieState("movie-1"));
    expect(mockGetReviewRating).toHaveBeenCalledWith("movie-1");
    expect(result.current.reviewRating).toBe(4.5);
  });

  it("toggleWatchlist calls useWatchlist().toggleWatchlist with the bound movieId", async () => {
    mockToggleWatchlist.mockResolvedValue(undefined);
    const { result } = renderHook(() => useMovieState("movie-1"));
    await act(async () => {
      await result.current.toggleWatchlist();
    });
    expect(mockToggleWatchlist).toHaveBeenCalledWith("movie-1");
  });

  it("upsertReview proxies useReviews().upsertReview with the bound movieId", async () => {
    mockUpsertReview.mockResolvedValue({ review: { id: "r1" } });
    const { result } = renderHook(() => useMovieState("movie-1"));
    await act(async () => {
      await result.current.upsertReview({ rating: 4 });
    });
    expect(mockUpsertReview).toHaveBeenCalledWith("movie-1", { rating: 4 });
  });

  it("deleteReview proxies useReviews().deleteReview with the bound movieId", async () => {
    mockDeleteReview.mockResolvedValue({ deleted: true });
    const { result } = renderHook(() => useMovieState("movie-1"));
    await act(async () => {
      await result.current.deleteReview();
    });
    expect(mockDeleteReview).toHaveBeenCalledWith("movie-1");
  });
});
