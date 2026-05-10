import { describe, it, expect, vi, beforeEach } from "vitest";
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
const findByIds = vi.fn();

vi.mock("@repo/db", async () => {
  const actual = await vi.importActual<typeof import("@repo/db")>("@repo/db");
  return {
    ...actual,
    moviesRepository: () => ({
      searchStructured: (...args: unknown[]) => searchStructured(...args),
      findByIds: (...args: unknown[]) => findByIds(...args),
    }),
  };
});

const fakeDb = {} as never;

async function execTool(input: {
  filters?: Record<string, unknown>;
  view?: string;
  shortlistMovieIds?: string[];
  comparisonCriteria?: string[];
  pickedMovieId?: string;
  backupMovieIds?: string[];
  reason?: string;
}) {
  const t = createDiscoveryTool(fakeDb);
  return await t.execute!(
    {
      filters: input.filters,
      view: input.view ?? "grid",
      shortlistMovieIds: input.shortlistMovieIds,
      comparisonCriteria: input.comparisonCriteria,
      pickedMovieId: input.pickedMovieId,
      backupMovieIds: input.backupMovieIds,
      reason: input.reason,
    } as Parameters<NonNullable<typeof t.execute>>[0],
    { toolCallId: "tc-test", messages: [] },
  );
}

function makeRow(id: string, title: string) {
  return { ...fakeMovieRow, id, title };
}

