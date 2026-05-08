# Implementation Plan: Agentic Movie Experience

## 1. Feature Description

**Objective**: Migrate three grid surfaces (`movie-grid`, `watchlist-grid`, `reviews-grid`) to A2UI v0.9, add LLM-chosen layout for discovery, persistent viewing-preferences memory with `STATE_SNAPSHOT`/`STATE_DELTA`, schema-driven HITL via `commit_movie_night`, two frontend tools, and a togglable Developer Inspector. `review-form` stays as the tagged-union baseline.

**Key Capabilities**:
- **CAN** stream A2UI messages (`createSurface` / `updateComponents` / `updateDataModel`) as AG-UI `CUSTOM` events — one event per A2UI message
- **CAN** stage movie-discovery rendering (P3): skeleton → filters echo → grid; `DEMO_MODE_SLEEP=700` makes frames visible
- **CAN** let the LLM pick `view: "grid" | "comparison" | "night-plan"` via tool argument; visible in `TOOL_CALL_ARGS`
- **CAN** capture viewing preferences (`genres`, `maxRuntime`, `moods`, `notes[]`) via `update_preferences` tool; emit `STATE_SNAPSHOT` at run start, `STATE_DELTA` per update (JSON Patch)
- **CAN** apply memory silently on follow-up queries by injecting it into the system prompt
- **CAN** propose a movie-night plan, finish run with `outcome: interrupt`, render schema-driven approval UI, persist on approve with edited `reason`
- **CAN** invoke client-side fire-and-forget tools (`showMovieDetails`, `highlightComparisonCriteria`)
- **CAN** toggle Developer Inspector (Cmd+I); show events, activity timeline, memory side-by-side
- **CAN** replay Prompt 1 deterministically via `DEMO_MODE_FIXTURES`
- **CANNOT** browse past `movie_night_plans` rows (no UI)
- **CANNOT** manually edit/clear memory (agent-only writes)
- **CANNOT** replay/time-travel runs (slide-only)
- **CANNOT** discover capabilities at runtime (slide-only)

**Business Rules**:
- Memory keyed per-session, hydrated from latest user session at run start (`agentSessions.findLatestByUserId`)
- `notes` capped at 8 entries, FIFO eviction
- Unknown component name in `updateComponents` → no-op + inspector warning, no crash
- Invalid `view` value → fallback to `"grid"` + `RUN_ERROR` warning
- HITL approval round-trip: `RUN_FINISHED { outcome: interrupt, interrupts: [{ id, reason, message, proposed, responseSchema }] }` → user response in next run's tool message → resume
- `search_tmdb` HITL migrated to the same interrupt pattern (no behavior regression)
- `review-form` keeps tagged-union dispatch (intentional baseline)
- Inspector caps display at most-recent ~200 events
- Memory does not persist across browser sessions if no auth — keyed by current user

**Visual Design**: see `prd.md` (LY3 sketches + A2UI/HITL message shapes).

---

## 2. Data Model

### Modified Entity: `agent_sessions`

Add column:

| Column | Type | Constraints |
|--------|------|-------------|
| `viewing_preferences` | jsonb | NOT NULL, default `'{}'::jsonb` |

Stores `ViewingPreferences`. Hydrated via `agentSessionsRepository.findLatestByUserId(userId)` at run start (existing method). Existing unused `context` JSONB column stays untouched.

### New Entity: `movie_night_plans`

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | uuid | PK, `defaultRandom()` |
| `user_id` | text | NOT NULL, indexed |
| `run_id` | uuid | NOT NULL, FK → `agent_runs.id` |
| `picked_movie_id` | uuid | NOT NULL, FK → `movies.id` |
| `backup_movie_ids` | uuid[] | NOT NULL, default `'{}'` |
| `reason` | text | nullable |
| `created_at` | timestamp with timezone | NOT NULL, `defaultNow()` |

**Indexes**:
- `movie_night_plans_user_id_idx` on `(user_id)`
- `movie_night_plans_run_id_idx` on `(run_id)`

**Pattern**: follows `packages/db/src/schema/watchlist-items.ts`.

### New Contract Types

In `packages/contracts/src/a2ui/protocol.ts` 🟢:
- `a2uiCreateSurfaceSchema` — `{ createSurface: { surfaceId, catalogId } }`
- `a2uiUpdateComponentsSchema` — `{ updateComponents: { surfaceId, components: ComponentNode[] } }`
- `a2uiUpdateDataModelSchema` — `{ updateDataModel: { surfaceId, path: string, value: unknown } }`
- `a2uiDeleteSurfaceSchema` — `{ deleteSurface: { surfaceId } }`
- `a2uiMessageSchema` — discriminated union of the above
- `componentNodeSchema` — `{ id, component, children?: string[], data?: { path: string }, [propKey]: unknown }`

In `packages/contracts/src/a2ui/catalog.ts` 🟢:
- `catalogComponentSchema` — `{ name, props: Record<string, JsonSchema>, bindablePaths?: string[] }`
- `videoclubCatalog` — runtime catalog constant + literal `catalogId = "videoclub"`
- Component definitions: `Column`, `MovieFilterPanel`, `MovieGrid`, `MovieComparisonTable`, `MovieNightPlan`, `WatchlistGrid`, `ReviewsGrid`, `Skeleton`

In `packages/contracts/src/agent/viewing-preferences.ts` 🟢:
- `viewingPreferencesSchema` — `{ genres?: string[], maxRuntime?: number, moods?: string[], notes?: string[] }`
- `viewingPreferencesPatchSchema` — same fields, all optional, with `notes` accepting append semantics handled in service
- *(`region` explicitly out of scope — not in schema, not in prompt)*

In `packages/contracts/src/agent/interrupts.ts` 🟢:
- `interruptOutcomeSchema` — `{ type: "interrupt", interrupts: Interrupt[] }`
- `interruptSchema` — `{ id, reason, message, proposed: unknown, responseSchema: JsonSchema }`
- `commitMovieNightProposedSchema` — `{ pickedMovieId, backupMovieIds: string[], reason: string }`
- `commitMovieNightResponseSchema` — `{ approved: boolean, editedReason?: string }`

In `packages/contracts/src/http/movie-night.ts` 🟢:
- `movieNightPlanSchema` — `{ id, userId, runId, pickedMovieId, backupMovieIds, reason, createdAt }`

### Modified Contract Types

`packages/contracts/src/a2ui/index.ts`:
- Re-export new `protocol`, `catalog`
- Keep existing `watchlist-grid`, `reviews-grid`, `review-form` exports — those remain the **tool return shape**; the wire format adopts protocol messages

### Relationships

- `movie_night_plans.run_id` → `agent_runs.id` (many-to-one) — every commit traceable to its run
- `movie_night_plans.picked_movie_id` → `movies.id` (many-to-one)
- `agent_sessions.viewing_preferences` — embedded JSONB; no FK

---

## 3. Architecture

Legend: 🟢 new file · 🟡 modified file · ⚪ reused as-is.

### A. Database (`packages/db/`)

**A1.** `schema/movie-night-plans.ts` 🟢 — Drizzle table per §2. Pattern: `schema/watchlist-items.ts`.

**A2.** `schema/agent-sessions.ts` 🟡 — add `viewingPreferences: jsonb("viewing_preferences").notNull().default({}).$type<ViewingPreferences>()`. Type from `@repo/contracts`.

**A3.** `schema/index.ts` 🟡 — export `movieNightPlans`.

