import { z } from "zod";

export const NOTES_MAX = 8;

export const jsonPatchOpSchema = z
  .object({
    op: z.enum(["add", "remove", "replace", "move", "copy", "test"]),
    path: z.string(),
  })
  .passthrough();
export const jsonPatchOpsSchema = z.array(jsonPatchOpSchema);
export type JsonPatchOp = z.infer<typeof jsonPatchOpSchema>;

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
  jsonPatchOps: BuildOp[];
}

type BuildOp =
  | { op: "replace"; path: string; value: unknown }
  | { op: "add"; path: string; value: unknown }
  | { op: "remove"; path: string };

function applyNotesPatch(
  prevNotes: string[] | undefined,
  newNotes: string[],
  ops: BuildOp[],
): string[] {
  const existing = prevNotes ?? [];
  const appended = [...existing, ...newNotes];
  const evicted = Math.max(0, appended.length - NOTES_MAX);
  const trimmed = evicted > 0 ? appended.slice(evicted) : appended;

  if (existing.length === 0) {
    ops.push({ op: "add", path: "/notes", value: trimmed });
    return trimmed;
  }

  for (let i = 0; i < evicted; i++) {
    ops.push({ op: "remove", path: "/notes/0" });
  }
  for (const note of newNotes) {
    ops.push({ op: "add", path: "/notes/-", value: note });
  }
  return trimmed;
}

export function applyPatch(
  prev: ViewingPreferences,
  patch: ViewingPreferencesPatch,
): PatchApplication {
  const next: ViewingPreferences = { ...prev };
  const ops: BuildOp[] = [];

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
    next.notes = applyNotesPatch(prev.notes, patch.notes, ops);
  }

  return { next, jsonPatchOps: ops };
}
