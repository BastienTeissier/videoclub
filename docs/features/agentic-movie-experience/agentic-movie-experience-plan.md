# Implementation Plan: Agentic Movie Experience

## 1. Feature Description

**Objective**: Migrate three grid surfaces (`movie-grid`, `watchlist-grid`, `reviews-grid`) to A2UI v0.9, add LLM-chosen layout for discovery, persistent viewing-preferences memory with `STATE_SNAPSHOT`/`STATE_DELTA`, schema-driven HITL via `commit_movie_night`, two frontend tools, and a togglable Developer Inspector. `review-form` stays as the tagged-union baseline.

**Key Capabilities**:
- **CAN** stream A2UI messages (`createSurface` / `updateComponents` / `updateDataModel`) as AG-UI `CUSTOM` events — one event per A2UI message
- **CAN** stage movie-discovery rendering (P3): skeleton → filters echo → grid; `DEMO_MODE_SLEEP=700` makes frames visible
- **CAN** let the LLM pick `view: "grid" | "comparison" | "night-plan"` via tool argument; visible in `TOOL_CALL_ARGS`
- **CAN** capture viewing preferences (`genres`, `maxRuntime`, `moods`, `notes[]`) via `update_preferences` tool; emit `STATE_SNAPSHOT` at run start, `STATE_DELTA` per update (JSON Patch)
- **CAN** apply memory silently on follow-up queries by injecting it into the system prompt
- **CAN** propose a movie-night plan, finish run with `RUN_FINISHED.result = { type: "interrupt", ... }` (AG-UI `@0.0.48` shape), render schema-driven approval UI, persist on approve with edited `reason`
- **CAN** invoke client-side fire-and-forget tools (`showMovieDetails`, `highlightComparisonCriteria`)
- **CAN** toggle Developer Inspector (Cmd+I); show events, activity timeline, memory side-by-side
- **CAN** replay Prompt 1 deterministically via `DEMO_MODE_FIXTURES`
- **CANNOT** browse past `movie_night_plans` rows (no UI)
- **CANNOT** manually edit/clear memory (agent-only writes)
- **CANNOT** replay/time-travel runs (slide-only)
- **CANNOT** discover capabilities at runtime (slide-only)

**Business Rules**:
- Memory stored on `agent_sessions.viewing_preferences` and written to the current session; when creating a new session, seed it from the previous latest session for that user before it can become the "latest empty" session
- `notes` capped at 8 entries, FIFO eviction
- Unknown component name in `updateComponents` → no-op + inspector warning, no crash
- Invalid `view` value → fallback to `"grid"` + `CUSTOM { name: "warning", value: { code: "invalid-view", ... } }`; do not emit `RUN_ERROR` for nonfatal warnings
- HITL approval round-trip: `RUN_FINISHED { result: { type: "interrupt", interrupts: [{ id: toolCallRecordId, reason, message, proposed, responseSchema }] } }` → user response in next run request/body → resume by `interruptId`, not by tool name
- `search_tmdb` HITL migrated to the same interrupt pattern (no behavior regression)
- Clarification (ambiguous-title disambiguation) is also an interrupt — see §1.5 Amendment B
- `review-form` is rendered via the A2UI store, **not** tagged-union — see §1.5 Amendment E (this withdraws the v1 "intentional tagged-union baseline")
- Inspector caps display at most-recent ~200 events
- Memory does not persist across browser sessions if no auth — keyed by current user

**Visual Design**: see `prd.md` (LY3 sketches + A2UI/HITL message shapes).

---

## 1.5 Architecture amendments (post-v1)

Three deepening refactors changed since plan v1, each in service of locality (changes/bugs concentrate in one module) and reduced cross-module coordination. Domain language is in `/CONTEXT.md`.

### Amendment A — `MutationOutcome` envelope

Replaces the per-tool ad-hoc result shapes (`{deleted, message, movieId, movie}`, `{added, ...}`, `{clarification_needed, action, candidates}`, etc.) with a single discriminated envelope on the wire.

- New module: `packages/contracts/src/agent/mutation-outcome.ts` 🟢 — Zod schemas `mutationOutcomeSchema = success | error | needs-clarification` and `wireMutationOutcomeSchema = success | error` (the wire shape clients see; the stream layer never forwards `needs-clarification`).
- Variants:
  - `{ kind: "success", affected: DomainKey[], message, movie? }`
  - `{ kind: "error", code: "not_found" | "no_review" | "service_error", message }`
  - `{ kind: "needs-clarification", candidates: MovieDto[] }` (server-only marker — see Amendment B)
- New type: `domainKeySchema = z.enum(["watchlist", "reviews"])` exported alongside.
- Affected tools: `review_delete`, `watchlist_add`, `watchlist_remove`. Each tool's `execute` returns one of the three variants.

The depth: the frontend dispatches on `outcome.affected` rather than pattern-matching per tool name. Adding a fifth mutating tool changes zero frontend code.

### Amendment B — Clarification as interrupt

The "ambiguous title → user picks among candidates" flow is unified with HITL approval (`commit_movie_night`) under one mechanism: AG-UI interrupts.