**A4.** `repositories/movie-night-plans.ts` 🟢 — `create({ userId, runId, pickedMovieId, backupMovieIds, reason })`; `findByUser(userId)`. Pattern: `repositories/watchlist.ts`.

**A5.** `repositories/agent-sessions.ts` 🟡 — add `getViewingPreferences(userId)`, `setViewingPreferences(userId, prefs)`, `applyPreferencesPatch(userId, patch)` (load → merge with notes-cap-8 + structured overwrite → save → return new state).

**A6.** `repositories/index.ts` 🟡 — re-export `movieNightPlansRepository`.

**A7.** Migration 🟢 — `pnpm db:generate` after edits → single migration adding column + table.

### B. Contracts (`packages/contracts/`)

**B1.** `a2ui/protocol.ts` 🟢 — Zod schemas per §2 + builders `createSurface`, `updateComponents`, `updateDataModel`.

**B2.** `a2ui/catalog.ts` 🟢 — `videoclubCatalog` with 8 components. Helper `getCatalogPromptDescription()` (LLM-facing list, used in tool descriptions, not system prompt).

**B3.** `agent/viewing-preferences.ts` 🟢 — schemas + `applyPatch(prev, patch)` pure helper returning `{ next, jsonPatchOps }`.

**B4.** `agent/interrupts.ts` 🟢 — interrupt schemas + `commitMovieNightInterrupt(proposed)` builder.

**B5.** `agent/index.ts` 🟢 — barrel.

**B6.** `http/movie-night.ts` 🟢 — plan response schema (parity, not consumed by demo).

**B7.** `index.ts`, `a2ui/index.ts`, `http/index.ts` 🟡 — re-exports.

### C. API agent + tools (`apps/api/src/`)

**C1.** `services/agents/a2ui-emitter.ts` 🟢 — pure functions:
- `discoverySurfaceMessages({ view, filters?, movies?, comparisonCriteria?, plan? })` → 3–6 messages per `view`
- `watchlistGridMessages({ items, message? })`
- `reviewsGridMessages({ items, message? })`

**C2.** `services/agents/memory.ts` 🟢 — `loadMemory(db, userId)`, `applyPreferencesPatch(db, userId, patch)`, `formatMemoryForSystemPrompt(prefs)` (stable structured serialization).

**C3.** `services/agents/demo-fixtures.ts` 🟢 — `getFixture(prompt)` keyed on lowercased trimmed prompt; covers the 4 scripted prompts.

**C4.** `services/agents/ag-ui-stream.ts` 🟡 — add:
- After `RUN_STARTED`: emit `STATE_SNAPSHOT { snapshot: memory }` (caller passes via options)
- On `tool-result` for `update_preferences`: emit `STATE_DELTA { delta: jsonPatchOps }` (output is `{ jsonPatchOps, snapshot }`)
- On `tool-result` carrying `a2uiMessages`: for each, optional `await sleep(DEMO_MODE_SLEEP)`, then emit `CUSTOM { name: "a2ui", value: msg }`
- Wrap each tool call with `STEP_STARTED { name: stepLabelFor(toolName) }` / `STEP_FINISHED`
- Synthetic `"Parsing intent"` step opens at run start, closes at first `tool-call` or `text-delta`
- HITL: when stream ends with a tool call awaiting approval, emit `RUN_FINISHED { outcome: { type: "interrupt", interrupts: [buildInterrupt(toolName, input)] } }` instead of plain `RUN_FINISHED`

`stepLabelFor` map: `search_movies` → "Searching local catalog"; `search_tmdb` → "Searching TMDB"; `watchlist_show` → "Loading your watchlist"; `watchlist_add/remove` → "Updating watchlist"; `review_add` → "Preparing review form"; `review_show` → "Loading your reviews"; `update_preferences` → "Updating memory"; `commit_movie_night` → "Committing tonight's plan"; `show_movie_details` → "Opening details"; `highlight_comparison_criteria` → "Highlighting columns"; `discovery` → "Building discovery surface".

**C5.** `services/agents/orchestrator.ts` 🟡 — hydrate memory at run start; inject `formatMemoryForSystemPrompt(memory)` into system prompt suffix; pass `memory` to `streamAgUiEvents` options; register new tools (`discovery`, `update_preferences`, `commit_movie_night`, `show_movie_details`, `highlight_comparison_criteria`); refactor `runApprovedTool` → `runResumedRun(db, sessionId, userId, toolName, response)` (generic interrupt resume — for `commit_movie_night`, calls `movieNightService.commit(...)` with `response.editedReason ?? response.reason`); if `DEMO_MODE_FIXTURES=true`, short-circuit `streamText` to a fixture-driven async iterable yielding recorded `tool-call`/`tool-result` parts.

**C6.** `services/agents/message-translator.ts` 🟡 — generalize `extractApprovalResponses` beyond search_tmdb; parse JSON content as `{ approved, ...rest }`; surface `editedReason`.

**C7.** `services/movie-night.ts` 🟢 — `commit({ db, userId, runId, pickedMovieId, backupMovieIds, reason })` → inserts row.

**C8.** `features/tools/update-preferences.ts` 🟢 — AI SDK tool. Input: `viewingPreferencesPatchSchema`. Execute → `applyPreferencesPatch(db, userId, patch)` → returns `{ jsonPatchOps, snapshot }`. `needsApproval: false`.

**C9.** `features/tools/commit-movie-night.ts` 🟢 — AI SDK tool. Input: `{ pickedMovieId, backupMovieIds, reason }`. `needsApproval: true`. Execute unreachable on first pass; on resume, called by `runResumedRun` with user-edited fields.

**C10.** `features/tools/discovery.ts` 🟢 — top-level LLM-facing discovery tool. Input: `{ filters?: SearchFilters, view: "grid" | "comparison" | "night-plan", shortlistMovieIds?: string[], comparisonCriteria?: string[], pickedMovieId?: string, backupMovieIds?: string[], reason?: string }`. For grid: queries local DB via existing `moviesRepository`. For comparison/night-plan: pulls already-known movies by ID (no TMDB). Returns `{ data, a2uiMessages: discoverySurfaceMessages(...) }`. Falls back to `view: "grid"` on invalid `view` and emits a warning. Description includes `getCatalogPromptDescription()` so the LLM knows the catalog.

**C11.** `features/tools/search-movies.ts` 🟡 — converted to internal helper; **no longer registered as an LLM tool**. Pure function `searchMoviesData(db, params)` consumed by `discovery.ts`. The LLM only sees `discovery` for movie-discovery flows.

**C12.** `features/tools/watchlist-show.ts` 🟡 — return `{ data: { items }, a2uiMessages: watchlistGridMessages(...) }`. Empty/error encoded as `updateDataModel("/state", "empty" | "error")`.

**C13.** `features/tools/review-show.ts` 🟡 — same pattern as C12.

**C14.** `features/tools/show-movie-details.ts` 🟢 — server stub: `tool({ inputSchema: z.object({ movieId: z.string() }), execute: async () => null })`. Registered as client-side via constant in `services/agents/client-side-tools.ts`.

**C15.** `features/tools/highlight-comparison-criteria.ts` 🟢 — same pattern. Input `{ criteria: z.array(z.string()) }`.

**C16.** `services/agents/client-side-tools.ts` 🟢 — `CLIENT_SIDE_TOOLS = new Set(["show_movie_details", "highlight_comparison_criteria"])`. Used by `streamAgUiEvents` to annotate events and to short-circuit `STEP_FINISHED` (no result expected).

