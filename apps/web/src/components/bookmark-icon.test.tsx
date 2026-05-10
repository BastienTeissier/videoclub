import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BookmarkIcon } from "./bookmark-icon";

const mockToggleWatchlist = vi.fn();
let inWatchlist = false;

vi.mock("@/hooks/use-movie-state", () => ({
  useMovieState: (movieId: string) => ({
    inWatchlist,
    reviewRating: undefined,
    toggleWatchlist: () => mockToggleWatchlist(movieId),
    upsertReview: vi.fn(),
    deleteReview: vi.fn(),
  }),
}));

const mockToast = vi.fn();
vi.mock("@repo/ui", () => ({
  toast: (...args: unknown[]) => mockToast(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockToggleWatchlist.mockResolvedValue(undefined);
});

describe("BookmarkIcon", () => {
  it("renders outlined icon when movie is not in watchlist", () => {
    inWatchlist = false;

    render(<BookmarkIcon movieId="m1" movieTitle="Arrival" />);

    const button = screen.getByRole("button", { name: "Add to watchlist" });
    expect(button).toBeInTheDocument();
  });

  it("renders filled icon when movie is in watchlist", () => {
    inWatchlist = true;

    render(<BookmarkIcon movieId="m1" movieTitle="Arrival" />);

    const button = screen.getByRole("button", { name: "Remove from watchlist" });
    expect(button).toBeInTheDocument();
  });

  it("click calls toggleWatchlist with movieId", async () => {
    inWatchlist = false;

    render(<BookmarkIcon movieId="m1" movieTitle="Arrival" />);

    fireEvent.click(screen.getByRole("button"));
    expect(mockToggleWatchlist).toHaveBeenCalledWith("m1");
  });

  it("click calls stopPropagation", () => {
    inWatchlist = false;

    const parentClick = vi.fn();
    render(
      <div onClick={parentClick}>
        <BookmarkIcon movieId="m1" movieTitle="Arrival" />
      </div>
    );

    fireEvent.click(screen.getByRole("button"));
    expect(parentClick).not.toHaveBeenCalled();
  });

  it("shows success toast on successful toggle", async () => {
    inWatchlist = false;
    mockToggleWatchlist.mockResolvedValue(undefined);

    render(<BookmarkIcon movieId="m1" movieTitle="Arrival" />);
    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          description: "Arrival added to watchlist",
        })
      );
    });
  });

  it("shows error toast on failed toggle", async () => {
    inWatchlist = false;
    mockToggleWatchlist.mockRejectedValue(new Error("Network error"));

    render(<BookmarkIcon movieId="m1" movieTitle="Arrival" />);
    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: "destructive",
          description: "Failed to update watchlist. Try again.",
        })
      );
    });
  });
});