# Implementation Plan: UF2 — Adaptive view layout

> Slice of the [macro plan](./agentic-movie-experience-plan.md). Builds on UF1 (A2UI v0.9 protocol on the wire, `discovery` tool, surface store). Adds `view: "comparison" | "night-plan"` to the existing `discovery` tool, two new catalog components (`MovieComparisonTable`, `MovieNightPlan`), and a structure-vs-data swap that preserves loaded movies. UF3 (memory), UF4 (HITL approval), UF5 (frontend tools + inspector) are out of scope.

## 1. Feature Description

**Objective**: Let the LLM choose a layout per query. Same surface (`surfaceId: "discovery"`) re-renders as `MovieGrid` / `MovieComparisonTable` / `MovieNightPlan` depending on `view`. Switching view emits an `updateComponents` (structure swap) plus a small `updateDataModel /comparison` or `/plan` (data delta). Loaded movies are reused via local-DB `findByIds` — no TMDB call, no full data rebuild.

**Key Capabilities**:
- **CAN** accept `view: "grid" | "comparison" | "night-plan"` on the `discovery` tool; value visible in `TOOL_CALL_ARGS`
- **CAN** emit `MovieComparisonTable` bound to `/comparison` (shortlistIds + criteria) and `/movies`
- **CAN** emit `MovieNightPlan` bound to `/plan` (pickedMovieId + backupMovieIds + reason) and `/movies`
- **CAN** resolve shortlist / picked / backup ids against the local `movies` table via `moviesRepository.findByIds` preserving caller order; no TMDB
- **CAN** fall back to `view: "grid"` with a `warnings[]` entry when `view` is unknown, when `comparison` receives `< 2` ids, or when `night-plan` receives no `pickedMovieId`
- **CAN** translate tool-result `warnings[]` into AG-UI `CUSTOM { name: "warning" }` events for inspector consumption (UF5 will display them)
- **CAN** expose an imperative column-flash API on `MovieComparisonTable` via a module-level highlighter registry keyed by `surfaceId` (consumed in UF5 by `highlight_comparison_criteria`)
- **CANNOT** persist a movie-night plan (UF4)
- **CANNOT** show the approval dialog / interrupt UI (UF4)
- **CANNOT** invoke `highlight_comparison_criteria` itself — only registers the hook (UF5)
- **CANNOT** apply preferences memory to the `view` choice (UF3)

**Business Rules**:
- `view` is validated inside `discovery.execute`. Unknown values → `view = "grid"` + `warnings: [{ code: "invalid-view", requested }]` (existing UF1 behaviour preserved).
- `view: "comparison"` requires `shortlistMovieIds.length >= 2`. Below threshold → `view = "grid"` + `warnings: [{ code: "comparison-too-few", count }]`. Tool's structured `data` echoes the original requested view so the LLM can narrate "I couldn't find enough movies to compare."
- `view: "night-plan"` requires `pickedMovieId`. Missing → `view = "grid"` + `warnings: [{ code: "night-plan-incomplete" }]`.
- `comparison` and `night-plan` views do **not** call `searchStructured`; they only call `findByIds` on the local DB. No filter panel rendered.
- `discoverySurfaceMessages` for `comparison` emits: `createSurface` → `updateComponents` (root: Column → MovieComparisonTable) → `updateDataModel /movies` (resolved subset, preserves caller id order) → `updateDataModel /comparison` (`{ shortlistIds, criteria }`).
- `discoverySurfaceMessages` for `night-plan` emits: `createSurface` → `updateComponents` (root: Column → MovieNightPlan) → `updateDataModel /movies` (`[picked, ...backups]` resolved) → `updateDataModel /plan` (`{ pickedMovieId, backupMovieIds, reason }`).
- `createSurface` is idempotent (UF1 invariant): swapping view preserves prior `/movies` and `/filters` until the next `updateDataModel` overwrites them.
- `comparisonCriteria` is a free-form `string[]`. Renderer maps known keys to derived columns (`runtime`, `year`, `director`, `genres`); unknown criteria render an empty column with the criterion as header (no crash).
- `MovieComparisonTable` registers a highlighter via `registerHighlighter(surfaceId, (criteria: string[]) => void)` on mount and unregisters on unmount. UF5 wires the handler from the frontend-tools registry; UF2 only ships the registration plumbing + a CSS class toggle.

**Visual Design**: see `prd.md` § Visual ("comparison" and "night-plan" frames are not sketched separately — both render inside the existing `discovery` surface slot). `uf2-adaptive-view-layout.md` § Specification.

---

## 2. Architecture

Legend: 🟢 new file · 🟡 modified file · ⚪ reused as-is.

### A. Database (`packages/db/`)

**A1.** `repositories/movies.ts` 🟡 — add `findByIds(ids: string[]): Promise<Movie[]>`. Uses `inArray(movies.id, ids)`; result re-sorted in JS to match caller order; missing ids dropped silently. Existing `searchStructured` untouched.

  **Why**: `discovery` for `comparison` / `night-plan` resolves the shortlist locally. The renderer joins by id, so caller-order preservation matters.

### B. Contracts (`packages/contracts/`)

**B1.** `a2ui/catalog.ts` 🟡 — append two entries to `videoclubCatalog`:
- `MovieComparisonTable` — `description: "Comparison table over a movie shortlist (rows = movies, columns = criteria like runtime, mood, group-safety). Reads /comparison (shortlistIds + criteria) and joins against /movies."`, `bindablePaths: ["/comparison", "/movies"]`
- `MovieNightPlan` — `description: "Final movie-night recommendation: one picked movie, optional backups, free-text reason. Reads /plan (pickedMovieId + backupMovieIds + reason) and joins against /movies."`, `bindablePaths: ["/plan", "/movies"]`

  **Why**: catalog is the LLM's allowlist. UF1 left these out; UF2 turns them on. `getCatalogPromptDescription()` automatically picks them up.

**B2.** No changes to `a2ui/protocol.ts` — the four message kinds (`createSurface` / `updateComponents` / `updateDataModel` / `deleteSurface`) already cover everything UF2 emits.

### C. API agent + tools (`apps/api/src/`)

**C1.** `services/agents/a2ui-emitter.ts` 🟡 — split discovery emission. Replace the single `discoverySurfaceMessages` with three pure helpers + a dispatcher:

```ts
type DiscoveryView = "grid" | "comparison" | "night-plan";

interface DiscoverySurfaceArgs {
  surfaceId?: string;
  view: DiscoveryView;
  filters?: DiscoveryFilters;          // grid only
  movies: MovieDto[];                  // resolved subset for comparison/night-plan, full result for grid
  shortlistIds?: string[];             // comparison
  criteria?: string[];                 // comparison
  pickedMovieId?: string;              // night-plan
  backupMovieIds?: string[];           // night-plan
  reason?: string;                     // night-plan
}

export function discoverySurfaceMessages(args: DiscoverySurfaceArgs): A2UIMessage[]
export function discoveryGridMessages(...): A2UIMessage[]            // existing UF1 body, unchanged
export function discoveryComparisonMessages(...): A2UIMessage[]      // new
export function discoveryNightPlanMessages(...): A2UIMessage[]       // new
```

- `discoveryComparisonMessages` emits: `createSurface(discovery)` → `updateComponents` (root: Column → `[comparison]`; child id `comparison` → `MovieComparisonTable` bound to `/comparison`) → `updateDataModel /movies` (resolved shortlist, caller order) → `updateDataModel /comparison` (`{ shortlistIds, criteria: criteria ?? [] }`).
- `discoveryNightPlanMessages` emits: `createSurface` → `updateComponents` (root: Column → `[plan]`; child `plan` → `MovieNightPlan` bound to `/plan`) → `updateDataModel /movies` (`[picked, ...backups]` resolved, picked first) → `updateDataModel /plan` (`{ pickedMovieId, backupMovieIds: backupMovieIds ?? [], reason: reason ?? null }`).
- Existing UF1 grid emission moves verbatim to `discoveryGridMessages`. The dispatcher routes by `args.view`.

  **Why**: pure, ordered functions are unit-testable and let `discovery.ts` stay declarative. Splitting per-view keeps each emitter under ~15 lines.

**C2.** `features/tools/discovery.ts` 🟡 — extend input schema and execute branching:

```ts
const VALID_VIEWS = ["grid", "comparison", "night-plan"] as const;

inputSchema: z.object({
  filters: discoveryFiltersSchema.optional(),
  view: z.string().default("grid"),
  shortlistMovieIds: z.array(z.string()).optional(),
  comparisonCriteria: z.array(z.string()).optional(),
  pickedMovieId: z.string().optional(),
  backupMovieIds: z.array(z.string()).optional(),
  reason: z.string().optional(),
})
```

`execute` flow:
1. Validate `view`. Unknown → `view = "grid"`, push `warning: invalid-view`.
2. If requested `view === "comparison"`:
   - If `(shortlistMovieIds?.length ?? 0) < 2` → fall back to `view = "grid"`, push `warning: comparison-too-few`.
   - Else: `rows = await moviesRepository(db).findByIds(shortlistMovieIds!)`; `movies = rows.map(movieToDto)`; emit `discoveryComparisonMessages({ surfaceId, movies, shortlistIds: shortlistMovieIds, criteria: comparisonCriteria })`. Skip `searchStructured`.
3. If requested `view === "night-plan"`:
   - If `!pickedMovieId` → fall back to `view = "grid"`, push `warning: night-plan-incomplete`.
   - Else: `ids = [pickedMovieId, ...(backupMovieIds ?? [])]`; `rows = findByIds(ids)`; if `rows.find(r => r.id === pickedMovieId)` is missing → fall back to grid + `warning: night-plan-unknown-pick`; else emit `discoveryNightPlanMessages(...)`.
4. If effective `view === "grid"` (either chosen or fallen back): existing UF1 path — `searchMoviesData(db, dbFilters)` → `discoveryGridMessages(...)`.
5. Return `{ data: { movies, filters, view: effectiveView, requestedView }, a2uiMessages, ...(warnings.length ? { warnings } : {}) }`.

`description` keeps the catalog summary (auto-includes the two new components) and adds:

> Pick `view: "comparison"` when the user wants a side-by-side compare across a shortlist (≥2 movie ids) of already-discussed movies; pass `shortlistMovieIds` (the ids the user asked about) and optional `comparisonCriteria` (e.g., ["runtime", "mood", "group-safety"]). Pick `view: "night-plan"` when the user asks to pick one for tonight; pass `pickedMovieId`, optional `backupMovieIds[]`, and a short `reason`. Default to `view: "grid"` for fresh discovery queries.

  **Why**: one tool, three views — keeps the LLM's tool registry stable, makes the layout choice observable in `TOOL_CALL_ARGS`. Branching in `execute` keeps view logic colocated with the tool the LLM sees.

**C3.** `services/agents/ag-ui-stream.ts` 🟡 — translate `output.warnings[]` to `CUSTOM { name: "warning" }` events. After the `extractA2UIMessages` block on `tool-result`:

```ts
const warnings = extractWarnings(part.output);    // new helper, mirrors extractA2UIMessages
for (const w of warnings) {
  yield encoder.encode({ type: EventType.CUSTOM, name: "warning", value: w });
}
```

Strip `warnings` from `TOOL_CALL_RESULT.content` (extend `stripA2UIMessages` → `stripUiNoise` to drop both `a2uiMessages` and `warnings`).

  **Why**: `discovery` warnings need to reach the inspector (UF5) without polluting the LLM's tool history. Wiring it now keeps UF5 a pure UI add. Sleep-between-frames is unchanged (warnings emit without sleep).

**C4.** `services/agents/system-prompt.ts` 🟡 — append paragraph between the existing `discovery` block and the TMDB block:

> The `discovery` tool exposes three views via the `view` parameter:
> - `view: "grid"` (default) — fresh searches by filter. Use for any "find me…", "what about…", "show me movies…" intent.
> - `view: "comparison"` — when the user asks to compare/contrast/decide between movies they have already seen in the chat (e.g., "compare the top 3", "which is shortest"). Pass `shortlistMovieIds` (≥2 ids drawn from the prior grid) and `comparisonCriteria` (e.g., ["runtime", "mood", "group-safety"]).
> - `view: "night-plan"` — when the user asks to finalize a pick for tonight (e.g., "pick one for tonight", "what should we watch, plus a backup"). Pass `pickedMovieId`, an optional `backupMovieIds` array, and a short `reason`. UF4 will add an approval step on top of this — for now the surface just renders.
>
> Never invent movie ids — only pass ids that appeared in a prior `discovery` tool result this session.

  **Why**: makes view selection deterministic enough for the demo prompts without bloating the prompt with examples.

### D. Web client (`apps/web/src/`)

**D1.** `lib/a2ui/catalog.tsx` 🟡 — register two new renderers in the catalog map:
```ts
const catalog: Record<string, Renderer> = {
  Column, Skeleton, MovieFilterPanel, MovieGrid,
  WatchlistGrid, ReviewsGrid, ReviewForm,
  MovieComparisonTable, MovieNightPlan,    // new
};
```