**C19.** `services/agents/json-patch-adapter.ts` 🟢 — thin wrapper aligning `fast-json-patch`'s `Operation[]` with AG-UI core's `StateDeltaEvent.delta` typing. Functions: `toAgUiDelta(ops)`, `fromAgUiDelta(delta)`. Avoids casting throughout the codebase.

**C17.** `features/chat/route.ts` 🟡 — pass `memory` snapshot from orchestrator into `streamAgUiEvents`; replace `buildApprovalStream` with a generic `buildResumeStream(threadId, runId, userId, toolName, response)` that calls `runResumedRun`.

**C18.** `features/movie-night/route.ts` 🟢 *(optional, parity)* — `GET /` lists committed plans for the current user.

### D. Web client (`apps/web/src/`)

**D1.** `lib/a2ui/json-pointer.ts` 🟢 — ~30-line `get`/`set` for `/foo/bar` paths. No dep.

**D2.** `lib/a2ui/store.ts` 🟢 — per-surface state machine, `applyMessage(state, msg)`. Exposes `useA2UISurface(surfaceId)` hook. Subscribed to by the renderer.

**D3.** `lib/a2ui/catalog.ts` 🟢 — `Record<componentName, RendererComponent>`. Unknown name → null + `console.warn` + inspector log.

**D4.** `lib/a2ui/renderers/column.tsx` 🟢 — iterates `children: string[]`, renders each via the catalog from surface state.

**D5.** `lib/a2ui/renderers/skeleton.tsx` 🟢 — shadcn `Skeleton` styled per `variant: "movie-grid" | "row"`.

**D6.** `lib/a2ui/renderers/movie-filter-panel.tsx` 🟢 — reads filters from bound path; chips for genres, runtime, region, moods.

**D7.** `lib/a2ui/renderers/movie-grid.tsx` 🟢 — reads `movies: MovieDto[]`; reuses `MovieCard` ⚪.

**D8.** `lib/a2ui/renderers/movie-comparison-table.tsx` 🟢 — table over `movies` × `criteria`; column flash via CSS class toggled imperatively.

**D9.** `lib/a2ui/renderers/movie-night-plan.tsx` 🟢 — picked + backups + reason. Reuses `MovieCard`. Approval is a separate dialog.

**D10.** `lib/a2ui/renderers/watchlist-grid.tsx` 🟡 — read items from bound path instead of typed prop.

**D11.** `lib/a2ui/renderers/reviews-grid.tsx` 🟡 — same as D10.

**D12.** `lib/a2ui/renderers/review-form.tsx` ⚪ — stays as tagged-union renderer.

**D13.** `lib/a2ui/registry.tsx` 🟡 — two paths: tagged-union (`review-form` only) → existing dispatch; protocol surface → `<A2UIRenderer surfaceId="..."/>` walks the component graph from store.

**D14.** `lib/ag-ui/client.ts` ⚪ — no change (HttpAgent already supports CUSTOM/STATE events).

**D15.** `lib/ag-ui/frontend-tools.ts` 🟢 — `Record<toolName, (args) => void>`. Handlers call into respective contexts (modal, comparison-table imperative ref).

**D16.** `hooks/use-agent-chat.ts` 🟡 — subscribe to `onCustomEvent` (route `a2ui` → A2UI store; `memory-applied` → memory highlight); `onStateSnapshotEvent`/`onStateDeltaEvent` → memory context; `onStepStartedEvent`/`onStepFinishedEvent` → activity context; `onRunFinishedEvent` interrupt-outcome → set `pendingInterrupt`; on `onToolCallEndEvent` for client-side tools, dispatch via `frontend-tools.ts`. Replace `pendingApproval: PendingApproval` with `pendingInterrupt: Interrupt | null`. Add `respondToInterrupt(response)` — design a clean wire-format extension point (do **not** copy the existing `agentRef.current.messages = [...]` mutation in `approveToolCall`, which was a throwaway test). Preferred: wrap `HttpAgent.runAgent()` and inject the structured response into the request body; if `HttpAgent` exposes a documented method for this, use it.

**D17.** `contexts/memory-context.tsx` 🟢 — `applySnapshot`, `applyDelta(jsonPatchOps)` (uses `fast-json-patch`), `markApplied(keys[])` flashes for 1.5s.

**D18.** `contexts/inspector-mode-context.tsx` 🟢 — toggle + global Cmd+I/Ctrl+I listener.

**D19.** `contexts/activity-timeline-context.tsx` 🟢 — stacked steps + `pushStep`/`finishStep`.

**D20.** `contexts/event-log-context.tsx` 🟢 — bounded ring buffer (200).

**D21.** `components/inspector/inspector-panel.tsx` 🟢 — formats each event type; click-to-expand; auto-scroll. Header includes a **"Replay last"** button that re-issues the last user prompt with `DEMO_MODE_FIXTURES` short-circuit; emits a fresh `RUN_STARTED → … → RUN_FINISHED` trace.

**D22.** `components/inspector/activity-timeline.tsx` 🟢 — vertical checklist; ✓/⏳/○ icons.

**D23.** `components/inspector/memory-panel.tsx` 🟢 — structured keys + notes list; highlights `lastDeltaPaths`.

**D24.** `components/movie-details-modal.tsx` 🟢 — shadcn `Dialog`; movie passed in via context populated by frontend tool.

**D25.** `components/approval-dialog.tsx` 🟢 — schema-driven from `interrupt.responseSchema`. Field renderers: `boolean` → checkbox; `string` (≤50 chars) → input; `string` (>50 chars) → textarea. Submit → `respondToInterrupt(response)`.

**D26.** `components/movie-search.tsx` 🟡 — drop direct `setMovies` path; render discovery surface via `<A2UIRenderer surfaceId="discovery"/>`; show `ApprovalDialog` when `pendingInterrupt` is non-null.

**D27.** `app/layout.tsx` 🟡 — wrap in `MemoryProvider`, `InspectorModeProvider`, `ActivityTimelineProvider`, `EventLogProvider`.

**D28.** `app/page.tsx` 🟡 — LY3 layout: main column + Memory always-pinned (top-right, sized per mode); right rail (Inspector + Activity) when `inspectorMode === true`.

### E. Environment

**E1.** `apps/api/.env.example` 🟡 — add `DEMO_MODE_SLEEP=` (default unset), `DEMO_MODE_FIXTURES=false`.

**E2.** Orchestrator + `ag-ui-stream.ts` read `process.env.DEMO_MODE_SLEEP` / `DEMO_MODE_FIXTURES` directly. No env-loader file added.

### F. Dependencies

**F1.** `apps/web` and `apps/api` 🟡 — add `fast-json-patch` (server: emit deltas; client: apply deltas). Wrapped via `services/agents/json-patch-adapter.ts` (C19) to align with AG-UI core's `StateDeltaEvent.delta` typing.

**F2.** No other new deps (json-pointer rolled in-house per D1; `@ag-ui/*` already installed).

---

## 4. Test Plan

Tests for added behavior only. Skip framework/Drizzle/AI-SDK internals.

### Unit (Vitest)

**A2UI emitter** — `services/agents/a2ui-emitter.test.ts` 🟢
- `discoverySurfaceMessages({view:"grid", filters, movies})` yields ordered: `createSurface`, `updateComponents` (skeleton), `updateDataModel /filters`, `updateComponents` (real grid), `updateDataModel /movies`
- `view:"comparison"` yields `updateComponents` (`MovieComparisonTable`) without rebuilding `/movies` when `movies` already in scope
- `view:"night-plan"` yields `MovieNightPlan` with `picked`, `backups`, `reason`
- Invalid view → returns grid frames + warning flag

