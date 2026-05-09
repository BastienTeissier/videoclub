import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  registerHighlighter,
  triggerHighlight,
} from "./highlight-registry";

describe("highlight-registry", () => {
  beforeEach(() => {
    // Each test cleans up its own registration via the returned unsubscribe.
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

  it("re-registering replaces the previous fn", () => {
    const first = vi.fn();
    const second = vi.fn();
    const u1 = registerHighlighter("s", first);
    const u2 = registerHighlighter("s", second);

    triggerHighlight("s", ["x"]);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith(["x"]);

    u1();
    u2();
  });
});