**D2.** `lib/a2ui/renderers/movie-comparison-table.tsx` 🟢 — reads `/comparison` and `/movies` from the surface store, renders a `<table>` with one row per resolved movie, one column per criterion. Imperative highlight wired via `registerHighlighter(surfaceId, fn)` on mount.

```tsx
import { useEffect, useRef } from "react";
import { useA2UISurface } from "../store";
import { get } from "../json-pointer";
import { registerHighlighter } from "../highlight-registry";

interface ComparisonState { shortlistIds?: string[]; criteria?: string[] }

const CELL_GETTERS: Record<string, (m: MovieDto) => string> = {
  runtime: (m) => (m.runtime ? `${m.runtime} min` : "—"),
  year: (m) => (m.year ? String(m.year) : "—"),
  director: (m) => m.directors?.[0] ?? "—",
  genres: (m) => (m.genres ?? []).join(", ") || "—",
  // unknown criteria → empty cell (the column header still appears)
};

export function MovieComparisonTable({ node, surfaceId }: RendererProps) {
  const surface = useA2UISurface(surfaceId);
  const state = (get(surface?.dataModel, node.data?.path ?? "/comparison") ?? {}) as ComparisonState;
  const movies = (get(surface?.dataModel, "/movies") ?? []) as MovieDto[];
  const ids = state.shortlistIds ?? [];
  const criteria = state.criteria ?? [];
  const rows = ids.map((id) => movies.find((m) => m.id === id)).filter(Boolean) as MovieDto[];

  const colRefs = useRef<Record<string, HTMLTableColElement | null>>({});
  useEffect(() => {
    return registerHighlighter(surfaceId, (which) => {
      for (const c of which) {
        const el = colRefs.current[c];
        if (!el) continue;
        el.classList.remove("a2ui-flash");
        // force reflow so re-adding the class restarts the animation
        void el.offsetWidth;
        el.classList.add("a2ui-flash");
      }
    });
  }, [surfaceId]);

  if (rows.length === 0) return <p className="text-sm text-muted">No movies to compare.</p>;
  return (
    <table className="w-full text-sm">
      <colgroup>
        <col />
        {criteria.map((c) => (
          <col key={c} ref={(el) => { colRefs.current[c] = el; }} />
        ))}
      </colgroup>
      <thead>
        <tr><th className="text-left">Movie</th>{criteria.map((c) => <th key={c} className="text-left capitalize">{c}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((m) => (
          <tr key={m.id}>
            <td className="font-medium">{m.title}{m.year ? ` (${m.year})` : ""}</td>
            {criteria.map((c) => <td key={c}>{(CELL_GETTERS[c] ?? (() => "—"))(m)}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

CSS for `.a2ui-flash` lives in the existing `globals.css`: `@keyframes a2ui-flash { 0% { background: var(--accent); } 100% { background: transparent; } } .a2ui-flash { animation: a2ui-flash 1.4s ease-out; }`.

  **Why**: table is plain HTML + Tailwind to keep the renderer focused on the protocol concern. The `colgroup`+`<col>` pattern lets us toggle a class on a single column element, which paints the whole column with one DOM op. CSS class toggle is enough for the demo flash; UF5 only flips the trigger.

**D3.** `lib/a2ui/renderers/movie-night-plan.tsx` 🟢 — reads `/plan` and `/movies`. Renders the picked `MovieCard` larger (or with a "Tonight" ribbon), a backups row, and the reason as italicized text below.

```tsx
interface PlanState { pickedMovieId?: string; backupMovieIds?: string[]; reason?: string | null }

export function MovieNightPlan({ node, surfaceId }: RendererProps) {
  const surface = useA2UISurface(surfaceId);
  const plan = (get(surface?.dataModel, node.data?.path ?? "/plan") ?? {}) as PlanState;
  const movies = (get(surface?.dataModel, "/movies") ?? []) as MovieDto[];
  const picked = movies.find((m) => m.id === plan.pickedMovieId);
  const backups = (plan.backupMovieIds ?? [])
    .map((id) => movies.find((m) => m.id === id))
    .filter(Boolean) as MovieDto[];

  if (!picked) return <p className="text-sm text-muted">No pick yet.</p>;
  return (
    <section className="space-y-4">
      <div>
        <p className="mb-2 text-xs uppercase tracking-wide text-muted">Tonight</p>
        <MovieCard movie={picked} />
      </div>
      {backups.length > 0 && (
        <div>
          <p className="mb-2 text-xs uppercase tracking-wide text-muted">Backups</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {backups.map((m) => <MovieCard key={m.id} movie={m} />)}
          </div>
        </div>
      )}
      {plan.reason && <p className="text-sm italic text-muted">{plan.reason}</p>}
    </section>
  );
}
```

  **Why**: reuses `MovieCard` ⚪ (overlays, bookmark, review icons all keep working). Approval dialog is UF4 — UF2 only renders the surface.

**D4.** `lib/a2ui/highlight-registry.ts` 🟢 — module-level registry keyed by `surfaceId`:

```ts
type Highlighter = (criteria: string[]) => void;
const registry = new Map<string, Highlighter>();

export function registerHighlighter(surfaceId: string, fn: Highlighter): () => void {
  registry.set(surfaceId, fn);
  return () => { if (registry.get(surfaceId) === fn) registry.delete(surfaceId); };
}

