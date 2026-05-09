import { describe, it, expect, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useDomainCollection } from "./use-domain-collection";

interface Item {
  id: string;
  value: number;
}

function setupHook(initialItems: Item[] = []) {
  const fetchFn = vi.fn(async () => initialItems);
  const { result, rerender } = renderHook(() =>
    useDomainCollection<Item, string, Map<string, number>>({
      fetch: fetchFn,
      toState: (items) => new Map(items.map((i) => [i.id, i.value])),
      initialState: new Map(),
    }),
  );
  return { result, rerender, fetchFn };
}

describe("useDomainCollection", () => {
  it("populates state from the initial fetch", async () => {
    const { result } = setupHook([
      { id: "a", value: 1 },
      { id: "b", value: 2 },
    ]);

    await waitFor(() => {
      expect(result.current.state.size).toBe(2);
    });
    expect(result.current.state.get("a")).toBe(1);
    expect(result.current.state.get("b")).toBe(2);
  });

  it("leaves state at initialState when initial fetch fails", async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error("boom"));
    const { result } = renderHook(() =>
      useDomainCollection<Item, string, Map<string, number>>({
        fetch: fetchFn,
        toState: (items) => new Map(items.map((i) => [i.id, i.value])),
        initialState: new Map(),
      }),
    );
    await waitFor(() => {
      expect(fetchFn).toHaveBeenCalled();
    });
    expect(result.current.state.size).toBe(0);
  });

  it("refetch replaces state from a fresh fetch", async () => {
    let callCount = 0;
    const fetchFn = vi.fn(async () => {
      callCount++;
      return callCount === 1
        ? [{ id: "a", value: 1 }]
        : [{ id: "a", value: 1 }, { id: "b", value: 2 }];
    });
    const { result } = renderHook(() =>
      useDomainCollection<Item, string, Map<string, number>>({
        fetch: fetchFn,
        toState: (items) => new Map(items.map((i) => [i.id, i.value])),
        initialState: new Map(),
      }),
    );
    await waitFor(() => expect(result.current.state.size).toBe(1));

    await act(async () => {
      await result.current.refetch();
    });
    expect(result.current.state.size).toBe(2);
  });

  it("mutate applies optimistic, awaits perform, returns its value on success", async () => {
    const { result, fetchFn } = setupHook([]);
    await waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(1));

    let performResult: string | undefined;
    await act(async () => {
      performResult = await result.current.mutate("a", {
        optimistic: (s) => new Map(s).set("a", 1),
        rollback: (s) => {
          const next = new Map(s);
          next.delete("a");
          return next;
        },
        perform: async () => "ok",
      });
    });

    expect(performResult).toBe("ok");
    expect(result.current.state.get("a")).toBe(1);
  });

  it("mutate applies rollback when perform rejects", async () => {
    const { result, fetchFn } = setupHook([]);
    await waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(1));

    let caught: unknown = null;
    await act(async () => {
      try {
        await result.current.mutate("a", {
          optimistic: (s) => new Map(s).set("a", 1),
          rollback: (s) => {
            const next = new Map(s);
            next.delete("a");
            return next;
          },
          perform: async () => {
            throw new Error("nope");
          },
        });
      } catch (e) {
        caught = e;
      }
    });

    expect(caught).toBeInstanceOf(Error);
    expect(result.current.state.has("a")).toBe(false);
  });

  it("does NOT roll back if a newer mutation for the same key fired in between", async () => {
    const { result, fetchFn } = setupHook([]);
    await waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(1));

    let releaseFirst: () => void = () => {};
    const firstPromise = new Promise<string>((_resolve, reject) => {
      releaseFirst = () => reject(new Error("first failed"));
    });

    const firstCall = act(async () => {
      try {
        await result.current.mutate("a", {
          optimistic: (s) => new Map(s).set("a", 1),
          rollback: (s) => {
            const next = new Map(s);
            next.delete("a");
            return next;
          },
          perform: () => firstPromise,
        });
      } catch {
        // expected
      }
    });

    // Fire a second mutation for the same key while the first is in flight.
    await act(async () => {
      await result.current.mutate("a", {
        optimistic: (s) => new Map(s).set("a", 2),
        rollback: (s) => {
          const next = new Map(s);
          next.delete("a");
          return next;
        },
        perform: async () => "second",
      });
    });

    // Now reject the first; rollback should NOT fire.
    await act(async () => {
      releaseFirst();
      await firstCall;
    });

    expect(result.current.state.get("a")).toBe(2);
  });

});