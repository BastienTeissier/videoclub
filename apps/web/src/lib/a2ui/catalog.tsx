"use client";

import type { ComponentNode } from "@repo/contracts";
import type { ReactNode } from "react";
import { Column } from "./renderers/column";
import { Skeleton } from "./renderers/skeleton";
import { MovieFilterPanel } from "./renderers/movie-filter-panel";
import { MovieGrid } from "./renderers/movie-grid";
import { WatchlistGrid } from "./renderers/watchlist-grid";
import { ReviewsGrid } from "./renderers/reviews-grid";
import { getSurface } from "./store";
import type { Renderer } from "./renderer-types";

export type { Renderer, RendererProps } from "./renderer-types";

const catalog: Record<string, Renderer> = {
  Column,
  Skeleton,
  MovieFilterPanel,
  MovieGrid,
  WatchlistGrid,
  ReviewsGrid,
};

export function renderComponent(
  node: ComponentNode | undefined,
  surfaceId: string,
): ReactNode {
  if (!node) return null;
  const Comp = catalog[node.component];
  if (!Comp) {
    console.warn(`[a2ui] unknown component "${node.component}" — skipping`);
    return null;
  }

  const childIds = node.children ?? [];
  const surface = getSurface(surfaceId);
  const children =
    childIds.length > 0
      ? childIds.map((id) => (
          <div key={id}>
            {renderComponent(surface?.components[id], surfaceId)}
          </div>
        ))
      : undefined;

  return (
    <Comp node={node} surfaceId={surfaceId}>
      {children}
    </Comp>
  );
}