**Memory service** — `services/agents/memory.test.ts` 🟢
- `applyPreferencesPatch` overwrites scalar keys (genres, maxRuntime)
- `applyPreferencesPatch` appends to notes; FIFO-evicts oldest when length > 8
- Returns `jsonPatchOps` matching written diff (replace for scalars, add for new note entries)
- `formatMemoryForSystemPrompt` is stable across runs (deterministic key order)

**ag-ui-stream** — `services/agents/ag-ui-stream.test.ts` 🟡 *(extend existing)*
- Emits `STATE_SNAPSHOT` exactly once, immediately after `RUN_STARTED`
- On `tool-result` for `update_preferences`, emits `STATE_DELTA` with `delta = output.jsonPatchOps`
- On `tool-result` carrying `a2uiMessages`, emits one `CUSTOM { name:"a2ui" }` per message in order
- `DEMO_MODE_SLEEP=100` inserts ≥100ms gap between consecutive A2UI events
- `STEP_STARTED` precedes `TOOL_CALL_START`; `STEP_FINISHED` follows `TOOL_CALL_RESULT`
- Synthetic `"Parsing intent"` step opens at `RUN_STARTED`, closes at first `tool-call`
- Stream ending with a `tool-approval-request` for `commit_movie_night` → `RUN_FINISHED { outcome: { type:"interrupt", interrupts:[{...responseSchema}]}}`
- Same for legacy `search_tmdb` (regression)
- Client-side tool names emit `STEP_FINISHED` immediately after `TOOL_CALL_END` (no result expected)

**Discovery tool** — `features/tools/discovery.test.ts` 🟢
- `view:"grid"` calls `moviesRepository.searchStructured(filters)`, returns `{ data, a2uiMessages }`
- `view:"comparison"` with `shortlistMovieIds` resolves movies via `moviesRepository.findByIds`, no TMDB call
- `view:"carousel"` (invalid) → falls back to `view:"grid"` + warning in returned object
- Description string contains every catalog component name (sanity check on prompt grounding)

**Demo fixtures** — `services/agents/demo-fixtures.test.ts` 🟢
- Returns fixture for canonical prompt 1 (lowercased trim match)
- Returns `null` for unmatched prompt
- Each fixture emits a complete event sequence (RUN_STARTED → … → RUN_FINISHED) when consumed

**Message translator** — `services/agents/message-translator.test.ts` 🟡 *(extend)*
- `extractApprovalResponses` returns `{ approved, editedReason, toolName }` for arbitrary tool name
- Backward-compat: still works for legacy `{ approved: true }` payloads from `search_tmdb`

**JSON pointer** — `lib/a2ui/json-pointer.test.ts` 🟢
- `get(state, "/movies")` returns nested array
- `set(state, "/filters/genres", value)` is immutable (returns new object)
- Empty path `""` → root; missing intermediate keys created on `set`

**A2UI store** — `lib/a2ui/store.test.ts` 🟢
- `createSurface` initializes empty surface state
- `updateComponents` replaces components by id; unreferenced ids retained
- `updateDataModel` writes via JSON Pointer, triggers subscriber notification only for affected paths
- Unknown component name in `updateComponents` does not throw; logs to event-log

**Frontend-tools registry** — `lib/ag-ui/frontend-tools.test.ts` 🟢
- Dispatches handler when tool name registered
- Missing handler → `console.warn` + no throw

### Component (React Testing Library)

**`A2UIRenderer`** — `lib/a2ui/registry.test.tsx` 🟡 *(extend)*
- Given a recorded message sequence for `view:"grid"`, renders `Skeleton`, then `MovieGrid` after `updateComponents` swap
- Tagged-union `review-form` path still renders the existing form
- Unknown component logs warning, renders nothing

**`MovieComparisonTable`** — `lib/a2ui/renderers/movie-comparison-table.test.tsx` 🟢
- Renders one row per movie × one column per criterion
- Imperative highlight API toggles class on requested columns

**`MovieNightPlan`** — `lib/a2ui/renderers/movie-night-plan.test.tsx` 🟢
- Renders picked, each backup, and reason text

**`ApprovalDialog`** — `components/approval-dialog.test.tsx` 🟢
- Renders boolean schema field as checkbox
- Renders short string field as input, long string as textarea
- Submit calls `respondToInterrupt` with structured payload including `editedReason` when changed
- Cancel/Escape leaves interrupt pending (no call)
- Schema-violation 422 from server displays field-level error

**`MemoryPanel`** — `components/inspector/memory-panel.test.tsx` 🟢
- Reflects snapshot keys + notes list
- Flashes keys listed in latest delta for ≥1.5s

**`InspectorPanel`** — `components/inspector/inspector-panel.test.tsx` 🟢
- Formats each event type (RUN_*, STEP_*, TOOL_CALL_*, CUSTOM, STATE_*)
- Click-to-expand reveals full payload
- Caps display at 200 events; oldest evicted

**`ActivityTimeline`** — `components/inspector/activity-timeline.test.tsx` 🟢
- Stacked steps in run order
- Status icons reflect started/finished state
- Synthetic `"Parsing intent"` step rendered first

**Inspector mode toggle** — `contexts/inspector-mode-context.test.tsx` 🟢
- Cmd+I (mac) / Ctrl+I (other) toggles `inspectorMode`
- Default off; ignores keypress when meta key absent

### Integration (Vitest + Testcontainers)

**End-to-end runs** — `apps/api/tests/e2e-demo-prompts.test.ts` 🟢
- Real Postgres via Testcontainers; mocked LLM via deterministic stub returning recorded tool calls
- For each of the 4 scripted prompts: assert event-sequence snapshot matches a checked-in golden file
- For `DEMO_MODE_FIXTURES=true`: same prompts produce byte-identical event traces

**HITL round-trip** — `apps/api/tests/hitl-commit-movie-night.test.ts` 🟢
- Run produces `RUN_FINISHED { outcome: interrupt }` carrying `commit_movie_night` proposed payload
- Client posts `{ approved: true, editedReason: "edited" }` → resume run completes → `movie_night_plans` row exists with `reason = "edited"` and `run_id` set
- Reject (`approved: false`) → no row inserted; chat acknowledges
- Schema-violation payload → 422; no row inserted

**Memory persistence** — `apps/api/tests/memory-persistence.test.ts` 🟢
- Run A: `update_preferences { genres:["Comedy"] }` for userX → row updated
- Run B (new session, same userX): `STATE_SNAPSHOT` carries `{ genres:["Comedy"] }`
- `update_preferences` with `notes:["a","b","c","d","e","f","g","h","i"]` over multiple calls keeps only last 8

### Smoke / rehearsal (manual + scripted)

- `DEMO_MODE_FIXTURES=true pnpm --filter @repo/api dev` + run all 4 prompts → matches golden trace exactly
- Sabotage script: kill TMDB env key, run prompt 1 → inspector shows `STEP_FINISHED Searching TMDB ✗` and `RUN_ERROR`; fixture fallback recovers
- Toggle Cmd+I 5× during a live run; surface state and run continuity preserved

### Validation Loop (development harness)

A scripted harness that drives the full test/typecheck/lint cycle plus end-to-end SSE-trace assertion. Sits *above* the unit/integration/component tests already specified — it consumes them and adds protocol-level regression catching that unit tests can't see.

**Purpose**: catch regressions in the AG-UI/A2UI event order at protocol boundary, where unit tests pass but the wire format drifts. Without it, "extra STATE_DELTA emitted" or "STEP_FINISHED before TOOL_CALL_RESULT" only surfaces at dress rehearsal.

