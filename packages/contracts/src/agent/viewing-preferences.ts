import { z } from "zod";

const NOTES_MAX = 8;

export const viewingPreferencesSchema = z.object({
  genres: z.array(z.string()).optional(),
  maxRuntime: z.number().int().positive().optional(),
  moods: z.array(z.string()).optional(),
  notes: z.array(z.string()).max(NOTES_MAX).optional(),
});
export type ViewingPreferences = z.infer<typeof viewingPreferencesSchema>;

export const viewingPreferencesPatchSchema = z.object({
  genres: z.array(z.string()).optional(),
  maxRuntime: z.number().int().positive().optional(),
  moods: z.array(z.string()).optional(),
  notes: z.array(z.string()).optional(),
});
export type ViewingPreferencesPatch = z.infer<
  typeof viewingPreferencesPatchSchema
>;

export interface PatchApplication {
  next: ViewingPreferences;
  jsonPatchOps: JsonPatchOp[];
}

type JsonPatchOp =
  | { op: "replace"; path: string; value: unknown }
  | { op: "add"; path: string; value: unknown }
  | { op: "remove"; path: string };

export function applyPatch(
  prev: ViewingPreferences,
  patch: ViewingPreferencesPatch,
): PatchApplication {
  const next: ViewingPreferences = { ...prev };
  const ops: JsonPatchOp[] = [];

  for (const key of ["genres", "maxRuntime", "moods"] as const) {
    if (patch[key] === undefined) continue;
    const before = prev[key];
    next[key] = patch[key] as never;
    ops.push({
      op: before === undefined ? "add" : "replace",
      path: `/${key}`,
      value: patch[key],
    });
  }

  if (patch.notes !== undefined) {
    const existing = prev.notes ?? [];
    const appended = [...existing, ...patch.notes];
    const evicted = appended.length - NOTES_MAX;
    const trimmed =
      evicted > 0 ? appended.slice(evicted) : appended;
    next.notes = trimmed;

    if (existing.length === 0) {
      ops.push({ op: "add", path: "/notes", value: trimmed });
    } else {
      for (let i = 0; i < evicted; i++) {
        ops.push({ op: "remove", path: "/notes/0" });
      }
      for (const note of patch.notes) {
        ops.push({ op: "add", path: "/notes/-", value: note });
      }
    }
  }

  return { next, jsonPatchOps: ops };
}
