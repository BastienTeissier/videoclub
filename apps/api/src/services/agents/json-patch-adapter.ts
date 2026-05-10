import type { Operation } from "fast-json-patch";

/**
 * AG-UI core's `StateDeltaEvent.delta` is typed as `any[]`.
 * fast-json-patch's `Operation[]` is the structured equivalent.
 * This adapter converts between them with one cast per direction,
 * so the rest of the codebase stays cast-free.
 */
export type AgUiDelta = unknown[];

export function toAgUiDelta(ops: Operation[]): AgUiDelta {
  return ops as AgUiDelta;
}

export function fromAgUiDelta(delta: AgUiDelta): Operation[] {
  return delta as Operation[];
}
