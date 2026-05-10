import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ComponentNode } from "@repo/contracts";
import { MovieComparisonTable } from "./movie-comparison-table";
import { applyMessage, clearAllSurfaces } from "../store";
import { triggerHighlight } from "../highlight-registry";

const fakeMovie = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  tmdbId: 1,
  title: `Movie ${id}`,
  year: 2024,
  synopsis: null,
  genres: ["Drama"],
  cast: null,
  directors: ["Some Director"],
  runtime: 95,
  language: null,
  posterUrl: null,
  backdropUrl: null,
  popularity: null,
  releaseDate: null,
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-01T00:00:00.000Z",
  ...overrides,
});

const node: ComponentNode = {
  id: "comparison",
  component: "MovieComparisonTable",
  data: { path: "/comparison" },
};

function seed(opts: {
  movies: ReturnType<typeof fakeMovie>[];
  shortlistIds: string[];
  criteria: string[];
  cells?: Record<string, Record<string, string>>;
}) {
  applyMessage({
    createSurface: { surfaceId: "discovery", catalogId: "videoclub" },
  });
  applyMessage({
    updateComponents: {
      surfaceId: "discovery",
      components: [
        { id: "root", component: "Column", children: ["comparison"] },
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
      path: "/comparison",
      value: {
        shortlistIds: opts.shortlistIds,
        criteria: opts.criteria,
        cells: opts.cells ?? {},
      },
    },
  });
}

describe("MovieComparisonTable", () => {
  beforeEach(() => {
    clearAllSurfaces();
  });

  it("renders one row per shortlist id resolved against /movies, in caller order", () => {
    seed({
      movies: [fakeMovie("a"), fakeMovie("b"), fakeMovie("c"), fakeMovie("d")],
      shortlistIds: ["a", "b", "c"],
      criteria: ["runtime"],
    });
    render(<MovieComparisonTable node={node} surfaceId="discovery" />);
    const rows = screen.getAllByRole("row");
    // header + 3 data rows
    expect(rows).toHaveLength(4);
    expect(screen.getByText(/Movie a/)).toBeInTheDocument();
    expect(screen.getByText(/Movie b/)).toBeInTheDocument();
    expect(screen.getByText(/Movie c/)).toBeInTheDocument();
    expect(screen.queryByText(/Movie d/)).not.toBeInTheDocument();
  });

  it("missing id is dropped silently (no crash, no row)", () => {
    seed({
      movies: [fakeMovie("a")],
      shortlistIds: ["a", "missing"],
      criteria: ["runtime"],
    });
    render(<MovieComparisonTable node={node} surfaceId="discovery" />);
    const rows = screen.getAllByRole("row");
    expect(rows).toHaveLength(2); // header + 1 data row
  });

  it("renders server-resolved cell values", () => {
    seed({
      movies: [fakeMovie("a", { runtime: 95 })],
      shortlistIds: ["a"],
      criteria: ["runtime"],
      cells: { a: { runtime: "95 min" } },
    });
    render(<MovieComparisonTable node={node} surfaceId="discovery" />);
    expect(screen.getByText("95 min")).toBeInTheDocument();
  });

  it("unknown criterion renders em-dash placeholder when cell is missing", () => {
    seed({
      movies: [fakeMovie("a")],
      shortlistIds: ["a"],
      criteria: ["vibes"],
      // server resolved unknown criterion to placeholder
      cells: { a: { vibes: "—" } },
    });
    render(<MovieComparisonTable node={node} surfaceId="discovery" />);
    expect(screen.getByText("vibes")).toBeInTheDocument();
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThanOrEqual(1);
  });

  it("triggerHighlight toggles .a2ui-flash on the requested column", () => {
    seed({
      movies: [fakeMovie("a")],
      shortlistIds: ["a"],
      criteria: ["runtime", "year"],
    });
    const { container } = render(
      <MovieComparisonTable node={node} surfaceId="discovery" />,
    );

    expect(triggerHighlight("discovery", ["runtime"])).toBe(true);

    const cols = container.querySelectorAll("col");
    // First <col /> is the leading "Movie" column; criteria cols follow in order.
    expect(cols[1]?.classList.contains("a2ui-flash")).toBe(true);
    expect(cols[2]?.classList.contains("a2ui-flash")).toBe(false);
  });

  it("highlighter unregisters on unmount", () => {
    seed({
      movies: [fakeMovie("a")],
      shortlistIds: ["a"],
      criteria: ["runtime"],
    });
    const { unmount } = render(
      <MovieComparisonTable node={node} surfaceId="discovery" />,
    );
    unmount();
    expect(triggerHighlight("discovery", ["runtime"])).toBe(false);
  });

  it("renders fallback message when no rows resolve", () => {
    seed({
      movies: [],
      shortlistIds: ["missing"],
      criteria: ["runtime"],
    });
    render(<MovieComparisonTable node={node} surfaceId="discovery" />);
    expect(screen.getByText("No movies to compare.")).toBeInTheDocument();
  });
});