**Components** (5, in build order):

1. **DB reset between runs** — truncate `agent_sessions`, `agent_runs`, `tool_calls`, `movie_night_plans` (cascades to `chat_messages` via FK). Reuses existing Testcontainers setup; one helper function.
2. **Hard guard against live LLM** — assert `DEMO_MODE_FIXTURES=true` at loop start; bail with non-zero exit otherwise. LLM stochasticity makes trace diffs noisy.
3. **HITL round-trip script** — two-step `fetch` flow against `/api/v1/chat`: initial run → assert `RUN_FINISHED { outcome: interrupt }` → POST approval response with edited `reason` → assert resume run completes + `movie_night_plans` row inserted. ~30 lines.
4. **Failure summarizer** — on any failure (typecheck, lint, test, trace diff), surface only: failing item name + stderr last 30 lines + (for trace diff) the unified diff. Suppresses pass-noise.
5. **Golden-trace runner** — for each of the 4 scripted prompts: `fetch` SSE, accumulate events to a normalized JSON array (strip `runId`, `threadId`, timestamps, `tool_call_id` randomness), diff against checked-in golden. Goldens at `apps/api/tests/__goldens__/<prompt-slug>.json`. First run is record-mode (writes the golden); subsequent runs are assert-mode. Toggle via `--record` flag.

**When to use**:

| Trigger | Run | Components used |
|---|---|---|
| After each task in plan §5 | `pnpm typecheck && pnpm lint && pnpm --filter <touched> test` | (none — direct) |
| End-of-phase verify gate (Phases 0–4) | Loop, fixtures-only, asserts pass | 1, 2, 4, 5 (assert-mode after first phase that emits the protocol) |
| End of Phase 1 + each subsequent phase that changes the protocol | Loop in `--record` for the 4 prompts | 5 (record-mode) |
| End of Phase 3 + Phase 4 | Add HITL round-trip | 1, 2, 3, 4 |
| Phase 5 verify gate | Full loop, all components, assert-mode | 1, 2, 3, 4, 5 |
| Phase 6 dress rehearsal | Run loop once with fixtures (assert), once without fixtures live (no diff, just smoke) | 1, 2, 3, 4 |

**Sequencing**: components 1–4 bootstrap together at the *start* of Phase 5 (~½ day, see §5 Phase 5 task). Component 5 (golden traces) gets seeded incrementally as protocol behavior stabilizes — Phase 1 records its first golden for `view:"grid"` once the A2UI emitter is wired; Phase 2 adds `view:"comparison"` and `view:"night-plan"` goldens; Phase 4 adds the HITL trace. By Phase 5 verify, all 4 goldens exist and the loop runs assert-mode end-to-end.

**Implementation pointers**:
- Script: `apps/api/scripts/validation-loop.ts` 🟢 (new, top-level run via `pnpm --filter @repo/api validate`)
- SSE consumption: `fetch` + `body.getReader()` + `TextDecoder` — no AG-UI client dependency (we want the raw wire format)
- Trace normalization helper: `apps/api/scripts/normalize-trace.ts` 🟢 — strips run/thread/timestamps/random IDs to a stable shape
- Goldens directory: `apps/api/tests/__goldens__/` 🟢 with one file per prompt slug + `hitl-commit-movie-night.json`
- Reuse: existing Testcontainers DB setup from `apps/api/src/test/`, `pnpm typecheck`/`lint`/`test` from `package.json` scripts
- Add convenience script: `pnpm validate` at root (turbo task or direct) running typecheck → lint → test → loop

**Explicit non-goals**:
- No live-LLM mode (fail-loud guard prevents)
- No visual regression / Playwright (renderers covered by RTL; full UI smoke is the manual Phase 6 dress rehearsal)
- Does not replace per-task `pnpm test` — those stay fast feedback during Phase work
- No coverage reports — phase verify gates in §5 are the correct granularity

**Failure-handling protocol** (for the agent driving the loop):
- Typecheck/lint failure → fix immediately, do not proceed
- Unit/integration test failure → fix or update the test (in that order — never the other way around without explicit human input)
- Golden-trace diff:
  - Plan-aligned change to event order/payload → re-record (`--record`) and commit the new golden in the same patch as the code change
  - Unintentional drift → revert and root-cause
  - Always show the diff to the human in the change summary if a golden was re-recorded

---

## 5. To Do List

Phases ordered by **B-risk** (derisk-first). End-of-phase verify gate must pass before next phase.

### Phase 0 — Shared foundation (Mon week 1, ~½ day)

- [ ] **Add `viewing_preferences` column to agent_sessions schema** — `packages/db/src/schema/agent-sessions.ts`
- [ ] **Create `movie_night_plans` schema** — `packages/db/src/schema/movie-night-plans.ts` + barrel export
- [ ] **Create `movie-night-plans` repository** — `packages/db/src/repositories/movie-night-plans.ts` + barrel export
- [ ] **Extend `agent-sessions` repo with `getViewingPreferences`/`setViewingPreferences`/`applyPreferencesPatch`** — `packages/db/src/repositories/agent-sessions.ts`
- [ ] **Create A2UI protocol contracts** — `packages/contracts/src/a2ui/protocol.ts`
- [ ] **Create catalog contract** — `packages/contracts/src/a2ui/catalog.ts`
- [ ] **Create viewing-preferences contracts** — `packages/contracts/src/agent/viewing-preferences.ts`
- [ ] **Create interrupts contracts** — `packages/contracts/src/agent/interrupts.ts`
- [ ] **Barrel exports** — `packages/contracts/src/{a2ui,agent}/index.ts` + root `index.ts`
- [ ] **Add `fast-json-patch` dependency** — `apps/web/package.json` + `apps/api/package.json`
- [ ] **JSON Patch adapter** — `apps/api/src/services/agents/json-patch-adapter.ts` (aligns `fast-json-patch` Operation[] with AG-UI `StateDeltaEvent.delta` typing)
- [ ] **Add `findByIds(ids: string[])` to movies repo** — `packages/db/src/repositories/movies.ts` (consumed by `discovery` for comparison/night-plan views)
- [ ] **Generate + apply migration** — `pnpm db:generate && pnpm db:migrate`
- [ ] **Verify**: typecheck passes; `pnpm --filter @repo/db test` passes

### Phase 1 — A2UI v0.9 protocol + UF1 (Mon-Tue week 1, ~1.5 days)

