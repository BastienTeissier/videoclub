"use client";

import { getHighlighters, clearHighlighters } from "./store";

type Highlighter = (criteria: string[]) => void;

// Per-surface registry, stored alongside the surface state in `./store` so it
// shares the surface lifecycle (cleared on `clearSurface` / `clearAllSurfaces`)
// and so multiple renderers attached to the same surface all receive flashes
// instead of last-writer-wins.
export function registerHighlighter(
  surfaceId: string,
  fn: Highlighter,
): () => void {
  const set = getHighlighters(surfaceId);
  set.add(fn);
  return () => {
    set.delete(fn);
    if (set.size === 0) clearHighlighters(surfaceId);
  };
}

export function triggerHighlight(
  surfaceId: string,
  criteria: string[],
): boolean {
  const set = getHighlighters(surfaceId, { create: false });
  if (!set || set.size === 0) return false;
  for (const fn of set) fn(criteria);
  return true;
}

export type { Highlighter };