describe("discovery tool", () => {
  beforeEach(() => {
    searchStructured.mockReset();
    findByIds.mockReset();
  });

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

  it("view=comparison: calls findByIds (not searchStructured) and emits 4 frames", async () => {
    findByIds.mockResolvedValueOnce([
      makeRow("id-a", "A"),
      makeRow("id-b", "B"),
      makeRow("id-c", "C"),
    ]);
    const result = (await execTool({
      view: "comparison",
      shortlistMovieIds: ["id-a", "id-b", "id-c"],
      comparisonCriteria: ["runtime"],
    })) as {
      data: { view: string; movies: unknown[] };
      a2uiMessages: unknown[];
    };
    expect(searchStructured).not.toHaveBeenCalled();
    expect(findByIds).toHaveBeenCalledWith(["id-a", "id-b", "id-c"]);
    expect(result.data.view).toBe("comparison");
    expect(result.data.movies).toHaveLength(3);
    expect(result.a2uiMessages).toHaveLength(4);
  });

  it("view=comparison with <2 ids returns no surface (view=none) + comparison-too-few warning", async () => {
    const result = (await execTool({
      view: "comparison",
      shortlistMovieIds: ["only-one"],
    })) as {
      data: { view: string; requestedView: string; movies: unknown[]; fallbackReason: { code: string } };
      a2uiMessages: unknown[];
      warnings: Array<{ code: string; count?: number }>;
    };
    expect(result.data.view).toBe("none");
    expect(result.data.requestedView).toBe("comparison");
    expect(result.data.movies).toEqual([]);
    expect(result.a2uiMessages).toEqual([]);
    expect(result.data.fallbackReason.code).toBe("comparison-too-few");
    expect(result.warnings[0]!.code).toBe("comparison-too-few");
    expect(result.warnings[0]!.count).toBe(1);
    expect(findByIds).not.toHaveBeenCalled();
    expect(searchStructured).not.toHaveBeenCalled();
  });

  it("view=comparison returns no surface when fewer than 2 ids resolve", async () => {
    // Simulates the LLM passing tmdbId values (or other unrelated strings)
    // that don't match any UUID in the movies table.
    findByIds.mockResolvedValueOnce([]); // none of the ids resolve
    const result = (await execTool({
      view: "comparison",
      shortlistMovieIds: ["27205", "100", "200"],
    })) as {
      data: { view: string; requestedView: string; movies: unknown[]; fallbackReason: { code: string; unresolvedIds?: string[] } };
      a2uiMessages: unknown[];
      warnings: Array<{ code: string; resolvedCount?: number; unresolvedIds?: string[] }>;
    };
    expect(result.data.view).toBe("none");
    expect(result.data.requestedView).toBe("comparison");
    expect(result.data.movies).toEqual([]);
    expect(result.a2uiMessages).toEqual([]);
    expect(result.warnings[0]!.code).toBe("comparison-resolution-failed");
    expect(result.warnings[0]!.resolvedCount).toBe(0);
    expect(result.warnings[0]!.unresolvedIds).toEqual(["27205", "100", "200"]);
    expect(result.data.fallbackReason.code).toBe("comparison-resolution-failed");
    // Critical: never trigger an unrelated grid search on view-failure paths.
    expect(searchStructured).not.toHaveBeenCalled();
  });

  it("view=comparison renders partial shortlist when some ids resolve and some don't (>=2 resolved)", async () => {
    findByIds.mockResolvedValueOnce([
      makeRow("real-a", "A"),
      makeRow("real-b", "B"),
    ]);
    const result = (await execTool({
      view: "comparison",
      shortlistMovieIds: ["real-a", "real-b", "fake-c"],
    })) as {
      data: { view: string; movies: { id: string }[]; unresolvedIds?: string[] };
      a2uiMessages: Array<{ updateDataModel?: { path: string; value: { shortlistIds?: string[] } } }>;
    };
    expect(result.data.view).toBe("comparison");
    expect(result.data.movies.map((m) => m.id)).toEqual(["real-a", "real-b"]);
    expect(result.data.unresolvedIds).toEqual(["fake-c"]);
    // Renderer's shortlistIds should match resolved rows so it never renders ghost rows
    const comparisonUpdate = result.a2uiMessages.find(
      (m) => m.updateDataModel?.path === "/comparison",
    );
    expect(comparisonUpdate?.updateDataModel?.value.shortlistIds).toEqual([
      "real-a",
      "real-b",
    ]);
  });

  it("view=night-plan: findByIds called with [picked, ...backups] and emits 4 frames", async () => {
    findByIds.mockResolvedValueOnce([
      makeRow("id-a", "Picked"),
      makeRow("id-b", "Backup1"),
      makeRow("id-c", "Backup2"),
    ]);
    const result = (await execTool({
      view: "night-plan",
      pickedMovieId: "id-a",
      backupMovieIds: ["id-b", "id-c"],
      reason: "feel-good Friday",
    })) as { data: { view: string }; a2uiMessages: unknown[] };
    expect(findByIds).toHaveBeenCalledWith(["id-a", "id-b", "id-c"]);
    expect(result.data.view).toBe("night-plan");
    expect(result.a2uiMessages).toHaveLength(4);
  });

  it("view=night-plan without pickedMovieId returns no surface + night-plan-incomplete warning", async () => {
    const result = (await execTool({ view: "night-plan" })) as {
      data: { view: string; fallbackReason: { code: string } };
      a2uiMessages: unknown[];
      warnings: Array<{ code: string }>;
    };
    expect(result.data.view).toBe("none");
    expect(result.a2uiMessages).toEqual([]);
    expect(result.warnings[0]!.code).toBe("night-plan-incomplete");
    expect(result.data.fallbackReason.code).toBe("night-plan-incomplete");
    expect(searchStructured).not.toHaveBeenCalled();
  });

  it("view=night-plan with unknown picked id returns no surface + night-plan-unknown-pick warning", async () => {
    findByIds.mockResolvedValueOnce([makeRow("id-b", "Backup")]);
    const result = (await execTool({
      view: "night-plan",
      pickedMovieId: "missing",
      backupMovieIds: ["id-b"],
    })) as {
      data: { view: string };
      a2uiMessages: unknown[];
      warnings: Array<{ code: string }>;
    };
    expect(result.data.view).toBe("none");
    expect(result.a2uiMessages).toEqual([]);
    expect(result.warnings[0]!.code).toBe("night-plan-unknown-pick");
    expect(searchStructured).not.toHaveBeenCalled();
  });

  it("description includes catalog component names", () => {
    const t = createDiscoveryTool(fakeDb);
    const desc = t.description ?? "";
    expect(desc).toContain("Column");
    expect(desc).toContain("MovieFilterPanel");
    expect(desc).toContain("MovieGrid");
    expect(desc).toContain("Skeleton");
    expect(desc).toContain("MovieComparisonTable");
    expect(desc).toContain("MovieNightPlan");
  });
});