- [ ] **JSON Pointer helper** — `apps/web/src/lib/a2ui/json-pointer.ts` + tests
- [ ] **A2UI store** — `apps/web/src/lib/a2ui/store.ts` + `useA2UISurface` hook + tests
- [ ] **Client catalog map** — `apps/web/src/lib/a2ui/catalog.ts`
- [ ] **`Column` and `Skeleton` renderers** — `apps/web/src/lib/a2ui/renderers/column.tsx`, `skeleton.tsx`
- [ ] **`MovieFilterPanel` + `MovieGrid` renderers** — `apps/web/src/lib/a2ui/renderers/{movie-filter-panel,movie-grid}.tsx`
- [ ] **Refactor `WatchlistGrid` and `ReviewsGrid` to read from bound paths** — `apps/web/src/lib/a2ui/renderers/{watchlist-grid,reviews-grid}.tsx`
- [ ] **Refactor `A2UIRenderer` to dispatch protocol surfaces; preserve tagged-union path for `review-form`** — `apps/web/src/lib/a2ui/registry.tsx`
- [ ] **A2UI emitter (server)** — `apps/api/src/services/agents/a2ui-emitter.ts` + tests
- [ ] **Add `CUSTOM:a2ui` event emission with optional `DEMO_MODE_SLEEP`** — `apps/api/src/services/agents/ag-ui-stream.ts`
- [ ] **Refactor `watchlist_show` to return `{ data, a2uiMessages }`** — `apps/api/src/features/tools/watchlist-show.ts`
- [ ] **Refactor `review_show` to return `{ data, a2uiMessages }`** — `apps/api/src/features/tools/review-show.ts`
- [ ] **Hook `useAgentChat` to route `onCustomEvent` `name:"a2ui"` to A2UI store** — `apps/web/src/hooks/use-agent-chat.ts`
- [ ] **Create new `discovery` tool replacing search-results path** — `apps/api/src/features/tools/discovery.ts` + tests
- [ ] **Wire `discovery` in orchestrator; drop `search_movies` from LLM tool registry (keep as internal helper only); remove direct `setMovies` path in MovieSearch; render via `<A2UIRenderer surfaceId="discovery"/>`** — `apps/api/src/services/agents/orchestrator.ts` + `apps/web/src/components/movie-search.tsx`
- [ ] **Wire `DEMO_MODE_SLEEP` env in `.env.example`** — `apps/api/.env.example`
- [ ] **Tests** — A2UI emitter, A2UI store, json-pointer, refactored `ag-ui-stream`, registry tagged-union vs protocol routing
- [ ] **Verify UF1**: type "feel-good comedy under 2h" → 3+ visible frames; watchlist + reviews still render; `review-form` still works
- [ ] **Record golden trace for prompt 1 (`view:"grid"`)** — `pnpm validate --record` (or, before the loop is bootstrapped, manual SSE capture into `apps/api/tests/__goldens__/prompt-1-grid.json`). Re-record at end of any subsequent phase that changes the protocol.

### Phase 2 — Adaptive view + UF2 (Wed week 1, ~1 day)

- [ ] **Add `MovieComparisonTable` renderer with imperative highlight ref** — `apps/web/src/lib/a2ui/renderers/movie-comparison-table.tsx`
- [ ] **Add `MovieNightPlan` renderer** — `apps/web/src/lib/a2ui/renderers/movie-night-plan.tsx`
- [ ] **Extend `discoverySurfaceMessages` for `view: "comparison" | "night-plan"` (reuse loaded movies via `findByIds`)** — `apps/api/src/services/agents/a2ui-emitter.ts`
- [ ] **Update `discovery` tool: accept `view`, `shortlistMovieIds`, `comparisonCriteria`, `pickedMovieId`, `backupMovieIds`, `reason`** — `apps/api/src/features/tools/discovery.ts`
- [ ] **Update orchestrator system prompt: tell LLM how to pick `view`** — `apps/api/src/services/agents/orchestrator.ts`
- [ ] **Tests**: `discovery.test.ts` covers `view:"comparison"` reuse, `view:"carousel"` fallback; renderer tests for comparison + night-plan
- [ ] **Verify UF2**: after a grid query, "compare the top 3" swaps surface to comparison table reusing cached movies; "pick one for tonight" yields `MovieNightPlan` surface
- [ ] **Record golden traces for prompt 3 (`view:"comparison"`) and prompt 4 (`view:"night-plan"`)** — `pnpm validate --record` (manual capture pre-bootstrap)

### Phase 3 — HITL interrupt + UF4 base (Thu week 1, ~1 day)

- [ ] **Generalize `extractApprovalResponses` for any tool name + `editedReason`** — `apps/api/src/services/agents/message-translator.ts` + tests
- [ ] **Emit `RUN_FINISHED { outcome: interrupt }` when stream ends with pending tool-approval-request** — `apps/api/src/services/agents/ag-ui-stream.ts` + tests (cover `commit_movie_night` AND `search_tmdb` regression)
- [ ] **Build interrupt payload helpers** — `packages/contracts/src/agent/interrupts.ts` (already created in Phase 0; flesh out builders)
- [ ] **Refactor `runApprovedTool` → `runResumedRun(toolName, response)`; route `commit_movie_night` to `movieNightService.commit`** — `apps/api/src/services/agents/orchestrator.ts`
- [ ] **Movie-night service** — `apps/api/src/services/movie-night.ts`
- [ ] **`commit_movie_night` tool with `needsApproval: true`** — `apps/api/src/features/tools/commit-movie-night.ts`
- [ ] **Replace `buildApprovalStream` with generic `buildResumeStream`** — `apps/api/src/features/chat/route.ts`
- [ ] **Approval dialog (schema-driven)** — `apps/web/src/components/approval-dialog.tsx` + tests
- [ ] **Replace `pendingApproval` with `pendingInterrupt` in `useAgentChat`; add `respondToInterrupt`** — `apps/web/src/hooks/use-agent-chat.ts`
- [ ] **Show approval dialog from MovieSearch when `pendingInterrupt` is non-null** — `apps/web/src/components/movie-search.tsx`
- [ ] **Tests**: `hitl-commit-movie-night.test.ts` (Testcontainers) — full round-trip with `editedReason` insert, reject, schema-violation
- [ ] **Verify UF4**: "pick one for tonight, plus a backup" → `MovieNightPlan` renders → approval dialog with editable reason → approve → `movie_night_plans` row exists
- [ ] **Record golden trace for HITL round-trip** — `apps/api/tests/__goldens__/hitl-commit-movie-night.json`. Captures both initial run (interrupt outcome) and resume run.

### Phase 4 — Memory + UF3 + system-prompt injection (Fri week 1, ~1 day)

- [ ] **Memory service** — `apps/api/src/services/agents/memory.ts` (load, applyPreferencesPatch with FIFO-8 cap, formatMemoryForSystemPrompt) + tests
- [ ] **`update_preferences` tool** — `apps/api/src/features/tools/update-preferences.ts` + tests (returns `{ jsonPatchOps, snapshot }`)
- [ ] **Emit `STATE_SNAPSHOT` after `RUN_STARTED`; emit `STATE_DELTA` on `update_preferences` tool result** — `apps/api/src/services/agents/ag-ui-stream.ts` + tests
- [ ] **Inject `formatMemoryForSystemPrompt(memory)` into system prompt; emit `CUSTOM { name:"memory-applied", value: { keys } }` when prefs influence search args** — `apps/api/src/services/agents/orchestrator.ts`
- [ ] **Memory context (client)** — `apps/web/src/contexts/memory-context.tsx` + tests
- [ ] **Memory panel UI** — `apps/web/src/components/inspector/memory-panel.tsx` + tests
- [ ] **Wire snapshot/delta/memory-applied events in `useAgentChat`** — `apps/web/src/hooks/use-agent-chat.ts`
- [ ] **Mount Memory panel in layout (always-visible)** — `apps/web/src/app/page.tsx` + `app/layout.tsx`
- [ ] **Tests**: memory persistence across sessions (Testcontainers); FIFO note cap
- [ ] **Verify UF3**: prompt 1 fills memory; prompt 2 ("4 friends, no horror") grows notes without re-search; prompt 3 ("something for tonight") applies memory silently — Memory panel flashes applied keys
- [ ] **Record golden trace for prompt 2 (memory-only update, no search)** — `apps/api/tests/__goldens__/prompt-2-memory.json`. Re-record prompt 1 trace if STATE_SNAPSHOT emission changed event order.

### Phase 5 — Inspector + UF5 polish (Mon-Wed week 2, ~3 days)

