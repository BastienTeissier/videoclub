"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { applyPatch as applyJsonPatch, type Operation } from "fast-json-patch";
import type { ViewingPreferences } from "@repo/contracts";

const FLASH_MS = 1500;

interface MemoryContextValue {
  snapshot: ViewingPreferences;
  flashingKeys: ReadonlySet<string>;
  applySnapshot: (snapshot: ViewingPreferences) => void;
  applyDelta: (ops: Operation[]) => void;
  markApplied: (keys: string[]) => void;
}

const MemoryContext = createContext<MemoryContextValue | null>(null);

export function MemoryProvider({ children }: { children: React.ReactNode }) {
  const [snapshot, setSnapshot] = useState<ViewingPreferences>({});
  const [flashingKeys, setFlashingKeys] = useState<ReadonlySet<string>>(
    new Set(),
  );
  const flashTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );

  const flash = useCallback((keys: string[]) => {
    if (keys.length === 0) return;
    setFlashingKeys((prev) => {
      const next = new Set(prev);
      for (const k of keys) next.add(k);
      return next;
    });
    for (const k of keys) {
      const existing = flashTimers.current.get(k);
      if (existing) clearTimeout(existing);
      flashTimers.current.set(
        k,
        setTimeout(() => {
          setFlashingKeys((prev) => {
            if (!prev.has(k)) return prev;
            const next = new Set(prev);
            next.delete(k);
            return next;
          });
          flashTimers.current.delete(k);
        }, FLASH_MS),
      );
    }
  }, []);

  const applySnapshot = useCallback((next: ViewingPreferences) => {
    setSnapshot(next);
  }, []);

  const applyDelta = useCallback(
    (ops: Operation[]) => {
      setSnapshot((prev) => {
        const result = applyJsonPatch(
          structuredClone(prev),
          ops,
          false,
          false,
        ).newDocument;
        return result as ViewingPreferences;
      });
      const touchedKeys = Array.from(
        new Set(
          ops
            .map((op) => op.path.split("/")[1])
            .filter((s): s is string => typeof s === "string" && s.length > 0),
        ),
      );
      flash(touchedKeys);
    },
    [flash],
  );

  const markApplied = useCallback((keys: string[]) => flash(keys), [flash]);

  const value = useMemo(
    () => ({
      snapshot,
      flashingKeys,
      applySnapshot,
      applyDelta,
      markApplied,
    }),
    [snapshot, flashingKeys, applySnapshot, applyDelta, markApplied],
  );

  return (
    <MemoryContext.Provider value={value}>{children}</MemoryContext.Provider>
  );
}

export function useMemoryContext(): MemoryContextValue {
  const ctx = useContext(MemoryContext);
  if (!ctx)
    throw new Error("useMemoryContext must be used inside MemoryProvider");
  return ctx;
}
