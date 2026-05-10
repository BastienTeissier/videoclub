import { describe, it, expect } from "vitest";
import { computeAppliedKeys, formatMemoryForSystemPrompt } from "./memory.js";

describe("formatMemoryForSystemPrompt", () => {
  it("returns empty string for empty input", () => {
    expect(formatMemoryForSystemPrompt({})).toBe("");
  });

  it("renders only the keys present, with deterministic order", () => {
    const out = formatMemoryForSystemPrompt({ genres: ["Comedy"] });
    expect(out).toContain("Preferred genres: Comedy");
    expect(out).not.toContain("Max runtime");
    expect(out).not.toContain("Preferred moods");
    expect(out).not.toContain("Notes:");
    expect(formatMemoryForSystemPrompt({ genres: ["Comedy"] })).toBe(out);
  });

  it("renders notes as a bulleted sub-list under Notes:", () => {
    const out = formatMemoryForSystemPrompt({
      notes: ["one", "two", "three"],
    });
    expect(out).toContain("- Notes:\n  - one\n  - two\n  - three");
  });
});

describe("computeAppliedKeys", () => {
  it("returns [] when no filter key matches the snapshot", () => {
    expect(
      computeAppliedKeys({ title: "x" }, { genres: ["Comedy"] }),
    ).toEqual([]);
  });

  it("returns the keys present on both sides (presence, not equality)", () => {
    expect(
      computeAppliedKeys(
        { genres: ["Comedy"], maxRuntime: 90 },
        { genres: ["Comedy"], maxRuntime: 120 },
      ),
    ).toEqual(["genres", "maxRuntime"]);
  });

  it("ignores empty arrays on the snapshot side", () => {
    expect(computeAppliedKeys({ genres: ["X"] }, { genres: [] })).toEqual([]);
  });

  it("returns [] when filters is undefined", () => {
    expect(computeAppliedKeys(undefined, { genres: ["Comedy"] })).toEqual([]);
  });
});
