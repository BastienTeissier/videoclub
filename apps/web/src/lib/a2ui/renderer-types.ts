import type { ComponentNode } from "@repo/contracts";
import type { ReactNode } from "react";

export interface RendererProps {
  node: ComponentNode;
  surfaceId: string;
  children?: ReactNode;
}

export type Renderer = (props: RendererProps) => ReactNode;
