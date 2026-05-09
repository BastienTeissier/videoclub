"use client";

import { useSyncExternalStore } from "react";
import type { A2UIMessage, ComponentNode } from "@repo/contracts";
import { set as ptrSet } from "./json-pointer";

export interface SurfaceState {
  surfaceId: string;
  catalogId: string;
  rootId: string;
  components: Record<string, ComponentNode>;
  dataModel: unknown;
}

type Listener = () => void;

const surfaces = new Map<string, SurfaceState>();
const listeners = new Set<Listener>();

function emit(): void {
  for (const l of listeners) l();
}

function emptySurface(surfaceId: string, catalogId: string): SurfaceState {
  return {
    surfaceId,
    catalogId,
    rootId: "root",
    components: {},
    dataModel: {},
  };
}

export function applyMessage(msg: A2UIMessage): void {
  if ("createSurface" in msg) {
    const { surfaceId, catalogId } = msg.createSurface;
    const existing = surfaces.get(surfaceId);
    if (existing) {
      // Idempotent: refresh catalogId, preserve components + dataModel
      surfaces.set(surfaceId, { ...existing, catalogId });
    } else {
      surfaces.set(surfaceId, emptySurface(surfaceId, catalogId));
    }
    emit();
    return;
  }

  if ("updateComponents" in msg) {
    const { surfaceId, components } = msg.updateComponents;
    const existing = surfaces.get(surfaceId);
    if (!existing) {
      console.warn(`[a2ui] updateComponents for unknown surface ${surfaceId}`);
      return;
    }
    const nextComponents = { ...existing.components };
    for (const node of components) {
      nextComponents[node.id] = node;
    }
    surfaces.set(surfaceId, { ...existing, components: nextComponents });
    emit();
    return;
  }

  if ("updateDataModel" in msg) {
    const { surfaceId, path, value } = msg.updateDataModel;
    const existing = surfaces.get(surfaceId);
    if (!existing) {
      console.warn(`[a2ui] updateDataModel for unknown surface ${surfaceId}`);
      return;
    }
    const nextModel = ptrSet(existing.dataModel, path, value);
    surfaces.set(surfaceId, { ...existing, dataModel: nextModel });
    emit();
    return;
  }

  if ("deleteSurface" in msg) {
    surfaces.delete(msg.deleteSurface.surfaceId);
    emit();
    return;
  }

  console.warn("[a2ui] unknown message shape", msg);
}

export function clearAllSurfaces(): void {
  if (surfaces.size === 0) return;
  surfaces.clear();
  emit();
}

export function clearSurface(surfaceId: string): void {
  if (!surfaces.has(surfaceId)) return;
  surfaces.delete(surfaceId);
  emit();
}

export function getSurface(surfaceId: string): SurfaceState | undefined {
  return surfaces.get(surfaceId);
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useA2UISurface(surfaceId: string): SurfaceState | undefined {
  return useSyncExternalStore(
    subscribe,
    () => surfaces.get(surfaceId),
    () => undefined,
  );
}
