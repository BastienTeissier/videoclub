import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { Operation } from "fast-json-patch";
import { MemoryProvider, useMemoryContext } from "./memory-context";

function wrapper({ children }: { children: React.ReactNode }) {
  return <MemoryProvider>{children}</MemoryProvider>;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("MemoryContext", () => {
  it("applySnapshot replaces state without flashing", () => {
    const { result } = renderHook(() => useMemoryContext(), { wrapper });

    act(() => {
      result.current.applySnapshot({ genres: ["Comedy"] });
    });

    expect(result.current.snapshot.genres).toEqual(["Comedy"]);
    expect(result.current.flashingKeys.size).toBe(0);
  });

  it("applyDelta mutates state per ops", () => {
    const { result } = renderHook(() => useMemoryContext(), { wrapper });

    act(() => {
      result.current.applyDelta([
        { op: "add", path: "/genres", value: ["Comedy"] },
      ] as Operation[]);
    });

    expect(result.current.snapshot.genres).toEqual(["Comedy"]);
  });

  it("applyDelta flashes the touched root key for ~1.5s, then clears", () => {
    const { result } = renderHook(() => useMemoryContext(), { wrapper });

    act(() => {
      result.current.applyDelta([
        { op: "add", path: "/maxRuntime", value: 90 },
      ] as Operation[]);
    });
    expect(result.current.flashingKeys.has("maxRuntime")).toBe(true);

    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(result.current.flashingKeys.has("maxRuntime")).toBe(false);
  });

  it("applyDelta with /notes/- flashes the `notes` root key", () => {
    const { result } = renderHook(() => useMemoryContext(), { wrapper });

    act(() => {
      result.current.applySnapshot({ notes: ["a"] });
    });
    act(() => {
      result.current.applyDelta([
        { op: "add", path: "/notes/-", value: "b" },
      ] as Operation[]);
    });

    expect(result.current.flashingKeys.has("notes")).toBe(true);
    expect(result.current.snapshot.notes).toEqual(["a", "b"]);
  });

  it("markApplied flashes given keys, then clears after 1.5s", () => {
    const { result } = renderHook(() => useMemoryContext(), { wrapper });

    act(() => {
      result.current.markApplied(["genres", "moods"]);
    });

    expect(result.current.flashingKeys.has("genres")).toBe(true);
    expect(result.current.flashingKeys.has("moods")).toBe(true);

    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(result.current.flashingKeys.size).toBe(0);
  });

  it("repeated flash on same key restarts the timer", () => {
    const { result } = renderHook(() => useMemoryContext(), { wrapper });

    act(() => {
      result.current.markApplied(["genres"]);
    });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    act(() => {
      result.current.markApplied(["genres"]);
    });
    act(() => {
      vi.advanceTimersByTime(1499);
    });
    expect(result.current.flashingKeys.has("genres")).toBe(true);
    act(() => {
      vi.advanceTimersByTime(2);
    });
    expect(result.current.flashingKeys.has("genres")).toBe(false);
  });

  it("useMemoryContext throws when used outside MemoryProvider", () => {
    expect(() => renderHook(() => useMemoryContext())).toThrow(
      /useMemoryContext must be used inside MemoryProvider/,
    );
  });
});
