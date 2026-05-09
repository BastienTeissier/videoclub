import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { A2UIRenderer } from "../registry.js";
import { applyMessage, clearAllSurfaces, getSurface } from "../store.js";

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

function applyReviewFormMessages(rating: number, text?: string) {
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
      value: { movie, rating, text },
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  clearAllSurfaces();
  mockUpsertReview.mockResolvedValue({ message: "ok" });
});

describe("ReviewForm renderer (A2UI-bound)", () => {
  it("renders ReviewForm with prefilled rating and text from surface state", () => {
    applyReviewFormMessages(4.5, "loved");

    render(<A2UIRenderer surfaceId="review-form" />);

    expect(screen.getByText("Inception")).toBeInTheDocument();
    expect(screen.getByDisplayValue("loved")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Delete" }),
    ).not.toBeInTheDocument();
  });

  it("submit calls upsertReview and clears the surface on done", async () => {
    applyReviewFormMessages(4, "good");

    render(<A2UIRenderer surfaceId="review-form" />);

    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() => {
      expect(mockUpsertReview).toHaveBeenCalledWith({
        rating: 4,
        text: "good",
      });
    });
    await waitFor(() => {
      expect(getSurface("review-form")).toBeUndefined();
    });
  });
});