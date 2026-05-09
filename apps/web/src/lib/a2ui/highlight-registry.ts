"use client";

type Highlighter = (criteria: string[]) => void;

const registry = new Map<string, Highlighter>();

export function registerHighlighter(
  surfaceId: string,
  fn: Highlighter,
): () => void {
  registry.set(surfaceId, fn);
  return () => {
    if (registry.get(surfaceId) === fn) registry.delete(surfaceId);
  };
}

export function triggerHighlight(
  surfaceId: string,
  criteria: string[],
): boolean {
  const fn = registry.get(surfaceId);
  if (!fn) return false;
  fn(criteria);
  return true;
}
