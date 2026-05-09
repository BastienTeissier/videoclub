"use client";

import type { ComponentNode } from "@repo/contracts";
import type { ReactNode } from "react";
import { Column } from "./renderers/column.js";
import { Skeleton } from "./renderers/skeleton.js";
import { MovieFilterPanel } from "./renderers/movie-filter-panel.js";
import { MovieGrid } from "./renderers/movie-grid.js";
import { WatchlistGrid } from "./renderers/watchlist-grid.js";
import { ReviewsGrid } from "./renderers/reviews-grid.js";
import { ReviewForm } from "./renderers/review-form.js";
import { getSurface } from "./store.js";
import type { Renderer } from "./renderer-types.js";

export type { Renderer, RendererProps } from "./renderer-types.js";

const catalog: Record<string, Renderer> = {
  Column,
  Skeleton,
  MovieFilterPanel,
  MovieGrid,
  WatchlistGrid,
  ReviewsGrid,
  ReviewForm,
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