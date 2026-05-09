import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  applyMessage,
  clearAllSurfaces,
  getSurface,
} from "./store.js";

describe("a2ui store", () => {
  beforeEach(() => {
    clearAllSurfaces();
  });

  it("createSurface initializes empty surface", () => {
    applyMessage({
      createSurface: { surfaceId: "s", catalogId: "videoclub" },
    });
    const s = getSurface("s");
    expect(s).toBeDefined();
    expect(s!.catalogId).toBe("videoclub");
    expect(s!.components).toEqual({});
    expect(s!.dataModel).toEqual({});
  });

  it("createSurface is idempotent: preserves dataModel + components", () => {
    applyMessage({
      createSurface: { surfaceId: "s", catalogId: "videoclub" },
    });
    applyMessage({
      updateDataModel: { surfaceId: "s", path: "/x", value: 1 },
    });
    applyMessage({
      updateComponents: {
        surfaceId: "s",
        components: [{ id: "root", component: "Column", children: [] }],
      },
    });

    applyMessage({
      createSurface: { surfaceId: "s", catalogId: "videoclub-v2" },
    });

    const s = getSurface("s")!;
    expect(s.catalogId).toBe("videoclub-v2");
    expect(s.dataModel).toEqual({ x: 1 });
    expect(s.components.root).toBeDefined();
  });

  it("updateComponents upserts by id", () => {
    applyMessage({
      createSurface: { surfaceId: "s", catalogId: "videoclub" },
    });
    applyMessage({
      updateComponents: {
        surfaceId: "s",
        components: [
          { id: "root", component: "Column", children: ["grid"] },
          { id: "grid", component: "Skeleton" },
        ],
      },
    });
    applyMessage({
      updateComponents: {
        surfaceId: "s",
        components: [{ id: "grid", component: "MovieGrid" }],
      },
    });

    const s = getSurface("s")!;
    expect(s.components.grid?.component).toBe("MovieGrid");
    expect(s.components.root).toBeDefined();
  });

  it("updateDataModel writes via JSON pointer", () => {
    applyMessage({
      createSurface: { surfaceId: "s", catalogId: "videoclub" },
    });
    applyMessage({
      updateDataModel: { surfaceId: "s", path: "/movies", value: [1, 2] },
    });
    expect(getSurface("s")!.dataModel).toEqual({ movies: [1, 2] });
  });

  it("unknown component name does not throw", () => {
    applyMessage({
      createSurface: { surfaceId: "s", catalogId: "videoclub" },
    });
    expect(() =>
      applyMessage({
        updateComponents: {
          surfaceId: "s",
          components: [{ id: "x", component: "FooBar" }],
        },
      }),
    ).not.toThrow();
    expect(getSurface("s")!.components.x?.component).toBe("FooBar");
  });

  it("deleteSurface removes the entry", () => {
    applyMessage({
      createSurface: { surfaceId: "s", catalogId: "videoclub" },
    });
    applyMessage({ deleteSurface: { surfaceId: "s" } });
    expect(getSurface("s")).toBeUndefined();
  });

  it("updateComponents on unknown surface warns and no-ops", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    applyMessage({
      updateComponents: {
        surfaceId: "ghost",
        components: [{ id: "x", component: "Column" }],
      },
    });
    expect(warn).toHaveBeenCalled();
    expect(getSurface("ghost")).toBeUndefined();
    warn.mockRestore();
  });
});