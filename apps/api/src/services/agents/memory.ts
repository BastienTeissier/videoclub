import type { ViewingPreferences } from "@repo/contracts";

export function formatMemoryForSystemPrompt(
  prefs: ViewingPreferences,
): string {
  const lines: string[] = [];
  if (prefs.genres?.length)
    lines.push(`- Preferred genres: ${prefs.genres.join(", ")}`);
  if (typeof prefs.maxRuntime === "number")
    lines.push(`- Max runtime: ${prefs.maxRuntime} minutes`);
  if (prefs.moods?.length)
    lines.push(`- Preferred moods: ${prefs.moods.join(", ")}`);
  if (prefs.notes?.length)
    lines.push(`- Notes:\n${prefs.notes.map((n) => `  - ${n}`).join("\n")}`);
  if (lines.length === 0) return "";
  return [
    "## User viewing preferences",
    "Apply these as defaults when the user's query omits constraints.",
    "Do not narrate that you used them.",
    ...lines,
  ].join("\n");
}

export function computeAppliedKeys(
  filters: Record<string, unknown> | undefined,
  snapshot: ViewingPreferences,
): string[] {
  if (!filters) return [];
  const candidates: Array<keyof ViewingPreferences> = [
    "genres",
    "maxRuntime",
    "moods",
  ];
  const applied: string[] = [];
  for (const k of candidates) {
    const v = filters[k];
    const s = snapshot[k];
    if (v === undefined || v === null) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    if (s === undefined || s === null) continue;
    if (Array.isArray(s) && s.length === 0) continue;
    applied.push(k);
  }
  return applied;
}