export function triggerHighlight(surfaceId: string, criteria: string[]): boolean {
  const fn = registry.get(surfaceId);
  if (!fn) return false;
  fn(criteria);
  return true;
}
```

  **Why**: UF5's frontend-tools dispatcher runs outside the React tree (called from `onToolCallEndEvent` in `useAgentChat`); a module-level registry avoids context plumbing. UF2 only ships register/trigger; UF5 wires `triggerHighlight` to the `highlight_comparison_criteria` tool name.

**D5.** No changes to `lib/a2ui/registry.tsx`, `store.ts`, `json-pointer.ts`, or `use-agent-chat.ts`. The `<A2UIRenderer surfaceId="discovery"/>` invocation in `movie-search.tsx` already handles the swap — when `updateComponents` lands, the catalog dispatch picks up the new component name automatically.

### E. Environment

No new env vars. `DEMO_MODE_SLEEP` (UF1) continues to gate the inter-frame sleep.

### F. Dependencies

No new deps.

---

## 3. Test List

Tests for added behavior only.

### Unit (Vitest)

**Movies repository** — `packages/db/src/repositories/movies.test.ts` 🟡 *(extend)*
1. **`findByIds` preserves caller order** — given DB with movies `A, B, C`, calling `findByIds(["C","A","B"])` returns rows in that order
2. **`findByIds` drops missing ids silently** — `findByIds(["A", "missing"])` returns `[A]`, no throw
3. **`findByIds([])`** — returns `[]` without hitting the DB

**A2UI emitter** — `apps/api/src/services/agents/a2ui-emitter.test.ts` 🟡 *(extend)*
4. **`discoveryComparisonMessages` orders frames** — given `{ shortlistIds: [a,b,c], criteria: ["runtime","mood"], movies: [m_a, m_b, m_c] }`, returns `[createSurface, updateComponents (root → MovieComparisonTable bound to /comparison), updateDataModel /movies, updateDataModel /comparison]`
5. **`discoveryComparisonMessages` /movies value preserves caller order** — third frame's value is `[m_a, m_b, m_c]`, not popularity-sorted
6. **`discoveryNightPlanMessages` orders frames** — `[createSurface, updateComponents (root → MovieNightPlan bound to /plan), updateDataModel /movies, updateDataModel /plan]`; `/movies` value is `[picked, ...backups]`
7. **`discoveryNightPlanMessages` /plan carries picked + backups + reason** — fields match input; missing `reason` serialised as `null`
8. **`discoverySurfaceMessages` dispatcher** — given `view: "grid"` returns the existing 5-frame grid sequence; given `view: "comparison"` returns 4 frames (no skeleton); given `view: "night-plan"` returns 4 frames

**Discovery tool** — `apps/api/src/features/tools/discovery.test.ts` 🟡 *(extend)*
9. **`view: "comparison"` happy path** — given `shortlistMovieIds: [id1, id2, id3]`, calls `findByIds` (NOT `searchStructured`), returns `{ data: { view: "comparison", movies: 3 entries }, a2uiMessages: 4 frames }`
10. **`view: "comparison"` with `< 2` ids falls back to grid + warning** — `shortlistMovieIds: [id1]` → `data.view === "grid"`, `data.requestedView === "comparison"`, `warnings: [{ code: "comparison-too-few", count: 1 }]`, `a2uiMessages` is the grid sequence
11. **`view: "night-plan"` happy path** — given `pickedMovieId: id1, backupMovieIds: [id2, id3]`, returns `{ data: { view: "night-plan" }, a2uiMessages: 4 frames }`; `findByIds` is called once with `[id1, id2, id3]` (picked first)
12. **`view: "night-plan"` without `pickedMovieId`** — falls back to grid + `warnings: [{ code: "night-plan-incomplete" }]`
13. **`view: "night-plan"` with unknown picked id** — `findByIds` returns no row matching `pickedMovieId` → falls back to grid + `warnings: [{ code: "night-plan-unknown-pick" }]`
14. **Invalid `view: "carousel"` (UF1 regression)** — still falls back to grid + `warnings: [{ code: "invalid-view", requested: "carousel" }]`
15. **Description includes both new catalog component names** — `desc` contains `"MovieComparisonTable"` and `"MovieNightPlan"`

**ag-ui-stream** — `apps/api/src/services/agents/ag-ui-stream.test.ts` 🟡 *(extend)*
16. **Emits `CUSTOM { name: "warning" }` for each entry in `output.warnings`** — given a `tool-result` with `output.warnings: [{ code: "invalid-view" }]`, the SSE stream contains a CUSTOM warning event after the A2UI events and before `TOOL_CALL_RESULT`
17. **`warnings` is stripped from `TOOL_CALL_RESULT.content`** — parsed content has `data` and not `warnings`
18. **No CUSTOM warning emitted when `warnings` absent or empty** — backwards-compat for UF1 tools

### Component (React Testing Library)

**MovieComparisonTable** — `apps/web/src/lib/a2ui/renderers/movie-comparison-table.test.tsx` 🟢
19. **Renders one row per shortlist id (resolved via /movies)** — surface with `/comparison: { shortlistIds: [a,b,c], criteria: ["runtime"] }` and `/movies: [m_a, m_b, m_c, m_d]` → 3 rows in `[a,b,c]` order; `m_d` not rendered
20. **Missing id resolves to no row, no crash** — `shortlistIds: [a, "missing"]` → 1 row
21. **Known criterion renders cell value** — `criteria: ["runtime"]` with `m_a.runtime = 95` → cell text `"95 min"`
22. **Unknown criterion renders empty cell with header** — `criteria: ["vibes"]` → header "vibes" appears, cells render `"—"`
23. **`triggerHighlight(surfaceId, ["runtime"])` toggles `.a2ui-flash` on the runtime column** — render the table, call `triggerHighlight`, assert `<col>` has the class
24. **Highlighter unregisters on unmount** — render then unmount; subsequent `triggerHighlight` returns `false`

**MovieNightPlan** — `apps/web/src/lib/a2ui/renderers/movie-night-plan.test.tsx` 🟢
25. **Renders picked movie and backups** — `/plan: { pickedMovieId: a, backupMovieIds: [b, c] }`, `/movies: [m_a, m_b, m_c]` → "Tonight" section shows `m_a`, "Backups" section shows `m_b` and `m_c`
26. **Renders reason when present** — `plan.reason = "feel-good Friday pick"` → italic text appears
27. **No backups section when `backupMovieIds` empty** — assert "Backups" heading absent
28. **Missing picked movie shows fallback** — `pickedMovieId` not in `/movies` → "No pick yet." rendered

**A2UIRenderer view swap** — `apps/web/src/lib/a2ui/registry.test.tsx` 🟡 *(extend)*
29. **Swap grid → comparison preserves /movies** — apply UF1 grid messages (5 frames), assert `MovieGrid` rendered; apply UF2 comparison messages (4 frames) with `shortlistIds` subset; `MovieGrid` is replaced by `MovieComparisonTable`; the `/movies` data model still has the original grid entries (table reads them by id)
30. **Swap comparison → night-plan** — same surface, sequential apply; final render shows `MovieNightPlan`; `/comparison` lingers in the data model (no clear) but is no longer rendered (no component bound to it)

### Verify gate (UF2)

- `pnpm typecheck` green
- `pnpm lint` green
- `pnpm test` green across `@repo/contracts`, `@repo/db`, `@repo/api`, `@repo/web`
- Live in-browser: prompt "feel-good comedy under 2h" → grid renders (UF1 regression). Then "compare the top 3" → grid swaps to comparison table (3 rows, criteria columns), `/movies` still in network trace from prior frame, only `/comparison` patched. Then "pick one for tonight, plus a backup" → night-plan surface renders with picked + backups + reason. Network tab shows `TOOL_CALL_ARGS` with the chosen `view`.
- Live: edge case — prompt "compare just one movie" → grid reappears with a `CUSTOM { name: "warning", value: { code: "comparison-too-few" } }` event in the network trace (no inspector yet — UF5 surfaces it visually).
- Live: edge case — prompt "what should we watch tonight" without a `pickedMovieId` (LLM omits it) → grid fallback + warning emitted; LLM acknowledges in chat.

*(Golden-trace runner is bootstrapped in UF5 / Phase 5 of the macro plan. UF2 may opt-in by manual SSE capture into `apps/api/tests/__goldens__/uf2-comparison.json` and `uf2-night-plan.json` if convenient — not a verify-gate requirement.)*

---

## 4. To Do List

Tasks ordered by build dependency. Each bullet is a commit-sized unit. Verify gate at the end of each phase must pass before moving on.

### Phase 0 — UF2 prerequisites (~¼ day)

- [ ] **Add `findByIds` to movies repo** — `packages/db/src/repositories/movies.ts` 🟡
  - Implement with `inArray(movies.id, ids)` + JS re-sort on caller order
  - Tests per §3 (1)–(3)

- [ ] **Add `MovieComparisonTable` and `MovieNightPlan` to catalog** — `packages/contracts/src/a2ui/catalog.ts` 🟡
  - Two new entries; descriptions mention bindable paths
  - No barrel changes (re-export already in place)

- [ ] **Verify Phase 0**: `pnpm --filter @repo/db test` and `pnpm --filter @repo/contracts test` green; `pnpm typecheck` green

### Phase 1 — Server emission (~½ day)

- [ ] **Split `discoverySurfaceMessages` into per-view emitters + dispatcher** — `apps/api/src/services/agents/a2ui-emitter.ts` 🟡
  - Move existing UF1 grid body into `discoveryGridMessages`
  - Add `discoveryComparisonMessages`, `discoveryNightPlanMessages`
  - Keep `discoverySurfaceMessages` as the dispatcher (callers import the same name)
  - Tests per §3 (4)–(8)

- [ ] **Extend `discovery` tool** — `apps/api/src/features/tools/discovery.ts` 🟡
  - Input schema gets `shortlistMovieIds`, `comparisonCriteria`, `pickedMovieId`, `backupMovieIds`, `reason`
  - Branch in `execute` on `view`; build `warnings[]`; resolve via `moviesRepository.findByIds` for non-grid views
  - Update tool description (the appended view paragraph)
  - Tests per §3 (9)–(15)

- [ ] **Wire warning emission in `ag-ui-stream`** — `apps/api/src/services/agents/ag-ui-stream.ts` 🟡
  - Add `extractWarnings(output)` helper next to `extractA2UIMessages`
  - Emit `CUSTOM { name: "warning", value: w }` per entry; strip `warnings` from `TOOL_CALL_RESULT.content` (rename helper to `stripUiNoise` or add a second strip)
  - Tests per §3 (16)–(18)

- [ ] **Update system prompt with view-selection guidance** — `apps/api/src/services/agents/system-prompt.ts` 🟡
  - Append the three-bullet view paragraph from §2 C4

- [ ] **Verify Phase 1**: `pnpm --filter @repo/api test` green; `pnpm --filter @repo/api dev`, send a discovery query then "compare the top 3", inspect SSE for the second tool call's `view: "comparison"` argument

### Phase 2 — Client renderers + catalog wiring (~½ day)

- [ ] **Highlight registry** — `apps/web/src/lib/a2ui/highlight-registry.ts` 🟢 + colocated unit test (`registerHighlighter` returns an unsubscribe; `triggerHighlight` returns `false` when no fn registered)

- [ ] **`MovieComparisonTable` renderer** — `apps/web/src/lib/a2ui/renderers/movie-comparison-table.tsx` 🟢 + tests per §3 (19)–(24)
  - Add `.a2ui-flash` keyframe + class to `apps/web/src/app/globals.css` (or whatever the existing global stylesheet path is — confirm during implementation)

- [ ] **`MovieNightPlan` renderer** — `apps/web/src/lib/a2ui/renderers/movie-night-plan.tsx` 🟢 + tests per §3 (25)–(28)

- [ ] **Register both in client catalog map** — `apps/web/src/lib/a2ui/catalog.tsx` 🟡

- [ ] **A2UIRenderer view-swap regression test** — `apps/web/src/lib/a2ui/registry.test.tsx` 🟡 + tests per §3 (29)–(30)

- [ ] **Verify Phase 2**: `pnpm --filter @repo/web test` green for new renderers, registry, and highlight registry

### Phase 3 — Live verify + polish (~¼ day)

- [ ] **Live UF2 walkthrough** with `DEMO_MODE_SLEEP=700`:
  1. "feel-good comedy under 2h" → grid (UF1 regression)
  2. "compare the top 3 by runtime" → comparison table renders, `TOOL_CALL_ARGS.view === "comparison"` in DevTools, `/comparison` and `/movies` patches visible
  3. "pick one for tonight, plus a backup" → night-plan surface
  4. "compare just one of them" → grid + warning event in network trace
- [ ] **`pnpm typecheck && pnpm lint && pnpm test && pnpm depcruise`** all green
- [ ] **Update `context.md`** — note UF2 has shipped; record any in-flight code state if relevant

### Cross-phase fallback (pre-agreed in macro plan)

If the LLM struggles to pick `view` reliably during rehearsal, fall back to deterministic intent classification: extend `agent-run` to inspect the user message for keywords (`compare|side by side` → comparison, `pick|tonight|finalize` → night-plan) and inject the chosen `view` into the tool call before `streamText` resolves. This is the L3 ("hybrid") fallback the macro plan already authorizes — only invoke if rehearsal #1 (Phase 6) shows >25% miss rate on view choice.

---

## 5. Context: Current System Architecture

### A2UI surface stack (post-UF1)

A2UI v0.9 messages travel as AG-UI `CUSTOM { name: "a2ui" }` events. `a2ui-emitter.ts` produces ordered message arrays; `ag-ui-stream.ts` translates each into a CUSTOM event (with optional `DEMO_MODE_SLEEP`). The web client's `applyMessage` (`store.ts`) updates per-surface state via JSON Pointer; `useA2UISurface(surfaceId)` subscribes via `useSyncExternalStore`. `<A2UIRenderer surfaceId="..."/>` walks the component graph; the catalog map (`catalog.tsx`) routes by component name.

- **Current behaviour (UF1)**: `discovery` tool emits 5-frame grid sequence; `view` param accepted but only `"grid"` honoured; `MovieGrid`, `MovieFilterPanel`, `Skeleton`, `Column`, `WatchlistGrid`, `ReviewsGrid`, `ReviewForm` registered.
- **UF2-relevant gaps**: catalog has no `MovieComparisonTable` / `MovieNightPlan`; emitter only emits grid frames; discovery tool's `execute` ignores `shortlistMovieIds` etc.; `ag-ui-stream` doesn't translate `warnings[]`.

### Discovery tool (post-UF1)

`createDiscoveryTool(db)` accepts `{ filters?, view: string }`. Calls `searchMoviesData(db, filters)` (which forwards to `moviesRepository.searchStructured`); maps rows to DTO; emits `discoverySurfaceMessages({ surfaceId: "discovery", filters, movies })`. Invalid `view` → falls back to `"grid"` + adds `{ code: "invalid-view" }` to `warnings[]`. `data.view` echoes the validated view.

### Agent run lifecycle (post-Amendment C)

`agentRun(db).start(...)` and `agentRun(db).resume(...)` own session creation, run row, `streamText` config, persistence in `onFinish`. UF2 doesn't touch this — it only adjusts the discovery tool's behaviour and the system prompt.

### DB stack

- `movies` table: existing, no schema change needed for UF2.
- `moviesRepository.searchStructured` already accepts `genres[]`, `excludedGenres[]`, `maxRuntime` (UF1). UF2 adds `findByIds`.

### Web app

- `<A2UIRenderer surfaceId="discovery"/>` is mounted in `movie-search.tsx`; same component will render the comparison table / night-plan as soon as the catalog map gains the two entries and `updateComponents` swaps in.
- `useAgentChat.ts` already routes `onCustomEvent` with `name: "a2ui"` to the store. UF2 adds an unrelated path: `name: "warning"` is currently ignored — UF5 will surface it in the inspector. UF2 emits but does not consume.

### Key files (UF2-touched)

| File | Purpose | UF2 action |
|------|---------|------------|
| `packages/db/src/repositories/movies.ts` | `searchStructured`, `searchByTitle`, `findById`, `upsertFromTmdb` | Add `findByIds(ids)` preserving caller order |
| `packages/contracts/src/a2ui/catalog.ts` | Catalog descriptor + `getCatalogPromptDescription()` | Add `MovieComparisonTable` + `MovieNightPlan` entries |
| `apps/api/src/services/agents/a2ui-emitter.ts` | A2UI message builders | Split into per-view emitters + dispatcher |
| `apps/api/src/features/tools/discovery.ts` | LLM-facing discovery tool | Extend input + branch on `view`; resolve via `findByIds` |
| `apps/api/src/services/agents/ag-ui-stream.ts` | AI-SDK → AG-UI translator | Emit `CUSTOM { name: "warning" }` for tool warnings |
| `apps/api/src/services/agents/system-prompt.ts` | Static system prompt | Append view-selection guidance |
| `apps/web/src/lib/a2ui/highlight-registry.ts` | (new) Module-level imperative API for column flash | Create; export `registerHighlighter`, `triggerHighlight` |
| `apps/web/src/lib/a2ui/renderers/movie-comparison-table.tsx` | (new) Comparison table renderer | Build; reads `/comparison` + `/movies`; registers highlighter |
| `apps/web/src/lib/a2ui/renderers/movie-night-plan.tsx` | (new) Night-plan renderer | Build; reads `/plan` + `/movies` |
| `apps/web/src/lib/a2ui/catalog.tsx` | Component name → renderer map | Register both new renderers |
| `apps/web/src/app/globals.css` (or equivalent) | Global styles | Add `.a2ui-flash` keyframe + class |

---

## 6. Reference Implementations

Existing patterns to follow when implementing each UF2 element. ⚪ = read-only reference.

### Drizzle repository extensions
- **`inArray` filtering** → not yet used in `moviesRepository`; pattern lives in `packages/db/src/repositories/agent-runs.ts` ⚪ (look for `inArray` usage for the resume tool-call lookup)
- **JS-side ordering on a query result** → none in repo today; trivial pattern (`ids.map(id => rows.find(r => r.id === id)).filter(Boolean)`)

### A2UI emission
- **Pure ordered message array** → existing `discoveryGridMessages` body (currently `discoverySurfaceMessages`) in `apps/api/src/services/agents/a2ui-emitter.ts` ⚪ — the new comparison/night-plan helpers mirror this shape
- **Surface composition with `Column → leaf`** → existing `watchlistGridMessages`, `reviewsGridMessages` in the same file ⚪

### LLM-facing tool with branching execute
- **Branch on a discriminator field with fallback warning** → existing `discovery.ts` already branches on `view` for invalid values ⚪ — UF2 extends this branching
- **Tool description embedding catalog summary** → same file, `getCatalogPromptDescription()` interpolation ⚪

### AG-UI translator additions
- **`extract*`/`strip*` helper pair** → existing `extractA2UIMessages` + `stripA2UIMessages` in `ag-ui-stream.ts` ⚪ — `extractWarnings` follows the same shape

### A2UI client renderer
- **Bound-path renderer reading from store** → `apps/web/src/lib/a2ui/renderers/movie-grid.tsx` ⚪ (read `node.data.path`, resolve via `get()`, render)
- **Filter-panel-style chips with derived display** → `apps/web/src/lib/a2ui/renderers/movie-filter-panel.tsx` ⚪
- **MovieCard composition + grid layout** → `movie-grid.tsx` ⚪ (night-plan reuses the grid layout for the backups row)

### Module-level registry pattern
- **Module-scoped `Map` + listener pattern** → `apps/web/src/lib/a2ui/store.ts` ⚪ — same singleton-with-emit shape as the surface store, simpler (no React subscription needed for the highlighter)

### Component testing
- **RTL + `useA2UISurface` driven by `applyMessage`** → `apps/web/src/lib/a2ui/registry.test.tsx` ⚪ for sequence playback; `movie-grid.test.tsx` ⚪ for single-renderer tests

### Server unit testing
- **Tool unit test with mocked `moviesRepository`** → existing `discovery.test.ts` ⚪ — the spy pattern (`vi.fn`, `vi.mock`) carries over to `findByIds`

### Style + conventions
- **Per-renderer file colocation** → all renderers under `apps/web/src/lib/a2ui/renderers/` with sibling `.test.tsx`
- **Tailwind class style + `text-muted` + `MovieCard` reuse** → `watchlist-grid.tsx`, `reviews-grid.tsx` ⚪

---

## 7. Notes

- **`createSurface` is idempotent (UF1 invariant).** Switching from `view: "grid"` to `view: "comparison"` does *not* clear `/filters` or stale components — the new `updateComponents` overwrites the `grid`-id node, and the prior `MovieFilterPanel` node remains in `components` but is unreferenced from the new `root.children = ["comparison"]`. The renderer naturally ignores unreferenced nodes. No explicit cleanup needed.
- **`/movies` policy.** UF2's comparison/night-plan emissions overwrite `/movies` with the resolved subset (server's `findByIds` result, caller order). This means `comparison → grid` round-trips do **not** preserve the prior 10-card grid in `/movies` — a return to grid will trigger a fresh `searchStructured` via the LLM's tool call. The "shortlist preserved across compare commands" property in the UF2 doc is satisfied by the LLM (which still sees the prior grid in its message history), not by the data model.
- **Criteria column getters are extensible.** `CELL_GETTERS` in `movie-comparison-table.tsx` is a static map; adding a new derivable criterion (e.g., `"language"`) means one entry. UF5's `highlight_comparison_criteria` only flashes columns by name — no getter dependency.
- **Token cost.** Catalog description grows from 6 to 8 components (~80 tokens). The new view-selection paragraph in the system prompt adds ~150 tokens. Within the macro plan's documented budget (8 components, ~500–800 tokens for the catalog block).
- **Frontend-tools dispatch (UF5 prep).** `triggerHighlight` is a single function call with no React dependency — UF5's frontend-tools registry can dispatch it from `useAgentChat`'s `onToolCallEndEvent` without any context plumbing. No UF5 change to UF2 files expected.
- **Approval flow (UF4 prep).** UF4 will add a `commit_movie_night` tool that consumes the same `pickedMovieId` / `backupMovieIds` / `reason` shape. UF2 already shapes `/plan` to match, so UF4 only adds the interrupt + persistence layer — no UF2 file rewrites expected.

---

## 8. Post-implementation: LLM behavior issue & demo pivot

### Symptom

Browser test of the originally-spec'd flow fails:

1. `feel-good comedy under 2h` → `discovery view=grid` with `{genres:["Comedy"], maxRuntime:120}` → comedy grid renders. ✅
2. `compare the 3 best comedies` → expected: ONE `discovery view=comparison` call with comedy UUIDs from step 1. Actual: model issues a FRESH `discovery view=grid` with `{genres:["Comedy"]}` (drops `maxRuntime: 120`) → popularity grid flashes → then `view=comparison` against IDs from that new grid. User sees a comparison of three unrelated popular comedies.

### Root cause

Two layers down from the obvious "wiring" suspects (history replay, surface clearing, filter extraction):

1. **Tool-result JSON is low-salience.** Comedy IDs live four levels deep inside `data.movies[*].id` of a `tool` role message. Models attend more to assistant-authored prose than to nested JSON when generating the next move. There is no plain-text breadcrumb in the conversation saying "I just showed you these N movies".
2. **"The N best comedies" is a strong filter-extract trigger.** Even with prompt rules saying "use IDs from the most recent tool result", the noun + ranking pattern matches the well-trained "extract filters → call discovery" instinct so cleanly that explicit rules lose. This is a known LLM failure mode: prompt rules vs. trained patterns, patterns win when the input fits cleanly.

The replay layer (`agent-run.ts:246-275`) is correct — verified end-to-end. The prior tool-call IS in the LLM's prompt. The model just doesn't ground in it.

### Round 1 (shipped, commit `b53030f`) — prompt restructure

System-prompt restructure: CONTEXT-ANCHOR rule first, then VIEW SELECTION, then FILTER EXTRACTION, plus an explicit SAME-TURN GUARD forbidding `grid → comparison` chains. Tool description in `discovery.ts` mirrors the rule.

**Outcome**: no measurable behavior change in browser testing. Confirms the issue is at the model-attention layer, not the rule-priority layer.

### Round 2 — watchlist pivot (Plan C)

Demo path becomes `watchlist_show → discovery view=comparison/night-plan`:

- Different first tool (no filter params on `watchlist_show` → no misfire pattern).
- Different surface ids — watchlist + comparison render co-existing, no overwrite.
- Real, motivated user flow — not a contrived demo prompt.

The pivot landed in three iterations as browser testing surfaced model and UI gaps.

#### Iteration 1: source broadening (commit `d925733`)

Prompt-only — open the comparison/night-plan path to non-discovery sources.

- `apps/api/src/services/agents/system-prompt.ts`: CONTEXT-ANCHOR rule broadened to "the most recent tool result that listed movies — `discovery`, `watchlist_show`, or `review_show`".
- `apps/api/src/features/tools/discovery.ts`: tool description and `Movie id format` line mirror the broadened source list.

**Outcome**: enabled the path in principle but didn't actually fire — see iteration 2.

#### Iteration 2: multi-tool chaining (commit `2bfbbcd`)

**Symptom**: `compare the top 3 in my watchlist by runtime` only rendered the watchlist. The model called `watchlist_show`, treated the surface as fulfilling the request, and stopped — never chained into `discovery view=comparison`.

**Root cause**: same model-attention class as round 1, but on a different tool boundary. The noun "watchlist" cued `watchlist_show` so strongly that the comparison verb was lost. The CONTEXT-ANCHOR rule never fired because the model wasn't routing to discovery at all.

**Fix** — explicit two-step pattern:

- `apps/api/src/services/agents/system-prompt.ts`: prepended a **MULTI-STEP INTENTS** rule before CONTEXT-ANCHOR, framing "compare/pick X in my watchlist" (or reviews) as a TWO-step plan within ONE turn — `watchlist_show` first, then immediately `discovery view=comparison/night-plan` with IDs from the result. Explicitly: "Do NOT stop after step 1. The user wants the comparison/pick, not the list." If a prior list result already exists in conversation, skip step 1.
- `apps/api/src/features/tools/watchlist-show.ts`: tool description reinforces "Use ONLY when the user wants to see/browse the watchlist itself. If the user wants to COMPARE or PICK from their watchlist … chain into the `discovery` tool with view='comparison' or view='night-plan' in the same turn."
- `apps/api/src/features/tools/review-show.ts`: same guard for reviews symmetry.

**Outcome**: chain now fires reliably — `TOOL_CALL_START` event sequence is `watchlist_show` then `discovery view=comparison` in the same run.

#### Iteration 3: responsive surface layout (commit `23296cc`)

**Symptom**: with both `watchlist` and `discovery` (comparison) surfaces emitting in the same turn, the UI stacked them vertically inside the existing `max-w-2xl` (672 px) container. Read as "two grids piled on top of each other" — the comparison was buried below 10 watchlist cards.

**Fix** — `apps/web/src/components/movie-search.tsx`:

- Compute `surfaceIds` array of visible non-form surfaces (`discovery`, `watchlist`, `reviews` — order matters: discovery first goes into the primary slot).
- When `surfaceIds.length > 1`: outer container expands to `max-w-6xl`; surfaces lay out via CSS grid `lg:grid-cols-[3fr_2fr] gap-4` (comparison primary at ~60%, watchlist secondary at ~40%).
- When `surfaceIds.length <= 1`: container stays at `max-w-2xl` (single-surface focused look unchanged).
- Form + quick-action buttons wrapped in an inner `max-w-2xl mx-auto` so they don't stretch when the outer widens.
- Below the `lg` breakpoint (1024 px): grid collapses to a single column; comparison renders first (most-recent answer leads).
- `review-form` keeps its own slot below the multi-surface block (modal-ish behavior preserved).

No renderer changes — surfaces are width-fluid via Tailwind grid utilities.

**Verification**: 103/103 web tests still pass (`movie-search.test.tsx` doesn't assert on container widths).

See updated `uf2-adaptive-view-layout.md` ("Demo flow & LLM-behavior caveat") for the demo script.

### Deferred follow-up: Plan A (synthetic grid breadcrumb)

Plan A would resurrect the `discovery view=grid → view=comparison` flow as a first-class path by giving the LLM a plain-text anchor for prior grid results. It is **deferred** because the watchlist pivot fully unblocks the UF2 demo and is more semantically meaningful. Plan A becomes worthwhile only if the grid → comparison flow needs to work reliably outside the demo context (e.g., production usage where users may not have a watchlist).

#### Mechanism

After every `discovery` tool call with `view: "grid"` and a non-empty `movies` array, the server persists a synthetic assistant chat message containing each movie's title, year, runtime, and **UUID inline as plain text**. On the next turn, when `start()` rebuilds history, the LLM sees this as a regular `assistant` message (not as a tool-result). Models weight assistant-authored prose higher than nested tool-result JSON — the IDs are now where the model actually looks.

#### Implementation

**File:** `apps/api/src/services/agents/agent-run.ts`

In `buildOnFinish` (currently lines 168-199), after `recordStepToolCalls` for each step and before persisting `event.text`, call a new local helper:

```ts
async function persistGridBreadcrumb(
  step: FinishStep,
  sessionId: string,
): Promise<void> {
  for (const tc of step.toolCalls) {
    if (tc.toolName !== "discovery") continue;
    const tr = step.toolResults.find((r) => r.toolCallId === tc.toolCallId);
    if (!tr) continue;
    const out = tr.output as {
      data?: {
        view?: string;
        movies?: Array<{
          id: string;
          title: string;
          year?: number | null;
          runtime?: number | null;
        }>;
      };
    };
    if (out?.data?.view !== "grid") continue;
    const movies = out.data.movies ?? [];
    if (movies.length === 0) continue;

    const lines = movies.slice(0, 10).map((m, i) => {
      const meta = [m.year, m.runtime ? `${m.runtime} min` : null]
        .filter(Boolean)
        .join(", ");
      return `${i + 1}. ${m.title}${meta ? ` (${meta})` : ""} — id: ${m.id}`;
    });
    const content =
      `Showed these ${movies.length} movies. For any "compare", "pick", ` +
      `or "of these" follow-up, use the IDs below directly — do not ` +
      `call discovery view="grid" again:\n${lines.join("\n")}`;

    await chatMessages.create({ sessionId, role: "assistant", content });
  }
}
```

Wire-in: in `buildOnFinish`'s step loop, call `await persistGridBreadcrumb(step, sessionId)` immediately after `recordStepToolCalls(step, runDbId)`. Keep the existing `event.text` persist as-is — breadcrumbs and LLM-authored text co-exist in `chat_messages`.

#### Tests required

`apps/api/src/services/agents/agent-run.test.ts` — add 1 test:

- Mock a `FinishStep` with a `discovery` tool call returning `view: "grid"` and a `movies: [{id, title, year, runtime}, ...]` array.
- Run `buildOnFinish` (or extract `persistGridBreadcrumb` and test it directly).
- Assert `chatMessages.create` was called with `role: "assistant"` and content containing each title and each id.

Existing 135 api tests should remain green (the new code only adds an insert; no read paths change).

#### Manual verification

1. `pnpm db:up && pnpm db:migrate && pnpm dev`
2. Browser: prompt `feel-good comedy under 2h`. Surface renders.
3. SQL check (psql or drizzle-studio): query `chat_messages` for the latest session — expect a row with `role='assistant'` and content starting with `Showed these 10 movies`.
4. Browser: prompt `compare the 3 best comedies`. DevTools Network → `/agent/run` SSE stream → count `TOOL_CALL_START` events for `discovery`. **Expected: 1**, with `view: "comparison"` and `shortlistMovieIds` matching 3 IDs from the breadcrumb.
5. Regression: prompt `find me a thriller under 90 min` (fresh search) → still issues `view: "grid"` with the right filters. Breadcrumb does not suppress legitimate new searches.

#### Risks / caveats of Plan A

- **Stacking breadcrumbs.** If the user does grid → grid → compare, two breadcrumbs accumulate; the LLM might pick from the older one. Acceptable for v1; dedup would be a follow-up.
- **Visual flash on later silent turns.** `movie-search.tsx`'s `lastAssistantText` fallback shows the latest assistant message when no surface is active. If a future turn produces neither a surface nor LLM text, the breadcrumb could render. Information-correct but visually weird; mitigation: rely on the LLM producing a real text reply on those turns.
- **Token cost.** ~1 KB per grid call, accumulating across the session. Negligible for demo, monitor in production.
- **Still LLM-dependent.** Stronger anchor, not a deterministic fix. If the model's filter-extract reflex still wins despite the breadcrumb, the only deterministic recourse is a server-side guard at the AG-UI stream layer (buffer + suppress same-turn `grid → comparison`) — not recommended; complex and only treats the symptom.

#### Estimated effort

~30 LOC + 1 test + 5 minutes manual verify. Half a day at worst with edge cases.

---

## Unresolved questions

*(none at time of writing — the four architectural choices were locked via grilling: comparison data lives at `/comparison`, night-plan at `/plan`, both renderers join via `/movies`; highlight API is module-level registry; comparison `< 2` ids falls back to grid + warning. Memory-driven view selection is explicitly UF3 scope.)*
