import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ComponentNode } from "@repo/contracts";
import { MovieNightPlan } from "./movie-night-plan";
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

const fakeMovie = (id: string) => ({
  id,
  tmdbId: 1,
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

const node: ComponentNode = {
  id: "plan",
  component: "MovieNightPlan",
  data: { path: "/plan" },
};

function seed(opts: {
  movies: ReturnType<typeof fakeMovie>[];
  plan: {
    pickedMovieId?: string;
    backupMovieIds?: string[];
    reason?: string | null;
  };
}) {
  applyMessage({
    createSurface: { surfaceId: "discovery", catalogId: "videoclub" },
  });
  applyMessage({
    updateComponents: {
      surfaceId: "discovery",
      components: [
        { id: "root", component: "Column", children: ["plan"] },
        { ...node },
      ],
    },
  });
  applyMessage({
    updateDataModel: {
      surfaceId: "discovery",
      path: "/movies",
      value: opts.movies,
    },
  });
  applyMessage({
    updateDataModel: {
      surfaceId: "discovery",
      path: "/plan",
      value: opts.plan,
    },
  });
}

describe("MovieNightPlan", () => {
  beforeEach(() => {
    clearAllSurfaces();
  });

  it("renders picked + backups + reason when present", () => {
    seed({
      movies: [fakeMovie("a"), fakeMovie("b"), fakeMovie("c")],
      plan: {
        pickedMovieId: "a",
        backupMovieIds: ["b", "c"],
        reason: "feel-good Friday pick",
      },
    });
    render(<MovieNightPlan node={node} surfaceId="discovery" />);
    expect(screen.getByText("Tonight")).toBeInTheDocument();
    expect(screen.getByText("Backups")).toBeInTheDocument();
    expect(screen.getByText("Movie a")).toBeInTheDocument();
    expect(screen.getByText("Movie b")).toBeInTheDocument();
    expect(screen.getByText("Movie c")).toBeInTheDocument();
    expect(screen.getByText("feel-good Friday pick")).toBeInTheDocument();
  });

  it("hides Backups section when backupMovieIds is empty", () => {
    seed({
      movies: [fakeMovie("a")],
      plan: { pickedMovieId: "a", backupMovieIds: [] },
    });
    render(<MovieNightPlan node={node} surfaceId="discovery" />);
    expect(screen.getByText("Tonight")).toBeInTheDocument();
    expect(screen.queryByText("Backups")).not.toBeInTheDocument();
  });

  it("renders no-pick fallback when picked id missing from /movies", () => {
    seed({
      movies: [fakeMovie("b")],
      plan: { pickedMovieId: "missing" },
    });
    render(<MovieNightPlan node={node} surfaceId="discovery" />);
    expect(screen.getByText("No pick yet.")).toBeInTheDocument();
  });

  it("omits reason when null", () => {
    seed({
      movies: [fakeMovie("a")],
      plan: { pickedMovieId: "a", reason: null },
    });
    const { container } = render(
      <MovieNightPlan node={node} surfaceId="discovery" />,
    );
    expect(container.querySelector("p.italic")).toBeNull();
  });
});