- [ ] **Bootstrap validation loop (components 1–4)** — `apps/api/scripts/validation-loop.ts`, `apps/api/scripts/normalize-trace.ts`, `apps/api/tests/__goldens__/`. DB reset helper, fixtures guard, HITL round-trip, failure summarizer. Add `pnpm validate` root script. ½ day. *(See §4 Validation Loop.)*
- [ ] **Activity timeline context** — `apps/web/src/contexts/activity-timeline-context.tsx` + tests
- [ ] **Event log context (ring buffer 200)** — `apps/web/src/contexts/event-log-context.tsx`
- [ ] **Inspector panel** — `apps/web/src/components/inspector/inspector-panel.tsx` + tests
- [ ] **Activity timeline panel** — `apps/web/src/components/inspector/activity-timeline.tsx` + tests
- [ ] **Inspector mode context (Cmd+I global listener)** — `apps/web/src/contexts/inspector-mode-context.tsx` + tests
- [ ] **LY3 layout: user-mode vs inspector-mode** — `apps/web/src/app/page.tsx`
- [ ] **Wire `STEP_*` events in orchestrator + `ag-ui-stream` (St1 mapping table)** — `apps/api/src/services/agents/{orchestrator,ag-ui-stream}.ts`
- [ ] **Wire `STEP_*` subscribers in `useAgentChat` → activity context** — `apps/web/src/hooks/use-agent-chat.ts`
- [ ] **Frontend-tools registry** — `apps/web/src/lib/ag-ui/frontend-tools.ts` + tests
- [ ] **`show_movie_details` tool stub + client handler + modal** — `apps/api/src/features/tools/show-movie-details.ts`, `apps/web/src/components/movie-details-modal.tsx`
- [ ] **`highlight_comparison_criteria` tool stub + client handler (calls imperative ref on `MovieComparisonTable`)** — `apps/api/src/features/tools/highlight-comparison-criteria.ts`
- [ ] **`CLIENT_SIDE_TOOLS` set + `(client-side)` annotation in inspector formatting** — `apps/api/src/services/agents/client-side-tools.ts` + inspector panel
- [ ] **Demo fixtures (4 prompts)** — `apps/api/src/services/agents/demo-fixtures.ts` + tests
- [ ] **`DEMO_MODE_FIXTURES` short-circuit in orchestrator** — `apps/api/src/services/agents/orchestrator.ts`
- [ ] **"Replay last" button in inspector header** — manual trigger; re-issues last user prompt through fixture short-circuit; documented in D21
- [ ] **Tests**: inspector panel formatting, activity timeline stacking, frontend-tools dispatch, demo-fixtures golden trace
- [ ] **Verify UF5**: Cmd+I switches layout; inspector shows full event stream; activity timeline ticks; frontend tools fire; `DEMO_MODE_FIXTURES=true` replays prompt 1 deterministically
- [ ] **Phase 5 verify gate — full validation loop**: `pnpm validate` runs typecheck + lint + test + golden traces (all 4 prompts + HITL) in assert-mode and exits 0. *(See §4 Validation Loop "When to use".)*

### Phase 6 — Slides + rehearsal (Thu-Fri week 2, ~2 days)

- [ ] **Slides for slide-only features** — replay/time-travel, capability discovery, A2UI/AG-UI side-by-side comparison, "all our list views use A2UI" diagram
- [ ] **Storytelling arc slides** — A2UI = grammaire d'interface; AG-UI = grammaire d'interaction; final punchline
- [ ] **Rehearsal #1**: full demo flow live (no fixtures); record event traces
- [ ] **Rehearsal #2**: full demo flow with `DEMO_MODE_FIXTURES=true`; `pnpm validate` (assert-mode); confirm golden traces stable
- [ ] **Rehearsal #3 (sabotage)**: kill TMDB key, throttle network, kill LLM key mid-run; verify graceful inspector + fixture fallback
- [ ] **Final smoke**: pnpm typecheck, lint, test all green; clean DB; reset agent_sessions; one final dry-run

### Cross-phase fallbacks (pre-agreed)

- If Phase 3 HITL fix explodes → keep H1 (missing-result trick) and call out spec deviation on stage
- If Phase 4 memory silent-use is unreliable on stage → pre-inject memory as hidden user-message prefix client-side
- If Phase 1 budget slips by EOD Tuesday → drop reviews-grid migration; keep watchlist + movie-grid live; reviews-grid stays tagged-union

---

## 6. Context: Current System Architecture

### Agent stack (already wired)

`@ag-ui/core`, `@ag-ui/encoder`, `@ag-ui/client` are installed and used end-to-end. The chat route emits SSE events via `EventEncoder`; the web client subscribes via `HttpAgent`. AI SDK (`ai` package) drives tool execution via `streamText`. Approval flow exists for `search_tmdb` but uses the "missing TOOL_CALL_RESULT" cheat instead of `outcome: interrupt`.

- Current behavior: tool returns object → orchestrator streams `RUN_STARTED`, `TEXT_MESSAGE_*`, `TOOL_CALL_*` (start/args/end), `TOOL_CALL_RESULT`, `RUN_FINISHED`
- Current limitations: no `STATE_SNAPSHOT`/`STATE_DELTA`, no `STEP_*`, no `CUSTOM`, no `outcome: interrupt`, AI-SDK `start-step`/`finish-step` parts ignored in `ag-ui-stream.ts`

### A2UI implementation (current)

A tagged-union pattern: tools return `{ type: "watchlist-grid" | "review-form" | "reviews-grid", ...data }`; client effect in `MovieSearch` reads `toolResults`, picks the right surface object, projects into a single React state slot (`a2uiSurface`); `<A2UIRenderer>` dispatches by `surface.type`. Search results bypass the registry entirely — they're projected into a separate `movies` array.

- Current behavior: one-shot tool returns → one re-render
- Current limitations: no protocol messages on the wire, no progressive rendering, no structure-vs-data separation, no LLM-chosen layout

### Orchestrator + tools (current)

`runOrchestrator` creates/resumes a session, persists user message, runs `streamText` with 6 tools, persists tool calls + assistant message in `onFinish`. `runApprovedTool` is hardcoded to `search_tmdb`. System prompt includes static rules. No memory loaded.

### DB stack (current)

Drizzle schema with `agent_sessions` (note: already has unused `context` JSONB), `chat_messages`, `agent_runs`, `tool_calls`, `movies`, `watchlist_items`, `reviews`. Repositories return factory functions. `findPendingToolCall` already implemented for HITL resume.

### Web app (current)

Single `MovieSearch` component is the chat surface. `ChatResultsContext` projects transient tool results into persistent `movies` / `a2uiSurface` / `clarification` slots. `useAgentChat` hook owns the `HttpAgent`, dispatches messages, exposes `pendingApproval` / `toolResults`. `WatchlistContext` and `ReviewContext` track per-card overlay state. Layout is a single column: search input on top, results below.

### Key files

