import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  registerHighlighter,
  triggerHighlight,
} from "./highlight-registry";
import { clearAllSurfaces } from "./store";

describe("highlight-registry", () => {
  beforeEach(() => {
    clearAllSurfaces();
  });

  it("triggerHighlight returns false when no handler is registered", () => {
    expect(triggerHighlight("absent", ["runtime"])).toBe(false);
  });

  it("registerHighlighter dispatches to the registered fn", () => {
    const fn = vi.fn();
    const unsubscribe = registerHighlighter("s", fn);

    expect(triggerHighlight("s", ["runtime", "mood"])).toBe(true);
    expect(fn).toHaveBeenCalledWith(["runtime", "mood"]);

    unsubscribe();
  });

  it("unsubscribe removes the registration", () => {
    const fn = vi.fn();
    const unsubscribe = registerHighlighter("s", fn);
    unsubscribe();
    expect(triggerHighlight("s", ["runtime"])).toBe(false);
    expect(fn).not.toHaveBeenCalled();
  });

  it("multiple registrations on the same surface all receive flashes", () => {
    const first = vi.fn();
    const second = vi.fn();
    const u1 = registerHighlighter("s", first);
    const u2 = registerHighlighter("s", second);

    triggerHighlight("s", ["x"]);
    expect(first).toHaveBeenCalledWith(["x"]);
    expect(second).toHaveBeenCalledWith(["x"]);

    u1();
    u2();
  });

  it("clearAllSurfaces() also clears registered highlighters", () => {
    const fn = vi.fn();
    registerHighlighter("s", fn);
    clearAllSurfaces();
    expect(triggerHighlight("s", ["x"])).toBe(false);
    expect(fn).not.toHaveBeenCalled();
  });
});
