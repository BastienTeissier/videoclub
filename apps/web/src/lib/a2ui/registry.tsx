"use client";

import { ReviewForm } from "./renderers/review-form";
import { useA2UISurface } from "./store";
import { renderComponent } from "./catalog";

interface TaggedUnionRendererProps {
  surface: { type: string; [key: string]: unknown };
}

interface ProtocolRendererProps {
  surfaceId: string;
}

type A2UIRendererProps = TaggedUnionRendererProps | ProtocolRendererProps;

function isProtocolProps(p: A2UIRendererProps): p is ProtocolRendererProps {
  return "surfaceId" in p;
}

export function A2UIRenderer(props: A2UIRendererProps) {
  if (isProtocolProps(props)) {
    return <ProtocolSurface surfaceId={props.surfaceId} />;
  }
  return <TaggedUnion surface={props.surface} />;
}

function ProtocolSurface({ surfaceId }: { surfaceId: string }) {
  const surface = useA2UISurface(surfaceId);
  if (!surface) return null;
  return <>{renderComponent(surface.components[surface.rootId], surfaceId)}</>;
}

function TaggedUnion({ surface }: TaggedUnionRendererProps) {
  if (surface.type === "review-form") {
    return <ReviewForm data={surface as never} />;
  }
  return null;
}