| File | Purpose |
|------|---------|
| `apps/api/src/features/chat/route.ts` | SSE endpoint; runs orchestrator; handles approval branch |
| `apps/api/src/services/agents/orchestrator.ts` | Session, run, tool registration, system prompt; `runApprovedTool` for HITL resume |
| `apps/api/src/services/agents/ag-ui-stream.ts` | Translates AI-SDK stream parts → AG-UI events |
| `apps/api/src/services/agents/message-translator.ts` | Maps AG-UI messages ↔ AI-SDK messages; extracts approval responses |
| `apps/api/src/features/tools/search-movies.ts` | Local DB search — returns `MovieDto[]` |
| `apps/api/src/features/tools/search-tmdb.ts` | TMDB search with `needsApproval: true` |
| `apps/api/src/features/tools/watchlist-show.ts` | Returns `{ type: "watchlist-grid", items, count }` (tagged union) |
| `apps/api/src/features/tools/review-show.ts` | Returns `{ type: "reviews-grid", items, count }` (tagged union) |
| `apps/api/src/features/tools/review-add.ts` | Returns `{ type: "review-form", movie, rating, text? }` (tagged union; **stays as-is**) |
| `packages/db/src/schema/agent-sessions.ts` | Has unused `context` JSONB; `viewing_preferences` to be added |
| `packages/db/src/repositories/agent-sessions.ts` | `findById`, `findLatestByUserId`, `updateContext` |
| `packages/db/src/repositories/agent-runs.ts` | `findPendingToolCall`, `createRun`, `createToolCall`, etc. |
| `packages/contracts/src/a2ui/{watchlist-grid,review-form,reviews-grid}.ts` | Current tagged-union surface schemas |
| `apps/web/src/lib/ag-ui/client.ts` | `createAgentClient(threadId)` returning `HttpAgent` |
| `apps/web/src/hooks/use-agent-chat.ts` | Subscriptions, `sendMessage`, `approveToolCall`, `pendingApproval` state |
| `apps/web/src/lib/a2ui/registry.tsx` | Tagged-union registry; dispatches by `surface.type` |
| `apps/web/src/lib/a2ui/renderers/{watchlist-grid,review-form,reviews-grid}.tsx` | Current renderers — typed `data` prop |
| `apps/web/src/components/movie-search.tsx` | Main UI; effect projects tool results into context |
| `apps/web/src/contexts/chat-results-context.tsx` | `movies` / `a2uiSurface` / `clarification` state |

---

## 7. Reference Implementations

Existing patterns to follow when implementing each element.

### Drizzle schemas
- Pattern for `movie_night_plans` with FKs + composite indexes → `packages/db/src/schema/watchlist-items.ts`
- Pattern for adding a JSONB column with `$type<>()` typing → existing `agent_sessions.context` column in `packages/db/src/schema/agent-sessions.ts`

### Drizzle repositories
- Repository factory shape (`function fooRepository(db)` returning method bag) → `packages/db/src/repositories/watchlist.ts`
- Bulk insert + returning → `packages/db/src/repositories/agent-runs.ts:createToolCall/completeToolCall`
- Latest-by-user lookup → `packages/db/src/repositories/agent-sessions.ts:findLatestByUserId`

### AI SDK tools
- Tool with Zod input + `needsApproval: true` + execute → `apps/api/src/features/tools/search-tmdb.ts` (model for `commit_movie_night`)
- Tool returning a tagged-union surface → `apps/api/src/features/tools/watchlist-show.ts` (refactor target — adapt to return `{ data, a2uiMessages }`)
- Tool with optional `movieId` shortcut + clarification fallback → `apps/api/src/features/tools/review-add.ts` (model for `discovery` when matching shortlists)
- Movies bulk lookup is **not yet present** in `moviesRepository` — add `findByIds(ids: string[])` as part of Phase 0 (used by `discovery` for comparison/night-plan views)

### AG-UI server emission
- `EventEncoder` usage + ordered yield of typed events → `apps/api/src/services/agents/ag-ui-stream.ts`
- HITL "approval" path with run scaffolding (will be replaced in Phase 3, but useful for understanding lifecycle) → `apps/api/src/services/agents/orchestrator.ts:runApprovedTool` + `apps/api/src/features/chat/route.ts:buildApprovalStream`

### AG-UI client subscription
- Subscribe pattern with multiple typed handlers, accumulator refs (`pendingToolCallsRef`), threadId binding → `apps/web/src/hooks/use-agent-chat.ts`
- `HttpAgent.subscribe({ onTextMessageContentEvent, onToolCallEndEvent, onToolCallResultEvent, onRunFinishedEvent, onRunErrorEvent })` — extend with `onCustomEvent`, `onStateSnapshotEvent`, `onStateDeltaEvent`, `onStepStartedEvent`, `onStepFinishedEvent` per `@ag-ui/client` typings

### A2UI dispatch (current → target)
- Tagged-union renderer registry → `apps/web/src/lib/a2ui/registry.tsx` (preserve for `review-form` only)
- Renderer with bound data prop → `apps/web/src/lib/a2ui/renderers/watchlist-grid.tsx` (refactor target)

### React contexts (provider + use-hook)
- Provider + `useFoo` with throw-if-outside-provider → `apps/web/src/contexts/chat-results-context.tsx`, `watchlist-context.tsx`, `review-context.tsx` (model for `MemoryProvider`, `InspectorModeProvider`, `ActivityTimelineProvider`, `EventLogProvider`)

### Component testing
- RTL setup + render with provider wrapper → existing tests under `apps/web/src/components/*.test.tsx` (e.g., `review-form.test.tsx`, `bookmark-icon.test.tsx`)

### Integration tests
- Testcontainers + Drizzle test setup → `apps/api/src/test` and existing repo tests (e.g., `packages/db/src/repositories/reviews.test.ts`)

### Style + conventions
- Feature folder structure under `apps/api/src/features/<name>/{route,*.ts}` → existing `chat/`, `watchlist/`, `reviews/`, `movies/`
- Barrel re-exports per package → `packages/contracts/src/{a2ui,domain,http}/index.ts` and root `index.ts`
- Test colocation: `*.test.ts(x)` next to source — every existing tool, repo, renderer has a sibling `.test`

---

## 8. Notes

- **A2UI v0.9 is a custom layer** carried inside AG-UI's `CUSTOM` event channel. There is no upstream A2UI client library — the protocol is implemented in this repo.
- **`review-form` is intentionally kept tagged-union** as the "JSON maison" baseline for the talk's storytelling; do not migrate.
- **Demo-mode flags must be off in production builds.** Add a startup log warning if `DEMO_MODE_FIXTURES=true` is detected outside `NODE_ENV !== "development"`.
- **Token cost discipline**: the catalog description in `discovery`'s tool prompt (~500–800 tokens) is the single biggest prompt addition. If observed costs balloon, switch to lazy catalog descriptions (only the components valid for the current `view`).

---

## Resolved questions

1. **AI SDK ↔ AG-UI interrupt mapping** → **Day-1 spike of Phase 3 is the gate.** Verify `tool-approval-request` reliably fires before committing to H2. If it doesn't, fall back to H1 per the cross-phase fallback list.

2. **`respondToInterrupt` wire format** → **Current code is a throwaway test, not a reference.** Design a clean wire-format extension point in D16 (do not copy `agentRef.current.messages = [...]`).

3. **`search_movies` retirement** → **Hide.** Removed from LLM tool registry. Lives only as internal helper consumed by `discovery`.

4. **`region` field in viewing-preferences** → **Removed.** Not in schema, not in prompts, not in Memory panel.

5. **JSON Patch typing parity** → **Adapter added** (C19 `services/agents/json-patch-adapter.ts`).

6. **Replay-Prompt-1 trigger UX** → **Manual "Replay last" button in inspector header** (D21). No auto-replay.

7. **MovieCard hover overlays inside A2UI surfaces** → **OK as designed.** Verify on first integration of `MovieGrid` in Phase 1; existing `WatchlistContext` and `ReviewContext` continue to drive overlays unchanged.

8. **Catalog hot-reload behavior** → **Confirmed.** Snapshot the catalog into the surface state at `createSurface`; new queries pick up live catalog edits.
