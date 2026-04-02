"use client";

import { watchlistGridSurfaceSchema } from "@repo/contracts";
import { WatchlistGrid } from "./renderers/watchlist-grid";

interface SafeParseResult {
  success: boolean;
  data?: unknown;
}

interface RegistryEntry {
  schema: { safeParse: (data: unknown) => SafeParseResult };
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
