"use client";

import { useA2UISurface } from "../store";
import { get } from "../json-pointer";
import type { RendererProps } from "../catalog";

interface FilterChips {
  genres?: string[];
  excludedGenres?: string[];
  moods?: string[];
  maxRuntime?: number;
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full bg-card px-2.5 py-1 text-xs text-foreground ring-1 ring-border">
      {children}
    </span>
  );
}

export function MovieFilterPanel({ node, surfaceId }: RendererProps) {
  const surface = useA2UISurface(surfaceId);
  const path = node.data?.path;
  const value = path
    ? (get(surface?.dataModel, path) as FilterChips | undefined)
    : undefined;

  if (!value) return null;

  const chips: React.ReactNode[] = [];
  for (const g of value.genres ?? []) chips.push(<Chip key={`g-${g}`}>{g}</Chip>);
  if (typeof value.maxRuntime === "number") {
    chips.push(<Chip key="rt">≤ {value.maxRuntime} min</Chip>);
  }
  for (const eg of value.excludedGenres ?? [])
    chips.push(<Chip key={`x-${eg}`}>no {eg}</Chip>);
  for (const m of value.moods ?? [])
    chips.push(<Chip key={`m-${m}`}>{m}</Chip>);

  if (chips.length === 0) return null;

  return <div className="flex flex-wrap gap-2">{chips}</div>;
}
