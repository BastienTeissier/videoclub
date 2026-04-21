"use client";

import { WatchlistGrid } from "./renderers/watchlist-grid";

type RendererComponent = React.ComponentType<{ data: never }>;

const registry: Record<string, RendererComponent> = {
  "watchlist-grid": WatchlistGrid as RendererComponent,
};

interface A2UIRendererProps {
  surface: { type: string; [key: string]: unknown };
}

export function A2UIRenderer({ surface }: A2UIRendererProps) {
  const Component = registry[surface.type];
  if (!Component) return null;

  return <Component data={surface as never} />;
}