- The mutating tool returns `{kind: "needs-clarification", candidates}` (Amendment A's third variant).
- `services/agents/ag-ui-stream.ts` 🟡 detects this on `tool-result`. Instead of forwarding the result, it:
  - Builds an `Interrupt` with `id = toolCallRecordId`, `responseSchema = { pickedMovieId: { enum: candidate ids } }`, `proposed = { candidates }`, `reason = "clarification"`.
  - Emits `RUN_FINISHED { result: { type: "interrupt", interrupts: [interrupt] } }` and stops.
- On resume, `agentRun.resume` (Amendment C) re-invokes the original tool with `{ ...originalInput, movieId: response.pickedMovieId }`, then re-enters `streamText` so the LLM continues reasoning after the disambiguation lands.

Deletes:
- `chat-results-context.clarification` field
- `extractApprovalResponses`'s hardcoded `"search_tmdb"` fallback (replaced by structured `interruptId`)
- The synthetic-message hack in `movie-search.tsx` (`"review [movieId:X] ..."`) — the user's choice rides the structured interrupt response, not a fake chat message

### Amendment C — `AgentRun` module

Replaces `runOrchestrator`, `runApprovedTool`, and `buildApprovalStream` with one module owning the run lifecycle.

- New module: `apps/api/src/services/agents/agent-run.ts` 🟢
  ```ts
  export function agentRun(db: Database) {
    return {
      start({ userId, threadId?, runId, messages }): AsyncIterable<string>;
      resume({ userId, threadId, runId, interruptId, response }): AsyncIterable<string>;
    };
  }
  ```
- Both methods: resolve session, create/look-up run row, configure `streamText` with `onFinish` for persistence, then `yield* streamAgUiEvents(...)`. Persistence stays in `onFinish`; `streamAgUiEvents` stays a pure protocol-translation layer.
- `resume` re-enters `streamText` with the resolved tool-result injected as a `tool` message in history. The LLM continues reasoning after the interrupt resolves (acknowledges the resolution naturally instead of stopping).
- Repository addition: `agentRunsRepository.findToolCallById(id)` — needed for resume to look up pending tool call by `interruptId`. Trivial.
- DB run identity on resume: continuation tool calls + assistant message are recorded against the **same `agent_runs` row** as the interrupting run (the run conceptually "still running" until the interrupt resolves). Resume does not create a new run row.

The route (`features/chat/route.ts`) shrinks to ~40 lines:

```ts
const { interruptId, response } = extractInterruptResponse(messages);
const events = interruptId
  ? agentRun(db).resume({ userId, threadId, runId, interruptId, response })
  : agentRun(db).start({ userId, threadId, runId, messages: aiSdkMessages });
return new Response(asReadableStream(events), { headers: SSE_HEADERS });
```

Hard-cut: `runOrchestrator`, `runApprovedTool`, `buildApprovalStream` are deleted (no shims). This supersedes the C5 / C17 / Phase 3 "refactor `runApprovedTool` → `runResumedRun`" tasks: the rename becomes a relocation into `agentRun.resume`.

### Amendment D — Frontend domain-state primitives

Replaces 140 lines × 2 of duplicated optimistic-update boilerplate with one primitive plus an aggregator hook, and deletes `chat-results-context` entirely.

- New module: `apps/web/src/hooks/use-domain-collection.ts` 🟢
  ```ts
  function useDomainCollection<T, K, S>(config: {
    fetch: () => Promise<T[]>;
    toState: (items: T[]) => S;
    initialState: S;
  }): {
    state: S;
    refetch: () => Promise<void>;
    mutate: <R>(key: K, plan: {
      optimistic: (s: S) => S;
      rollback: (s: S) => S;
      perform: () => Promise<R>;
    }) => Promise<R>;
  };
  ```
  Owns the per-item request counter and the rule "only roll back if your counter is still the latest" — once.

- `apps/web/src/contexts/{watchlist,review}-context.tsx` 🟡 — both contexts shrink to ~30 lines: thin wrappers around `useDomainCollection` providing domain-shaped state (`Set<id>` and `Map<id, rating>`) and domain-named methods (`addToWatchlist`, `upsertReview`, etc.).

- New module: `apps/web/src/hooks/use-movie-state.ts` 🟢
  ```ts
  function useMovieState(movieId: string): {
    inWatchlist: boolean;
    reviewRating?: number;
    toggleWatchlist: () => Promise<void>;
    upsertReview: (body: UpsertReviewRequest) => Promise<UpsertReviewResponse>;
    deleteReview: () => Promise<DeleteReviewResponse>;
  };
  ```
  Composes both contexts. Components (`movie-card`, `bookmark-icon`, `review-icon`, `review-modal`) replace their dual `useReviews()` + `useWatchlist()` calls with one `useMovieState(movieId)`.

- New module: `apps/web/src/lib/domain-refetchers.ts` 🟢 (or inline in `use-agent-chat`) — `Record<DomainKey, () => Promise<void>>` registry. The agent-mutation dispatcher in `movie-search.tsx` reduces to:
  ```ts
  for (const tr of newToolResults) {
    const outcome = wireMutationOutcomeSchema.safeParse(tr.result);
    if (outcome.success && outcome.data.kind === "success") {
      outcome.data.affected.forEach((d) => refetchers[d]());
    }
  }
  ```

- `apps/web/src/contexts/chat-results-context.tsx` ❌ — **deleted entirely**. After Amendments A + B + E, all three of its fields (`movies`, `a2uiSurface`, `clarification`) are obsolete.

Optimistic updates only fire on direct UI actions (clicking bookmark, submitting review form). Agent-driven mutations refetch via the `DomainKey` registry — they're already settled server-side by the time the frontend learns.

### Amendment E — `review_add` → `review_prefill`

The tool was misnamed: it builds a prefilled review form surface for confirmation; it never persists a review. The actual review write happens via REST when the user submits the form.

- Server: rename `createReviewAddTool` → `createReviewPrefillTool`; rename file `features/tools/review-add.ts` → `review-prefill.ts`; tool registry key changes from `review_add` to `review_prefill`; system prompt updated.
- Wire shape: tool moves from tagged-union return (`{type: "review-form", ...}`) to surface-emitting (`{data, a2uiMessages, warnings?}`) — same pattern as `discovery`, `watchlist_show`, `review_show`. The `review-form` renderer is invoked through the A2UI store, not the tagged-union dispatch.
- Frontend: `lib/a2ui/registry.tsx` no longer needs the tagged-union branch — it always dispatches via the protocol path. `lib/a2ui/renderers/review-form.tsx` reads its data from the surface's bound path instead of a typed prop.
- **Withdraws**: §1 line 29 ("`review-form` keeps tagged-union dispatch (intentional baseline)"), §6 line 611 ("review-add ... stays as-is"), §8 line 675 ("review-form is intentionally kept tagged-union"). The talk's "JSON maison baseline" framing is replaced by the unified A2UI-protocol-everywhere story.

### Implementation order (cross-cuts plan phases)

1. **Amendment A** first — pure contract change; touches only the four mutating tools and adds one new file in `@repo/contracts`. Test at the new envelope's seam.
2. **Amendment B** + **C** together — both ride the interrupt mechanism. C subsumes Phase 3's `runResumedRun` task. Tests use a real in-memory DB through `agentRun.start | resume`; protocol tests assert the interrupt-construction in `ag-ui-stream`.
3. **Amendment D** after A + C land — frontend cleanly absorbs the new envelope and the unified `pendingInterrupt`.
4. **Amendment E** is orthogonal — slot it into Phase 1 alongside the other surface-emitting tool migrations.

### Section supersedure

| Plan v1 section | Status |
|---|---|
| §1 "review-form keeps tagged-union dispatch (intentional baseline)" | **Withdrawn** (Amendment E) |
| §1 "call the review_add tool" prompting rules | Renamed (Amendment E) |
| §3.B (contracts) | Add `mutation-outcome.ts` (Amendment A) |
| §3.C C4 (ag-ui-stream) | Also builds clarification interrupts (Amendment B) |
| §3.C C5 + C17 (orchestrator + route resume rewrite) | **Superseded** by `agentRun` module (Amendment C) |
| §3.C C14 / `review-add.ts` | Renamed to `review-prefill.ts`, surface-emitting (Amendment E) |
| §3.D D12 / D13 (review-form renderer + registry) | Now A2UI-backed; registry drops tagged-union branch (Amendment E) |
| §3.D D16 (use-agent-chat) | `pendingInterrupt` covers clarification too; remove projection (Amendment B) |
| §3.D D26 (movie-search) | 70-line projection useEffect → ~5-line envelope dispatcher (Amendments A + B + D) |
| §3.D new | `useDomainCollection`, `useMovieState`, refetcher registry, removal of chat-results-context (Amendment D) |
| §6 line 611 (review-add "stays as-is") | **Withdrawn** (Amendment E) |
| §6 line 621 (chat-results-context) | Deleted (Amendment D) |
| §8 line 675 (review-form intentionally tagged-union) | **Withdrawn** (Amendment E) |

---

## 2. Data Model

### Modified Entity: `agent_sessions`

Add column:

| Column | Type | Constraints |
|--------|------|-------------|
| `viewing_preferences` | jsonb | NOT NULL, default `'{}'::jsonb` |

Stores `ViewingPreferences` for the current agent session. On run start, the orchestrator must load the user's latest existing preferences **before** creating a new session; a newly created session is seeded with that snapshot so memory persists across browser sessions without accidentally treating the new empty row as the source of truth. Existing unused `context` JSONB column stays untouched.

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
- `interruptRunFinishedResultSchema` — `{ type: "interrupt", interrupts: Interrupt[] }` (carried in AG-UI `RUN_FINISHED.result` for installed `@ag-ui/core@0.0.48`; do not use a top-level `outcome` field unless AG-UI is upgraded and the plan is updated)
- `interruptSchema` — `{ id, reason, message, proposed: unknown, responseSchema: JsonSchema }`
- `commitMovieNightProposedSchema` — `{ pickedMovieId, backupMovieIds: string[], reason: string }`
- `commitMovieNightResponseSchema` — `{ approved: boolean, editedReason?: string }`; server uses `editedReason ?? proposed.reason`, never `response.reason`
- `clarificationProposedSchema` — `{ candidates: MovieDto[] }` (Amendment B)
- `clarificationResponseSchema` — `{ pickedMovieId: string }` (Amendment B)
- `clarificationInterrupt(toolCallRecordId, candidates)` builder — produces an `Interrupt` with `responseSchema = { properties: { pickedMovieId: { enum: candidate ids } } }`

In `packages/contracts/src/agent/mutation-outcome.ts` 🟢 (Amendment A):
- `domainKeySchema` — `z.enum(["watchlist", "reviews"])`
- `mutationErrorCodeSchema` — `z.enum(["not_found", "no_review", "service_error"])`
- `mutationOutcomeSchema` — discriminated union on `kind`: `success | error | needs-clarification`
- `wireMutationOutcomeSchema` — discriminated union on `kind`: `success | error` (the shape clients receive; the stream layer translates `needs-clarification` to a clarification interrupt before it reaches the wire)

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

**A5.** `repositories/agent-sessions.ts` 🟡 — add `create(userId, initialViewingPreferences?)`, `findLatestViewingPreferencesByUserId(userId)`, `getViewingPreferences(sessionId)`, `setViewingPreferences(sessionId, prefs)`, `applyPreferencesPatch(sessionId, patch)` (load current session → merge with notes-cap-8 + structured overwrite/clear → save → return new state). Avoid write-by-`userId`; a new empty session must not overwrite older preferences before it is seeded.

**A6.** `repositories/index.ts` 🟡 — re-export `movieNightPlansRepository`.

**A7.** Migration 🟢 — `pnpm db:generate` after edits → single migration adding column + table.

### B. Contracts (`packages/contracts/`)

**B1.** `a2ui/protocol.ts` 🟢 — Zod schemas per §2 + builders `createSurface`, `updateComponents`, `updateDataModel`.

**B2.** `a2ui/catalog.ts` 🟢 — `videoclubCatalog` with 8 components. Helper `getCatalogPromptDescription()` (LLM-facing list, used in tool descriptions, not system prompt).

**B3.** `agent/viewing-preferences.ts` 🟢 — schemas + `applyPatch(prev, patch)` pure helper returning `{ next, jsonPatchOps }`.

**B4.** `agent/interrupts.ts` 🟢 — interrupt schemas + `commitMovieNightInterrupt(proposed)` and `clarificationInterrupt(toolCallRecordId, candidates)` builders (Amendment B).

**B4b.** `agent/mutation-outcome.ts` 🟢 (Amendment A) — `mutationOutcomeSchema`, `wireMutationOutcomeSchema`, `domainKeySchema`, `mutationErrorCodeSchema`. Imported by all mutating tools and by the frontend dispatcher.

**B5.** `agent/index.ts` 🟢 — barrel.

**B6.** `http/movie-night.ts` 🟢 — plan response schema (parity, not consumed by demo).

**B7.** `index.ts`, `a2ui/index.ts`, `http/index.ts` 🟡 — re-exports.

### C. API agent + tools (`apps/api/src/`)

**C1.** `services/agents/a2ui-emitter.ts` 🟢 — pure functions:
- `discoverySurfaceMessages({ view, filters?, movies?, comparisonCriteria?, plan? })` → 3–6 messages per `view`
- `watchlistGridMessages({ items, message? })`
- `reviewsGridMessages({ items, message? })`

**C2.** `services/agents/memory.ts` 🟢 — `loadLatestMemoryForUser(db, userId)`, `loadMemory(db, sessionId)`, `applyPreferencesPatch(db, sessionId, patch)`, `formatMemoryForSystemPrompt(prefs)` (stable structured serialization).

**C3.** `services/agents/demo-fixtures.ts` 🟢 — `getFixture(prompt)` keyed on lowercased trimmed prompt; covers the 4 scripted prompts.

**C4.** `services/agents/ag-ui-stream.ts` 🟡 — add:
- After `RUN_STARTED`: emit `STATE_SNAPSHOT { snapshot: memory }` (caller passes via options)
- On `tool-result` for `update_preferences`: emit `STATE_DELTA { delta: jsonPatchOps }` (output is `{ jsonPatchOps, snapshot }`)
- On `tool-result` carrying `a2uiMessages`: for each, optional `await sleep(DEMO_MODE_SLEEP)`, then emit `CUSTOM { name: "a2ui", value: msg }`
- Strip `a2uiMessages` from `TOOL_CALL_RESULT` content before it is added to AG-UI messages, so later LLM turns do not receive UI protocol noise
- Wrap each tool call with `STEP_STARTED { stepName: stepLabelFor(toolName) }` / `STEP_FINISHED { stepName: ... }` (installed AG-UI field is `stepName`, not `name`)
- Synthetic `"Parsing intent"` step opens at run start, closes at first `tool-call` or `text-delta`
- HITL: when stream ends with a tool call awaiting approval, persist/create the pending `tool_calls` row if needed and emit `RUN_FINISHED { result: { type: "interrupt", interrupts: [buildInterrupt(toolCallRecordId, toolName, input)] } }` instead of plain `RUN_FINISHED`
- **Clarification (Amendment B)**: on `tool-result` whose output matches `{kind: "needs-clarification", candidates}`, persist the pending `tool_calls` row, build an `Interrupt` via `clarificationInterrupt(toolCallRecordId, candidates)`, emit `RUN_FINISHED { result: { type: "interrupt", interrupts: [interrupt] } }`, and stop. Do **not** emit `TOOL_CALL_RESULT` for needs-clarification outputs — the marker is server-only.
- Nonfatal warnings (invalid `view`, fixture miss, catalog drift) emit `CUSTOM { name: "warning", value: { code, message, ... } }`; reserve `RUN_ERROR` for terminal run failure only

`stepLabelFor` map: `search_movies` → "Searching local catalog"; `search_tmdb` → "Searching TMDB"; `watchlist_show` → "Loading your watchlist"; `watchlist_add/remove` → "Updating watchlist"; `review_prefill` → "Preparing review form"; `review_show` → "Loading your reviews"; `review_delete` → "Deleting review"; `update_preferences` → "Updating memory"; `commit_movie_night` → "Committing tonight's plan"; `show_movie_details` → "Opening details"; `highlight_comparison_criteria` → "Highlighting columns"; `discovery` → "Building discovery surface".

**C5.** ~~`services/agents/orchestrator.ts`~~ **Superseded by Amendment C — `services/agents/agent-run.ts` 🟢**

The orchestrator file is replaced by `agentRun(db) → { start, resume }` (see §1.5 Amendment C). What `start` and `resume` own:

- **`start`** (replaces `runOrchestrator`):
  - Before session creation, load the latest existing viewing preferences for `userId`; create new sessions seeded with that snapshot.
  - Inject `formatMemoryForSystemPrompt(memory)` into system prompt suffix; pass `memory` to `streamAgUiEvents` options (so it can emit `STATE_SNAPSHOT`).
  - Register tools: `discovery`, `search_tmdb`, `watchlist_show`, `watchlist_add`, `watchlist_remove`, `review_show`, `review_delete`, `review_prefill` (renamed from `review_add` per Amendment E), `update_preferences`, `commit_movie_night`, `show_movie_details`, `highlight_comparison_criteria`.
  - Configure `streamText` with `onFinish` for persistence (tool calls, assistant message, run completion) and `onError` to mark run failed.
  - `yield* streamAgUiEvents(stream.fullStream, { threadId, runId })`.
  - If `DEMO_MODE_FIXTURES=true`, short-circuit `streamText` to a fixture-driven async iterable yielding recorded `tool-call`/`tool-result` parts.

- **`resume`** (replaces `runApprovedTool`):
  - Look up pending tool call by `interruptId` (= `tool_calls.id`) via the new `agentRunsRepository.findToolCallById`.
  - Validate `response` against the original interrupt's `responseSchema`; reject double-submit if pending output is already set.
  - Merge response into pending input. Per-tool merge:
    - Clarification interrupt → `{ ...pending.input, movieId: response.pickedMovieId }`
    - `commit_movie_night` → `{ ...pending.input, reason: response.editedReason ?? pending.input.reason }`
    - `search_tmdb` legacy → existing approval shape
  - Invoke the tool's `execute` with the merged input; record output on the pending tool call (same `agent_runs` row).
  - **Re-enter `streamText`** with the resolved tool-result message appended to the run's history so the LLM continues reasoning post-resolution. Same `onFinish` / `onError` wiring as `start`. Yield AG-UI events through `streamAgUiEvents`.

This supersedes the v1 `runResumedRun` task: rather than a renamed function, the resume path becomes a method on the `agentRun` module, sharing all session/persistence/streaming infrastructure with `start`.

**C6.** `services/agents/message-translator.ts` 🟡 — generalize `extractApprovalResponses` beyond `search_tmdb`; rename to `extractInterruptResponse(messages) → { interruptId, response } | null`. Parse JSON content as `{ interruptId, response }`. Drop the hardcoded `"search_tmdb"` fallback (Amendment B replaces it with structured `interruptId`). When translating AG-UI tool messages back to AI SDK `ModelMessage`, recover the original `toolName` from the prior assistant tool call instead of emitting `toolName: ""`.

**C7.** `services/movie-night.ts` 🟢 — `commit({ db, userId, runId, pickedMovieId, backupMovieIds, reason })` → inserts row.

**C8.** `features/tools/update-preferences.ts` 🟢 — AI SDK tool. Input: `viewingPreferencesPatchSchema`. Execute → `applyPreferencesPatch(db, sessionId, patch)` for the current seeded session → returns `{ jsonPatchOps, snapshot }`. `needsApproval: false`.

**C9.** `features/tools/commit-movie-night.ts` 🟢 — AI SDK tool. Input: `{ pickedMovieId, backupMovieIds, reason }`. `needsApproval: true`. Execute unreachable on first pass; on resume, called by `runResumedRun` with user-edited fields.

**C10.** `features/tools/discovery.ts` 🟢 — top-level LLM-facing discovery tool. Input: `{ filters?: SearchFilters, view: string, shortlistMovieIds?: string[], comparisonCriteria?: string[], pickedMovieId?: string, backupMovieIds?: string[], reason?: string }`, where `SearchFilters` supports `title`, `director`, `actor`, `genres?: string[]`, `year`, `maxRuntime`, `excludedGenres?: string[]`, and display-only `moods?: string[]`. Use `z.string()` plus internal validation for `view` so invalid values can fall back instead of Zod-rejecting the tool call. For grid: queries local DB via existing `moviesRepository`. For comparison/night-plan: pulls already-known movies by ID (no TMDB), preserving the caller's ID order. Returns `{ data, a2uiMessages: discoverySurfaceMessages(...), warnings? }`. Falls back to `view: "grid"` on invalid `view` and emits a `CUSTOM` warning. Description includes `getCatalogPromptDescription()` so the LLM knows the catalog.

**C11.** `features/tools/search-movies.ts` 🟡 — converted to internal helper; **no longer registered as an LLM tool**. Pure function `searchMoviesData(db, params)` consumed by `discovery.ts`. The LLM only sees `discovery` for movie-discovery flows.

**C12.** `features/tools/watchlist-show.ts` 🟡 — return `{ data: { items }, a2uiMessages: watchlistGridMessages(...) }`. Empty/error encoded as `updateDataModel("/state", "empty" | "error")`.

**C13.** `features/tools/review-show.ts` 🟡 — same pattern as C12.

**C13b.** `features/tools/review-prefill.ts` 🟢 (Amendment E — was `review-add.ts`) — renamed; converted from tagged-union return to surface-emitting. Returns `{ data: { movie, rating, text? }, a2uiMessages: reviewFormMessages(...) }`. The frontend reads `useA2UISurface("review-form")` rather than projecting through `chat-results-context`. Tool registry key: `review_prefill`.

**C13c.** Mutation tools (Amendment A) — `features/tools/{review-delete,watchlist-add,watchlist-remove}.ts` 🟡 each returns `MutationOutcome` (`{kind: "success", affected, message, movie?}` | `{kind: "error", code, message}` | `{kind: "needs-clarification", candidates}`). Drop the bespoke `{deleted, added, removed, clarification_needed, action}` shapes. The `needs-clarification` variant is server-only — `ag-ui-stream` translates it into a clarification interrupt before it reaches the wire (see C4 + Amendment B).

**C14.** `features/tools/show-movie-details.ts` 🟢 — client-side tool declaration: `tool({ inputSchema: z.object({ movieId: z.string() }) })` with **no server `execute`**. Registered as client-side via constant in `services/agents/client-side-tools.ts`; fire-and-forget, no `TOOL_CALL_RESULT` expected.

**C15.** `features/tools/highlight-comparison-criteria.ts` 🟢 — same no-`execute` client-side pattern. Input `{ criteria: z.array(z.string()) }`.

**C16.** `services/agents/client-side-tools.ts` 🟢 — `CLIENT_SIDE_TOOLS = new Set(["show_movie_details", "highlight_comparison_criteria"])`. Used by `streamAgUiEvents` to annotate events and to short-circuit `STEP_FINISHED` (no result expected).

**C19.** `services/agents/json-patch-adapter.ts` 🟢 — thin wrapper aligning `fast-json-patch`'s `Operation[]` with AG-UI core's `StateDeltaEvent.delta` typing. Functions: `toAgUiDelta(ops)`, `fromAgUiDelta(delta)`. Avoids casting throughout the codebase.

**C17.** `features/chat/route.ts` 🟡 — **Superseded by Amendment C.** Route shrinks to ~40 lines:

```ts
chat.post("/", async (c) => {
  const body = await c.req.json();
  const parsed = runAgentInputSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "Invalid request", details: parsed.error.issues }, 400);

  const userId = c.get("userId");
  const { threadId, runId, messages: agUiMessages, forwardedProps } = parsed.data;

  const interruptResponse = extractInterruptResponse(agUiMessages, forwardedProps);
  const events = interruptResponse
    ? agentRun(db).resume({ userId, threadId, runId, ...interruptResponse })
    : agentRun(db).start({ userId, threadId, runId, messages: agUiToAiSdk(agUiMessages) });

  return new Response(asReadableStream(events), { headers: SSE_HEADERS });
});
```

Interrupt responses arrive via a typed request extension — `forwardedProps.interruptResponse: { interruptId, response }` — not by mutating `agent.messages`. `buildApprovalStream` and `buildResumeStream` are deleted; both paths run through `agentRun`.

**C18.** `features/movie-night/route.ts` 🟢 *(optional, parity)* — `GET /` lists committed plans for the current user.

### D. Web client (`apps/web/src/`)

**D1.** `lib/a2ui/json-pointer.ts` 🟢 — ~30-line `get`/`set` for `/foo/bar` paths. No dep.

**D2.** `lib/a2ui/store.ts` 🟢 — per-surface state machine, `applyMessage(state, msg)`. Exposes `useA2UISurface(surfaceId)` hook. Subscribed to by the renderer. `createSurface` is idempotent for an existing `surfaceId`: update/catalog-snapshot metadata may refresh, but the current data model is preserved unless a future message explicitly clears it.

**D3.** `lib/a2ui/catalog.ts` 🟢 — `Record<componentName, RendererComponent>`. Unknown name → null + `console.warn` + inspector log.

**D4.** `lib/a2ui/renderers/column.tsx` 🟢 — iterates `children: string[]`, renders each via the catalog from surface state.

**D5.** `lib/a2ui/renderers/skeleton.tsx` 🟢 — shadcn `Skeleton` styled per `variant: "movie-grid" | "row"`.

**D6.** `lib/a2ui/renderers/movie-filter-panel.tsx` 🟢 — reads filters from bound path; chips for genres, max runtime, excluded genres, moods. No `region` field (out of scope).

**D7.** `lib/a2ui/renderers/movie-grid.tsx` 🟢 — reads `movies: MovieDto[]`; reuses `MovieCard` ⚪.

**D8.** `lib/a2ui/renderers/movie-comparison-table.tsx` 🟢 — table over `movies` × `criteria`; column flash via CSS class toggled imperatively.

**D9.** `lib/a2ui/renderers/movie-night-plan.tsx` 🟢 — picked + backups + reason. Reuses `MovieCard`. Approval is a separate dialog.

**D10.** `lib/a2ui/renderers/watchlist-grid.tsx` 🟡 — read items from bound path instead of typed prop.

**D11.** `lib/a2ui/renderers/reviews-grid.tsx` 🟡 — same as D10.

**D12.** `lib/a2ui/renderers/review-form.tsx` 🟡 (Amendment E) — converted to A2UI-backed renderer; reads `movie`, `rating`, `text` from bound paths instead of typed props. No longer a tagged-union renderer.

**D13.** `lib/a2ui/registry.tsx` 🟡 (Amendment E simplifies) — single path: `<A2UIRenderer surfaceId="..."/>` walks the component graph from store. The tagged-union dispatch branch is removed entirely; every renderer (including `review-form`) goes through the protocol path.

**D14.** `lib/ag-ui/client.ts` ⚪ — no change (HttpAgent already supports CUSTOM/STATE events).

**D15.** `lib/ag-ui/frontend-tools.ts` 🟢 — `Record<toolName, (args) => void>`. Handlers call into respective contexts (modal, comparison-table imperative ref).

**D16.** `hooks/use-agent-chat.ts` 🟡 — subscribe to `onCustomEvent` (route `a2ui` → A2UI store; `memory-applied`/`warning` → memory/inspector highlights); `onStateSnapshotEvent`/`onStateDeltaEvent` → memory context; `onStepStartedEvent`/`onStepFinishedEvent` → activity context; `onRunFinishedEvent` reads `event.result` and, when `result.type === "interrupt"`, sets `pendingInterrupt`; on `onToolCallEndEvent` for client-side tools, dispatch via `frontend-tools.ts` and do not add them to pending approval detection. Replace `pendingApproval: PendingApproval` with `pendingInterrupt: Interrupt | null` — this single channel covers both `commit_movie_night` approval **and** clarification (Amendment B), so no separate clarification state lives in any context. Add `respondToInterrupt(response)` — call `HttpAgent.runAgent({ forwardedProps: { interruptResponse: { interruptId, response } } })` or an explicit request body extension handled by `chat/route.ts`; if `HttpAgent` exposes a documented method for this, use it. Do **not** copy the existing `agentRef.current.messages = [...]` mutation in `approveToolCall`, which was a throwaway test.

The `toolResults` projection useEffect (~70 lines) is removed; agent-mutation refetch dispatch lives in `lib/domain-refetchers.ts` (D29) and reads `wireMutationOutcomeSchema`.

**D17.** `contexts/memory-context.tsx` 🟢 — `applySnapshot`, `applyDelta(jsonPatchOps)` (uses `fast-json-patch`), `markApplied(keys[])` flashes for 1.5s.

**D18.** `contexts/inspector-mode-context.tsx` 🟢 — toggle + global Cmd+I/Ctrl+I listener.

**D19.** `contexts/activity-timeline-context.tsx` 🟢 — stacked steps + `pushStep`/`finishStep`.

**D20.** `contexts/event-log-context.tsx` 🟢 — bounded ring buffer (200).

**D21.** `components/inspector/inspector-panel.tsx` 🟢 — formats each event type; click-to-expand; auto-scroll. Header includes a **"Replay last"** button that re-issues the last user prompt with `DEMO_MODE_FIXTURES` short-circuit; emits a fresh `RUN_STARTED → … → RUN_FINISHED` trace.

**D22.** `components/inspector/activity-timeline.tsx` 🟢 — vertical checklist; ✓/⏳/○ icons.

**D23.** `components/inspector/memory-panel.tsx` 🟢 — structured keys + notes list; highlights `lastDeltaPaths`.

**D24.** `components/movie-details-modal.tsx` 🟢 — shadcn `Dialog`; movie passed in via context populated by frontend tool.

**D25.** `components/approval-dialog.tsx` 🟢 — schema-driven from `interrupt.responseSchema` plus small UI hints (`ui:widget`, `ui:prefillFrom`, `maxLength`) stored alongside the JSON schema. Field renderers: `boolean` → checkbox; `string` + `ui:widget="textarea"` → textarea; otherwise short string → input. Submit → `respondToInterrupt({ interruptId, response })`.

**D26.** `components/movie-search.tsx` 🟡 — drop direct `setMovies` path; drop the 70-line `toolResults` projection useEffect (replaced by D29 + Amendment B); render discovery surface via `<A2UIRenderer surfaceId="discovery"/>`; render review-form via `<A2UIRenderer surfaceId="review-form"/>` (Amendment E); show `ApprovalDialog` when `pendingInterrupt` is non-null — including when the interrupt is a clarification (Amendment B), in which case the dialog renders the candidate buttons as the schema-driven response widget.

**D27.** `app/layout.tsx` 🟡 — wrap in `MemoryProvider`, `InspectorModeProvider`, `ActivityTimelineProvider`, `EventLogProvider`. **Drop** `ChatResultsProvider` (Amendment D — `chat-results-context.tsx` deleted).

**D28.** `app/page.tsx` 🟡 — LY3 layout: main column + Memory always-pinned (top-right, sized per mode); right rail (Inspector + Activity) when `inspectorMode === true`.

**D29.** `hooks/use-domain-collection.ts` 🟢 (Amendment D) — generic primitive: `useDomainCollection<T, K, S>({ fetch, toState, initialState }) → { state, refetch, mutate }`. Owns the per-item request counter and the rule "only roll back if your counter is still the latest." Tested at its interface (no internal state assertions).

**D30.** `hooks/use-movie-state.ts` 🟢 (Amendment D) — aggregator: `useMovieState(movieId) → { inWatchlist, reviewRating, toggleWatchlist, upsertReview, deleteReview }`. Composes `useWatchlist` + `useReviews`. Consumers (`movie-card`, `bookmark-icon`, `review-icon`, `review-modal`) drop their dual-context calls.

**D31.** `lib/domain-refetchers.ts` 🟢 (Amendment D) — `Record<DomainKey, () => Promise<void>>` registry. Hooked in `use-agent-chat.ts`'s `onToolCallResultEvent`: parse `wireMutationOutcomeSchema`; on `success`, loop `outcome.affected` and call refetchers. Adding a domain = one entry here + one member in `domainKeySchema` + one extension in `useMovieState`.

**D32.** `contexts/{watchlist,review}-context.tsx` 🟡 (Amendment D) — both contexts shrink to ~30-line wrappers over `useDomainCollection` providing domain-shaped state and domain-named methods. The duplicated counter/rollback logic is gone.

**D33.** `contexts/chat-results-context.tsx` ❌ — **deleted entirely** (Amendments A + B + E together obsolete all three of its fields).

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
- For server-executed tools, `STEP_STARTED` precedes `TOOL_CALL_START` and `STEP_FINISHED` follows `TOOL_CALL_RESULT`; for client-side tools, `STEP_FINISHED` follows `TOOL_CALL_END`
- Synthetic `"Parsing intent"` step opens at `RUN_STARTED`, closes at first `tool-call`
- Stream ending with a `tool-approval-request` for `commit_movie_night` → `RUN_FINISHED { result: { type:"interrupt", interrupts:[{ id: toolCallRecordId, ...responseSchema }]}}`
- Same for legacy `search_tmdb` (regression)
- Client-side tool names emit `STEP_FINISHED` immediately after `TOOL_CALL_END` (no result expected)

**Discovery tool** — `features/tools/discovery.test.ts` 🟢
- `view:"grid"` calls `moviesRepository.searchStructured(filters)`, returns `{ data, a2uiMessages }`
- `filters.maxRuntime` and `filters.excludedGenres` are enforced by the DB query; `filters.moods` may be echoed/displayed without direct DB enforcement
- `view:"comparison"` with `shortlistMovieIds` resolves movies via `moviesRepository.findByIds`, no TMDB call
- `view:"carousel"` (invalid) → falls back to `view:"grid"` + returned warning that `ag-ui-stream` emits as `CUSTOM { name:"warning" }`
- Description string contains every catalog component name (sanity check on prompt grounding)

**Mutation outcome contract** (Amendment A) — `packages/contracts/src/agent/mutation-outcome.test.ts` 🟢
- `mutationOutcomeSchema` parses each variant; rejects unknown `kind`
- `wireMutationOutcomeSchema` rejects `needs-clarification` (server-only marker should not appear on the wire)
- `success.affected` is non-empty
- `error.code` is restricted to the closed enum

**Mutation tools** (Amendment A) — `features/tools/{review-delete,watchlist-add,watchlist-remove}.test.ts` 🟡
- Single-match path returns `{kind: "success", affected: ["watchlist" | "reviews"], ...}`
- Multi-match path returns `{kind: "needs-clarification", candidates}`
- Direct lookup with `movieId` skips the search phase and returns `kind: "success"`
- Errors return `{kind: "error", code, message}` with the appropriate code

**AgentRun module** (Amendment C) — `services/agents/agent-run.test.ts` 🟢 (Vitest + PGLite or Testcontainers)
- `start` creates a session if `threadId` absent; reuses if present
- `start` persists user message + assistant message + tool calls in `onFinish`
- `start` failure marks `agent_runs.status = "failed"` via `onError`
- `resume` looks up pending tool call by `interruptId`; throws if not found
- `resume` rejects double-submit when pending tool call already has output
- `resume` for clarification interrupt re-invokes the tool with `movieId: response.pickedMovieId`
- `resume` re-enters `streamText` and yields LLM continuation events post-resolution
- `resume` records continuation against the same `agent_runs` row (no new run created)

**Clarification interrupt translation** (Amendment B) — `services/agents/ag-ui-stream.test.ts` 🟡 (extend)
- `tool-result` carrying `{kind: "needs-clarification", candidates}` emits no `TOOL_CALL_RESULT`; emits `RUN_FINISHED` with `result: { type: "interrupt", interrupts: [{...responseSchema, proposed: {candidates}}] }`
- The `interrupt.id` matches the persisted `tool_calls.id` for the pending call
- `responseSchema.properties.pickedMovieId.enum` matches the candidate ids in order

**Domain collection primitive** (Amendment D) — `apps/web/src/hooks/use-domain-collection.test.ts` 🟢
- Initial fetch populates state; failure leaves initialState
- `refetch` replaces state from a fresh fetch
- `mutate` applies `optimistic`, awaits `perform`, returns its value on success
- `mutate` calls `rollback` on failure
- `mutate` does **not** roll back if a newer mutation for the same key has fired in the meantime (counter rule)
- Concurrent mutations on different keys do not interfere

**Movie state aggregator** (Amendment D) — `apps/web/src/hooks/use-movie-state.test.tsx` 🟢
- Returns `inWatchlist: true` when the id is present in `useWatchlist().state`
- Returns `reviewRating` from `useReviews().state.get(movieId)`
- `toggleWatchlist` calls add when absent, remove when present
- `upsertReview` / `deleteReview` proxy with `movieId` bound

**Demo fixtures** — `services/agents/demo-fixtures.test.ts` 🟢
- Returns fixture for canonical prompt 1 (lowercased trim match)
- Returns `null` for unmatched prompt
- Each fixture emits a complete event sequence (RUN_STARTED → … → RUN_FINISHED) when consumed

**Message translator** — `services/agents/message-translator.test.ts` 🟡 *(extend)*
- `extractApprovalResponses` returns `{ approved, editedReason, interruptId }` for arbitrary interrupt id
- Backward-compat: still works for legacy `{ approved: true }` payloads from `search_tmdb`

**JSON pointer** — `lib/a2ui/json-pointer.test.ts` 🟢
- `get(state, "/movies")` returns nested array
- `set(state, "/filters/genres", value)` is immutable (returns new object)
- Empty path `""` → root; missing intermediate keys created on `set`

**A2UI store** — `lib/a2ui/store.test.ts` 🟢
- `createSurface` initializes empty surface state for new surfaces
- `createSurface` for an existing `surfaceId` preserves the current data model while refreshing metadata/catalog snapshot
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
- Run produces `RUN_FINISHED { result: { type: "interrupt", ... } }` carrying `commit_movie_night` proposed payload
- Client posts `{ approved: true, editedReason: "edited" }` → resume run completes → `movie_night_plans` row exists with `reason = "edited"` and `run_id` set
- Reject (`approved: false`) → no row inserted; chat acknowledges
- Schema-violation payload → 422; no row inserted

**Memory persistence** — `apps/api/tests/memory-persistence.test.ts` 🟢
- Run A: `update_preferences { genres:["Comedy"] }` for userX → row updated
- Run B (new session, same userX): `STATE_SNAPSHOT` carries `{ genres:["Comedy"] }`
- `update_preferences` with `notes:["a","b","c","d","e","f","g","h","i"]` over multiple calls keeps only last 8

### Smoke / rehearsal (manual + scripted)

- `DEMO_MODE_FIXTURES=true pnpm --filter @repo/api dev` + run all 4 prompts → matches golden trace exactly
- Sabotage script: kill TMDB env key, run prompt 1 → inspector shows `RUN_ERROR`; Activity marks the currently active "Searching TMDB" step as failed client-side; fixture fallback recovers
- Toggle Cmd+I 5× during a live run; surface state and run continuity preserved

### Validation Loop (development harness)

A scripted harness that drives the full test/typecheck/lint cycle plus end-to-end SSE-trace assertion. Sits *above* the unit/integration/component tests already specified — it consumes them and adds protocol-level regression catching that unit tests can't see.

**Purpose**: catch regressions in the AG-UI/A2UI event order at protocol boundary, where unit tests pass but the wire format drifts. Without it, "extra STATE_DELTA emitted" or "STEP_FINISHED before TOOL_CALL_RESULT" only surfaces at dress rehearsal.

**Components** (5, in build order):

1. **DB reset between runs** — truncate `agent_sessions`, `agent_runs`, `tool_calls`, `movie_night_plans` (cascades to `chat_messages` via FK). Reuses existing Testcontainers setup; one helper function.
2. **Hard guard against live LLM** — assert `DEMO_MODE_FIXTURES=true` at loop start; bail with non-zero exit otherwise. LLM stochasticity makes trace diffs noisy.
3. **HITL round-trip script** — two-step `fetch` flow against `/api/v1/chat`: initial run → assert `RUN_FINISHED { result: { type: "interrupt" } }` → POST approval response with edited `reason` and `interruptId` → assert resume run completes + `movie_night_plans` row inserted. ~30 lines.
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
- [ ] **Add `findToolCallById` to `agent-runs` repo** (Amendment C) — `packages/db/src/repositories/agent-runs.ts`. Used by `agentRun.resume` to look up pending tool call by `interruptId`.
- [ ] **Create A2UI protocol contracts** — `packages/contracts/src/a2ui/protocol.ts`
- [ ] **Create catalog contract** — `packages/contracts/src/a2ui/catalog.ts`
- [ ] **Create viewing-preferences contracts** — `packages/contracts/src/agent/viewing-preferences.ts`
- [ ] **Create interrupts contracts** — `packages/contracts/src/agent/interrupts.ts` (includes `clarificationInterrupt` builder per Amendment B)
- [ ] **Create mutation-outcome contracts** (Amendment A) — `packages/contracts/src/agent/mutation-outcome.ts`. Schemas: `mutationOutcomeSchema`, `wireMutationOutcomeSchema`, `domainKeySchema`, `mutationErrorCodeSchema`. Tests for discriminator parsing.
- [ ] **Protocol shape spike** — confirm installed `@ag-ui/core` event fields (`RUN_FINISHED.result`, `STEP_*.stepName`) and update tests/types before feature work; if upgrading AG-UI to an `outcome` API, do it here and revise the plan in the same patch
- [ ] **Interrupt resume contract** — define request wire format (`forwardedProps.interruptResponse` or explicit body field), server validation path, resume by `interruptId = tool_calls.id`, and double-submit rejection before Phase 3 UI work starts
- [ ] **Memory seeding contract** — implement/test "load latest preferences before creating new session; seed created session" to prevent latest-empty-session memory loss
- [ ] **Barrel exports** — `packages/contracts/src/{a2ui,agent}/index.ts` + root `index.ts`
- [ ] **Add `fast-json-patch` dependency** — `apps/web/package.json` + `apps/api/package.json`
- [ ] **JSON Patch adapter** — `apps/api/src/services/agents/json-patch-adapter.ts` (aligns `fast-json-patch` Operation[] with AG-UI `StateDeltaEvent.delta` typing)
- [ ] **Extend movie search filters + add ordered lookup** — `packages/db/src/repositories/movies.ts`: support `genres[]`, `maxRuntime`, `excludedGenres[]`; add `findByIds(ids: string[])` preserving caller order (consumed by `discovery` for comparison/night-plan views)
- [ ] **Generate + apply migration** — `pnpm db:generate && pnpm db:migrate`
- [ ] **Verify**: typecheck passes; `pnpm --filter @repo/db test` passes

### Phase 0.5 — Architecture deepenings (Mon week 1, ~1 day)

Deepenings A + C land here so Phase 1+ builds on the new shapes. Amendments B, D, E thread through later phases as marked.

- [ ] **(Amendment A) Apply `MutationOutcome` to mutation tools** — `apps/api/src/features/tools/{review-delete,watchlist-add,watchlist-remove}.ts` 🟡. Replace bespoke shapes with `{kind: "success" | "error" | "needs-clarification"}` returns. Each tool declares `affected: DomainKey[]` on success.
- [ ] **(Amendment A) Mutation-tool tests** — assert each tool returns the new envelope variants. `mutation-outcome.test.ts` parser tests (Phase 0).
- [ ] **(Amendment B) Clarification interrupt translation** — `apps/api/src/services/agents/ag-ui-stream.ts` 🟡: detect `{kind: "needs-clarification"}` on `tool-result`, persist pending tool call, emit `RUN_FINISHED { result: { type: "interrupt" } }`, stop. Test: golden trace for ambiguous-title prompt → asserts interrupt construction (no `TOOL_CALL_RESULT` for needs-clarification outputs).
- [ ] **(Amendment C) Build `agentRun` module** — `apps/api/src/services/agents/agent-run.ts` 🟢 with `start` + `resume`. Extract `SYSTEM_PROMPT` to its own file. Persistence via `onFinish`; resume re-enters `streamText` with tool-result message injected. Tests: PGLite-backed integration tests at the `start | resume` interface.
- [ ] **(Amendment C) Hard-cut old exports** — delete `runOrchestrator`, `runApprovedTool`, `buildApprovalStream`. Update `features/chat/route.ts` to ~40 lines using `agentRun`. Update `message-translator.ts`: rename `extractApprovalResponses` → `extractInterruptResponse`.
- [ ] **(Amendment D) Build `useDomainCollection` primitive + `useMovieState` aggregator** — `apps/web/src/hooks/{use-domain-collection,use-movie-state}.ts` 🟢. Tests: optimistic + rollback + stale-counter handling at the primitive's interface; aggregator joins under provider wrapper.
- [ ] **(Amendment D) Refactor existing contexts to use the primitive** — `apps/web/src/contexts/{watchlist,review}-context.tsx` 🟡. Existing tests should still pass without modification (interface-level behaviour preserved).
- [ ] **(Amendment D) Build refetcher registry** — `apps/web/src/lib/domain-refetchers.ts` 🟢. Wire into `use-agent-chat.ts` to dispatch on `wireMutationOutcomeSchema` parse.
- [ ] **(Amendment D) Migrate consuming components to `useMovieState`** — `apps/web/src/components/{movie-card,bookmark-icon,review-icon,review-modal}.tsx` 🟡. Existing component tests should pass.
- [ ] **(Amendment D) Delete `chat-results-context.tsx` + remove the `toolResults` projection useEffect from `movie-search.tsx`** — `apps/web/src/contexts/chat-results-context.tsx` ❌, `apps/web/src/components/movie-search.tsx` 🟡. Replace with refetcher-registry dispatch.
- [ ] **Verify**: typecheck, lint, all existing tests pass; `pnpm --filter @repo/api test` covers `agentRun.start | resume`; `pnpm --filter @repo/web test` covers `useDomainCollection`, `useMovieState`. No behavioural regression in the existing watchlist/review flows.

### Phase 1 — A2UI v0.9 protocol + UF1 (Mon-Tue week 1, ~1.5 days)

- [ ] **JSON Pointer helper** — `apps/web/src/lib/a2ui/json-pointer.ts` + tests
- [ ] **A2UI store** — `apps/web/src/lib/a2ui/store.ts` + `useA2UISurface` hook + tests
- [ ] **Client catalog map** — `apps/web/src/lib/a2ui/catalog.ts`
- [ ] **`Column` and `Skeleton` renderers** — `apps/web/src/lib/a2ui/renderers/column.tsx`, `skeleton.tsx`
- [ ] **`MovieFilterPanel` + `MovieGrid` renderers** — `apps/web/src/lib/a2ui/renderers/{movie-filter-panel,movie-grid}.tsx`
- [ ] **Refactor `WatchlistGrid` and `ReviewsGrid` to read from bound paths** — `apps/web/src/lib/a2ui/renderers/{watchlist-grid,reviews-grid}.tsx`
- [ ] **Refactor `A2UIRenderer` to dispatch protocol surfaces only** (Amendment E supersedes the v1 "preserve tagged-union path for `review-form`" — every renderer including `review-form` goes through the protocol path) — `apps/web/src/lib/a2ui/registry.tsx`
- [ ] **(Amendment E) Rename tool: `review_add` → `review_prefill`** — `apps/api/src/features/tools/review-add.ts` → `review-prefill.ts`; update tool registry key in `agentRun`'s toolset; update system prompt; update frontend dispatch to use `useA2UISurface("review-form")`.
- [ ] **(Amendment E) Convert `review-form` renderer to A2UI-backed** — `apps/web/src/lib/a2ui/renderers/review-form.tsx` reads `movie`, `rating`, `text` from bound paths; tool emits `reviewFormMessages(...)` from a new emitter helper.
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
- [ ] **Emit `RUN_FINISHED { result: { type: "interrupt", ... } }` when stream ends with pending tool-approval-request** — `apps/api/src/services/agents/ag-ui-stream.ts` + tests (cover `commit_movie_night` AND `search_tmdb` regression)
- [ ] **Build interrupt payload helpers** — `packages/contracts/src/agent/interrupts.ts` (already created in Phase 0; flesh out builders)
- [ ] ~~**Refactor `runApprovedTool` → `runResumedRun(...)`**~~ **Already landed in Phase 0.5 (Amendment C).** Resume lives on `agentRun.resume`. This phase only wires `commit_movie_night` into the per-tool merge logic in `agentRun.resume` (`{ ...pending.input, reason: response.editedReason ?? pending.input.reason }`) and routes the resolved invocation to `movieNightService.commit`.
- [ ] **Movie-night service** — `apps/api/src/services/movie-night.ts`
- [ ] **`commit_movie_night` tool with `needsApproval: true`** — `apps/api/src/features/tools/commit-movie-night.ts`
- [ ] ~~**Replace `buildApprovalStream` with generic `buildResumeStream`**~~ **Already landed in Phase 0.5 (Amendment C).** Both buildApprovalStream and buildResumeStream are deleted; the route uses `agentRun.resume` directly.
- [ ] **Approval dialog (schema-driven)** — `apps/web/src/components/approval-dialog.tsx` + tests
- [ ] **Replace `pendingApproval` with `pendingInterrupt` in `useAgentChat`; add `respondToInterrupt`** — `apps/web/src/hooks/use-agent-chat.ts`
- [ ] **Show approval dialog from MovieSearch when `pendingInterrupt` is non-null** — `apps/web/src/components/movie-search.tsx`
- [ ] **Tests**: `hitl-commit-movie-night.test.ts` (Testcontainers) — full round-trip with `editedReason` insert, reject, schema-violation
- [ ] **Verify UF4**: "pick one for tonight, plus a backup" → `MovieNightPlan` renders → approval dialog with editable reason → approve → `movie_night_plans` row exists
- [ ] **Record golden trace for HITL round-trip** — `apps/api/tests/__goldens__/hitl-commit-movie-night.json`. Captures both initial run (`RUN_FINISHED.result.type === "interrupt"`) and resume run.

### Phase 4 — Memory + UF3 + system-prompt injection (Fri week 1, ~1 day)

- [ ] **Memory service** — `apps/api/src/services/agents/memory.ts` (load, applyPreferencesPatch with FIFO-8 cap, formatMemoryForSystemPrompt) + tests
- [ ] **`update_preferences` tool** — `apps/api/src/features/tools/update-preferences.ts` + tests (returns `{ jsonPatchOps, snapshot }`)
- [ ] **Emit `STATE_SNAPSHOT` after `RUN_STARTED`; emit `STATE_DELTA` on `update_preferences` tool result** — `apps/api/src/services/agents/ag-ui-stream.ts` + tests
- [ ] **Inject `formatMemoryForSystemPrompt(memory)` into system prompt; emit `CUSTOM { name:"memory-applied", value: { keys } }` when prefs influence `discovery.filters`** — `apps/api/src/services/agents/orchestrator.ts`
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

`@ag-ui/core`, `@ag-ui/encoder`, `@ag-ui/client` are installed and used end-to-end. The chat route emits SSE events via `EventEncoder`; the web client subscribes via `HttpAgent`. AI SDK (`ai` package) drives tool execution via `streamText`. Approval flow exists for `search_tmdb` but uses the "missing TOOL_CALL_RESULT" cheat instead of a structured interrupt result.

- Current behavior: tool returns object → orchestrator streams `RUN_STARTED`, `TEXT_MESSAGE_*`, `TOOL_CALL_*` (start/args/end), `TOOL_CALL_RESULT`, `RUN_FINISHED`
- Current limitations: no `STATE_SNAPSHOT`/`STATE_DELTA`, no `STEP_*`, no `CUSTOM`, no `RUN_FINISHED.result.type === "interrupt"`, AI-SDK `start-step`/`finish-step` parts ignored in `ag-ui-stream.ts`

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
| `apps/api/src/features/tools/review-add.ts` | (Amendment E) Renamed to `review-prefill.ts`; converted to surface-emitting `{data, a2uiMessages}` shape. |
| `packages/db/src/schema/agent-sessions.ts` | Has unused `context` JSONB; `viewing_preferences` to be added |
| `packages/db/src/repositories/agent-sessions.ts` | `findById`, `findLatestByUserId`, `updateContext` |
| `packages/db/src/repositories/agent-runs.ts` | `findPendingToolCall`, `createRun`, `createToolCall`, etc. |
| `packages/contracts/src/a2ui/{watchlist-grid,review-form,reviews-grid}.ts` | Current tagged-union surface schemas |
| `apps/web/src/lib/ag-ui/client.ts` | `createAgentClient(threadId)` returning `HttpAgent` |
| `apps/web/src/hooks/use-agent-chat.ts` | Subscriptions, `sendMessage`, `approveToolCall`, `pendingApproval` state |
| `apps/web/src/lib/a2ui/registry.tsx` | Tagged-union registry; dispatches by `surface.type` |
| `apps/web/src/lib/a2ui/renderers/{watchlist-grid,review-form,reviews-grid}.tsx` | Current renderers — typed `data` prop |
| `apps/web/src/components/movie-search.tsx` | Main UI; effect projects tool results into context |
| `apps/web/src/contexts/chat-results-context.tsx` | (Amendment D) **Deleted**. Clarification → interrupt; surface → A2UI store; `movies` already unused. |

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
- Tool with optional `movieId` shortcut + clarification fallback → `apps/api/src/features/tools/review-prefill.ts` (renamed from `review-add.ts` per Amendment E; model for `discovery` when matching shortlists). Note: post-Amendment A, the clarification "fallback" returns `{kind: "needs-clarification", candidates}` rather than the old `clarification_needed` shape.
- Movies bulk lookup and richer filters are **not yet present** in `moviesRepository` — add ordered `findByIds(ids: string[])` plus `genres[]` / `maxRuntime` / `excludedGenres[]` search support as part of Phase 0 (used by `discovery` for comparison/night-plan views and memory-backed search)

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
- ~~**`review-form` is intentionally kept tagged-union**~~ **Withdrawn by Amendment E** (§1.5). All renderers — including `review-form` — go through the A2UI store. The talk's "JSON maison" baseline framing is replaced by the unified A2UI-protocol-everywhere story.
- **Demo-mode flags must be off in production builds.** Add a startup log warning if `DEMO_MODE_FIXTURES=true` is detected outside `NODE_ENV !== "development"`.
- **Token cost discipline**: the catalog description in `discovery`'s tool prompt (~500–800 tokens) is the single biggest prompt addition. If observed costs balloon, switch to lazy catalog descriptions (only the components valid for the current `view`).

---

## Resolved questions

1. **AI SDK ↔ AG-UI interrupt mapping** → **Phase 0 spike is the gate.** Verify `tool-approval-request` reliably fires, confirm installed AG-UI uses `RUN_FINISHED.result` / `STEP_*.stepName`, and lock the resume-by-`interruptId` request format before UI work starts. If `tool-approval-request` is unreliable, fall back to H1 per the cross-phase fallback list.

2. **`respondToInterrupt` wire format** → **Current code is a throwaway test, not a reference.** Use a clean request extension (`forwardedProps.interruptResponse` or explicit body field) carrying `{ interruptId, response }`; do not copy `agentRef.current.messages = [...]`.

3. **`search_movies` retirement** → **Hide.** Removed from LLM tool registry. Lives only as internal helper consumed by `discovery`.

4. **`region` field in viewing-preferences** → **Removed.** Not in schema, not in prompts, not in Memory panel.

5. **JSON Patch typing parity** → **Adapter added** (C19 `services/agents/json-patch-adapter.ts`).

6. **Replay-Prompt-1 trigger UX** → **Manual "Replay last" button in inspector header** (D21). No auto-replay.

7. **MovieCard hover overlays inside A2UI surfaces** → **OK as designed.** Verify on first integration of `MovieGrid` in Phase 1; existing `WatchlistContext` and `ReviewContext` continue to drive overlays unchanged.

8. **Catalog hot-reload behavior** → **Confirmed.** Snapshot the catalog into the surface state at `createSurface`; new queries pick up live catalog edits.
