"use client";

import { useA2UISurface } from "../store";
import { renderComponent, type RendererProps } from "../catalog";

export function Column({ node, surfaceId }: RendererProps) {
  const surface = useA2UISurface(surfaceId);
  const childIds = node.children ?? [];
  return (
    <div className="flex flex-col gap-4">
      {childIds.map((id) => (
        <div key={id}>
          {renderComponent(surface?.components[id], surfaceId)}
        </div>
      ))}
    </div>
  );
}
