import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { MovieDto, ReviewDto } from "@repo/contracts";
import { ReviewForm } from "./review-form";

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

const mockToast = vi.fn();
vi.mock("@repo/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@repo/ui")>();
  return {
    ...actual,
    toast: (...args: unknown[]) => mockToast(...args),
  };
});

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

const existingReview: ReviewDto = {
  id: "rev-1",
  movieId: movie.id,
  rating: 4.5,
  text: "Great",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockUpsert.mockResolvedValue({ review: existingReview, message: "ok" });
  mockDelete.mockResolvedValue({ deleted: true, message: "ok" });
});

describe("ReviewForm", () => {
  it("submit without rating → destructive toast and no upsert call", async () => {
    const onDone = vi.fn();
    render(
      <ReviewForm movie={movie} initialReview={null} onDone={onDone} />
    );
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: "destructive",
          description: "Rating is required",
        })
      );
    });
    expect(mockUpsert).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
  });

  it("submit with rating → calls upsertReview then onDone", async () => {
    const onDone = vi.fn();
    render(
      <ReviewForm movie={movie} initialReview={null} onDone={onDone} />
    );
    fireEvent.click(screen.getByLabelText("Rate 4 stars"));
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() => {
      expect(mockUpsert).toHaveBeenCalledWith({
        rating: 4,
        text: undefined,
      });
    });
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });

  it("with initialReview → form prefilled and Delete visible", async () => {
    const onDone = vi.fn();
    render(
      <ReviewForm
        movie={movie}
        initialReview={existingReview}
        onDone={onDone}
      />
    );
    expect(screen.getByDisplayValue("Great")).toBeInTheDocument();
    const deleteBtn = screen.getByRole("button", { name: "Delete" });
    expect(deleteBtn).toBeInTheDocument();
    fireEvent.click(deleteBtn);
    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalled();
    });
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });

  it("initialRating + initialText with initialReview=null → form prefilled, no Delete button, submit uses prefilled rating", async () => {
    render(
      <ReviewForm
        movie={movie}
        initialReview={null}
        initialRating={4}
        initialText="great"
        onDone={vi.fn()}
      />
    );
    expect(screen.getByDisplayValue("great")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Delete" })
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() => {
      expect(mockUpsert).toHaveBeenCalledWith({
        rating: 4,
        text: "great",
      });
    });
  });

  it("initialReview takes precedence over initialRating/initialText", () => {
    render(
      <ReviewForm
        movie={movie}
        initialReview={existingReview}
        initialRating={2}
        initialText="other"
        onDone={vi.fn()}
      />
    );
    expect(screen.getByDisplayValue("Great")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("other")).not.toBeInTheDocument();
  });

  it("upsert rejects → destructive toast, no onDone", async () => {
    mockUpsert.mockRejectedValue(new Error("Network"));
    const onDone = vi.fn();
    render(
      <ReviewForm movie={movie} initialReview={null} onDone={onDone} />
    );
    fireEvent.click(screen.getByLabelText("Rate 3 stars"));
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: "destructive",
          description: "Failed to save review. Try again.",
        })
      );
    });
    expect(onDone).not.toHaveBeenCalled();
  });
});