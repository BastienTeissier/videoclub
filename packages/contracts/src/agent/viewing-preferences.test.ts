import { describe, expect, it } from "vitest";
import { applyPatch } from "./viewing-preferences.js";

describe("applyPatch", () => {
  it("replaces scalar arrays and emits replace ops", () => {
    const { next, jsonPatchOps } = applyPatch(
      { genres: ["Comedy"], maxRuntime: 90 },
      { genres: ["Drama"], maxRuntime: 120 },
    );
    expect(next.genres).toEqual(["Drama"]);
    expect(next.maxRuntime).toBe(120);
    expect(jsonPatchOps).toEqual([
      { op: "replace", path: "/genres", value: ["Drama"] },
      { op: "replace", path: "/maxRuntime", value: 120 },
    ]);
  });

  it("emits add op when key was previously absent", () => {
    const { jsonPatchOps } = applyPatch({}, { moods: ["feel-good"] });
    expect(jsonPatchOps).toEqual([
      { op: "add", path: "/moods", value: ["feel-good"] },
    ]);
  });

  it("appends notes and emits per-note add ops", () => {
    const { next, jsonPatchOps } = applyPatch(
      { notes: ["a"] },
      { notes: ["b", "c"] },
    );
    expect(next.notes).toEqual(["a", "b", "c"]);
    expect(jsonPatchOps).toEqual([
      { op: "add", path: "/notes/-", value: "b" },
      { op: "add", path: "/notes/-", value: "c" },
    ]);
  });

  it("FIFO-evicts notes beyond cap of 8", () => {
    const prev = { notes: ["a", "b", "c", "d", "e", "f", "g"] };
    const { next, jsonPatchOps } = applyPatch(prev, { notes: ["h", "i", "j"] });
    expect(next.notes).toEqual(["c", "d", "e", "f", "g", "h", "i", "j"]);
    expect(
      jsonPatchOps.filter((op) => op.op === "remove").map((op) => op.path),
    ).toEqual(["/notes/0", "/notes/0"]);
  });

  it("emits add op for fresh notes when previously empty", () => {
    const { jsonPatchOps } = applyPatch({}, { notes: ["x"] });
    expect(jsonPatchOps).toEqual([
      { op: "add", path: "/notes", value: ["x"] },
    ]);
  });

  it("ignores undefined patch keys", () => {
    const { next, jsonPatchOps } = applyPatch(
      { genres: ["Comedy"] },
      { maxRuntime: 90 },
    );
    expect(next.genres).toEqual(["Comedy"]);
    expect(jsonPatchOps).toHaveLength(1);
  });
});
