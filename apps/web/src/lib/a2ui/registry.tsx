"use client";

import { useA2UISurface } from "./store.js";
import { renderComponent } from "./catalog.js";

interface A2UIRendererProps {
  surfaceId: string;
}

export function A2UIRenderer({ surfaceId }: A2UIRendererProps) {
  const surface = useA2UISurface(surfaceId);
  if (!surface) return null;
  return <>{renderComponent(surface.components[surface.rootId], surfaceId)}</>;
}