import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { ReviewFormSurface } from "@repo/contracts";
import { ReviewForm } from "./review-form";

const mockSetA2UISurface = vi.fn();
vi.mock("@/contexts/chat-results-context", () => ({
  useChatResults: () => ({
    setA2UISurface: mockSetA2UISurface,
  }),
}));

const mockUpsertReview = vi.fn();
vi.mock("@/hooks/use-movie-state", () => ({
  useMovieState: () => ({
    inWatchlist: false,
    reviewRating: undefined,
    toggleWatchlist: vi.fn(),
    upsertReview: mockUpsertReview,
    deleteReview: vi.fn(),
  }),
}));

vi.mock("@repo/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@repo/ui")>();
  return { ...actual, toast: vi.fn() };
});

const movie = {
  id: "00000000-0000-4000-8000-000000000001",
  tmdbId: 1,
  title: "Inception",
  year: 2010,
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
};

beforeEach(() => {
  vi.clearAllMocks();
  mockUpsertReview.mockResolvedValue({ message: "ok" });
});

describe("ReviewForm renderer", () => {
  it("renders ReviewForm with prefilled rating and text from surface", () => {
    const data: ReviewFormSurface = {
      type: "review-form",
      movie,
      rating: 4.5,
      text: "loved",
    };

    render(<ReviewForm data={data} />);

    expect(screen.getByText("Inception")).toBeInTheDocument();
    expect(screen.getByDisplayValue("loved")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Delete" }),
    ).not.toBeInTheDocument();
  });

  it("onDone clears A2UI surface", async () => {
    const data: ReviewFormSurface = {
      type: "review-form",
      movie,
      rating: 4,
      text: "good",
    };

    render(<ReviewForm data={data} />);

    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() => {
      expect(mockUpsertReview).toHaveBeenCalledWith({
        rating: 4,
        text: "good",
      });
    });
    await waitFor(() => {
      expect(mockSetA2UISurface).toHaveBeenCalledWith(null);
    });
  });
});
