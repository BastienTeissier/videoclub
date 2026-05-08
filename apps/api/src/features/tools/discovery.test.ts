import { describe, it, expect, vi } from "vitest";
import { createDiscoveryTool } from "./discovery.js";

const fakeMovieRow = {
  id: "00000000-0000-0000-0000-000000000001",
  tmdbId: 1,
  title: "Sample",
  year: 2020,
  synopsis: null,
  genres: ["Comedy"],
  cast: null,
  directors: null,
  runtime: 100,
  language: null,
  posterUrl: null,
  backdropUrl: null,
  popularity: 1,
  releaseDate: null,
  createdAt: new Date("2020-01-01T00:00:00.000Z"),
  updatedAt: new Date("2020-01-01T00:00:00.000Z"),
};

const searchStructured = vi.fn();

vi.mock("@repo/db", async () => {
  const actual = await vi.importActual<typeof import("@repo/db")>("@repo/db");
  return {
    ...actual,
    moviesRepository: () => ({
      searchStructured: (...args: unknown[]) => searchStructured(...args),
    }),
  };
});

const fakeDb = {} as never;

async function execTool(input: { filters?: Record<string, unknown>; view?: string }) {
  const t = createDiscoveryTool(fakeDb);
  return await t.execute!(
    {
      filters: input.filters,
      view: input.view ?? "grid",
    } as Parameters<NonNullable<typeof t.execute>>[0],
    { toolCallId: "tc-test", messages: [] },
  );
}

describe("discovery tool", () => {
  it("view=grid: returns data + a2uiMessages from emitter", async () => {
    searchStructured.mockResolvedValueOnce([fakeMovieRow]);

    const result = (await execTool({
      filters: { genres: ["Comedy"], maxRuntime: 120 },
    })) as { data: { movies: unknown[] }; a2uiMessages: unknown[] };

    expect(result.data.movies).toHaveLength(1);
    expect(result.a2uiMessages).toHaveLength(5);
  });

  it("forwards maxRuntime + excludedGenres to searchStructured", async () => {
    searchStructured.mockResolvedValueOnce([]);
    await execTool({
      filters: {
        genres: ["Drama"],
        maxRuntime: 90,
        excludedGenres: ["Horror"],
      },
    });
    const callArgs = searchStructured.mock.calls.at(-1)![0] as Record<string, unknown>;
    expect(callArgs.maxRuntime).toBe(90);
    expect(callArgs.excludedGenres).toEqual(["Horror"]);
  });

  it("strips moods from the DB call but echoes them in /filters", async () => {
    searchStructured.mockResolvedValueOnce([]);
    const result = (await execTool({
      filters: { moods: ["feel-good"], genres: ["Comedy"] },
    })) as {
      a2uiMessages: Array<{ updateDataModel?: { path: string; value: unknown } }>;
    };

    const callArgs = searchStructured.mock.calls.at(-1)![0] as Record<string, unknown>;
    expect(callArgs.moods).toBeUndefined();

    const filtersUpdate = result.a2uiMessages.find(
      (m) => m.updateDataModel?.path === "/filters",
    );
    expect(filtersUpdate).toBeDefined();
    expect(
      (filtersUpdate!.updateDataModel!.value as { moods?: string[] }).moods,
    ).toEqual(["feel-good"]);
  });

  it("invalid view falls back to grid and reports a warning", async () => {
    searchStructured.mockResolvedValueOnce([]);
    const result = (await execTool({ view: "carousel" })) as {
      data: { view: string };
      warnings: Array<{ code: string }>;
      a2uiMessages: unknown[];
    };
    expect(result.data.view).toBe("grid");
    expect(result.warnings[0]!.code).toBe("invalid-view");
    expect(result.a2uiMessages.length).toBeGreaterThan(0);
  });

  it("description includes catalog component names", () => {
    const t = createDiscoveryTool(fakeDb);
    const desc = t.description ?? "";
    expect(desc).toContain("Column");
    expect(desc).toContain("MovieFilterPanel");
    expect(desc).toContain("MovieGrid");
    expect(desc).toContain("Skeleton");
  });
});
