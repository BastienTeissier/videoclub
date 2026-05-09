"use client";

import type { RendererProps } from "../renderer-types.js";

export function Column({ children }: RendererProps) {
  return <div className="flex flex-col gap-4">{children}</div>;
}