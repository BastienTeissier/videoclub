import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { MovieDto } from "@repo/contracts";
import { ReviewIcon } from "./review-icon";

const mockGetReviewRating = vi.fn();
vi.mock("@/contexts/review-context", () => ({
  useReviews: () => ({
    getReviewRating: mockGetReviewRating,
    upsertReview: vi.fn(),
    deleteReview: vi.fn(),
  }),
}));

vi.mock("@/lib/api/reviews", () => ({
  fetchReview: vi.fn().mockResolvedValue({ review: null }),
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

describe("ReviewIcon", () => {
  it("rating undefined → no number label, aria-label 'Add review'", () => {
    mockGetReviewRating.mockReturnValue(undefined);
    render(<ReviewIcon movie={movie} />);
    const button = screen.getByRole("button", { name: "Add review" });
    expect(button).toBeInTheDocument();
    expect(button.textContent).not.toContain("4");
  });

  it("rating 4.5 → button shows numeric label", () => {
    mockGetReviewRating.mockReturnValue(4.5);
    render(<ReviewIcon movie={movie} />);
    const button = screen.getByRole("button", { name: /Edit review/ });
    expect(button.textContent).toContain("4.5");
  });

  it("click stops propagation (parent onClick not called)", () => {
    mockGetReviewRating.mockReturnValue(undefined);
    const parentClick = vi.fn();
    render(
      <div onClick={parentClick}>
        <ReviewIcon movie={movie} />
      </div>
    );
    fireEvent.click(screen.getByRole("button", { name: "Add review" }));
    expect(parentClick).not.toHaveBeenCalled();
  });

  it("click opens modal", () => {
    mockGetReviewRating.mockReturnValue(undefined);
    render(<ReviewIcon movie={movie} />);
    const button = screen.getByRole("button", { name: "Add review" });
    fireEvent.click(button);
    expect(screen.getByText(`Review ${movie.title}`)).toBeInTheDocument();
  });

  it("rating defined → button has no opacity-0 class", () => {
    mockGetReviewRating.mockReturnValue(4);
    render(<ReviewIcon movie={movie} />);
    const button = screen.getByRole("button", { name: /Edit review/ });
    expect(button.className).not.toContain("opacity-0");
  });

  it("rating undefined and alwaysVisible unset → button has opacity-0 group-hover:opacity-100", () => {
    mockGetReviewRating.mockReturnValue(undefined);
    render(<ReviewIcon movie={movie} />);
    const button = screen.getByRole("button", { name: "Add review" });
    expect(button.className).toContain("opacity-0");
    expect(button.className).toContain("group-hover:opacity-100");
  });

  it("rating undefined and alwaysVisible=true → button has no opacity-0 class", () => {
    mockGetReviewRating.mockReturnValue(undefined);
    render(<ReviewIcon movie={movie} alwaysVisible />);
    const button = screen.getByRole("button", { name: "Add review" });
    expect(button.className).not.toContain("opacity-0");
  });
});
