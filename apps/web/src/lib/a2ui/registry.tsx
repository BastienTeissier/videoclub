"use client";

import type { z } from "zod";
import { watchlistGridSurfaceSchema } from "@repo/contracts";
import { WatchlistGrid } from "./renderers/watchlist-grid";

interface RegistryEntry {
  schema: z.ZodType;
  component: React.ComponentType<{ data: unknown }>;
}

const registry: Record<string, RegistryEntry> = {
  "watchlist-grid": {
    schema: watchlistGridSurfaceSchema,
    component: WatchlistGrid as React.ComponentType<{ data: unknown }>,
  },
};

interface A2UIRendererProps {
  surface: { type: string; [key: string]: unknown };
}

export function A2UIRenderer({ surface }: A2UIRendererProps) {
  const entry = registry[surface.type];
  if (!entry) return null;

  const parsed = entry.schema.safeParse(surface);
  if (!parsed.success) return null;

  const Component = entry.component;
  return <Component data={parsed.data} />;
}
