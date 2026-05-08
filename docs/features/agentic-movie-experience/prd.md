# PRD: Agentic Movie Experience

## Why

- The current videoclub app already has an agent (search, watchlist, reviews) that returns ad-hoc tagged-union "surfaces" the frontend dispatches via a small registry. This works but it doesn't *show* what makes agentic UI compelling: progressive rendering, an agent that learns across the conversation, the agent picking layouts, structured human approval for consequential actions, and a transparent execution trace.
- This feature upgrades the videoclub experience to a real agent-driven UI by adopting two open protocols: **A2UI v0.9** (declarative, JSON-described surfaces with a component catalog and a separated data model) and **AG-UI** advanced features (state snapshot/delta, schema-driven interrupts, frontend tools, step-level activity). The two grids that exist today (`watchlist-grid`, `reviews-grid`) and the implicit search-results surface migrate to A2UI v0.9; the review form stays as a tagged-union surface to act as the "JSON maison" baseline.
- The work doubles as the demo for an upcoming presentation about agentic UIs; the protocol layer is observable through a developer inspector mode the user can toggle. Both audiences — end users (better discovery, persistent taste, controlled commits) and developers (a worked example of A2UI/AG-UI in production-shaped code) — get value from the same artifact.

## Result

### Acceptance Criteria

- [ ] Movie discovery results render via A2UI v0.9 messages: `createSurface` → `updateComponents` (skeleton) → `updateDataModel` (filters echoed) → `updateDataModel` (movies) — three to four visible frames, not a single burst
- [ ] The agent chooses the discovery layout per query via a `view` argument (`grid` | `comparison` | `night-plan`) and the choice is observable in the AG-UI `TOOL_CALL_ARGS` event
- [ ] When the user asks to compare or finalize a pick, the same surface re-renders with a different component graph but reuses data already in the model where possible (structure swap, not full rebuild)
- [ ] The agent captures durable viewing preferences (`genres`, `maxRuntime`, `moods`, free-text `notes`) into a per-user memory slot via an `update_preferences` tool, and emits AG-UI `STATE_SNAPSHOT` at run start and `STATE_DELTA` on each update
- [ ] On a follow-up query that omits constraints, the agent silently applies remembered preferences to its search arguments without narrating the use in chat
- [ ] When the agent proposes a movie-night plan, the user can approve, reject, or approve with an edited `reason` via a schema-driven approval UI; on approve, the plan persists to a new `movie_night_plans` table and a new run resumes
- [ ] The HITL flow uses AG-UI's `RUN_FINISHED { outcome: interrupt }` shape with a declared `responseSchema`, not the implicit "missing tool result" pattern that exists today
- [ ] The user can toggle Developer Inspector mode (Cmd+I) and see the full event stream, an activity timeline of named steps, and the memory panel alongside the surface
- [ ] Two frontend tools (`showMovieDetails`, `highlightComparisonCriteria`) are exposed to the agent and execute on the client; their invocations appear in the inspector as TOOL_CALL events annotated `(client-side)`
- [ ] All four scripted demo prompts run end-to-end live with the audience-visible features
- [ ] A `DEMO_MODE_FIXTURES` env flag deterministically replays canned tool results for those four prompts

### Features

- **Progressive movie discovery surface.** Search results render as an A2UI surface with a clearly visible skeleton-to-data evolution; filters echo the agent's parsed intent before TMDB results land.
- **Adaptive view layout.** The agent chooses between Grid, Comparison Table, and Night Plan layouts per query; the surface reuses the same data model across switches.
- **Persistent viewing preferences (Memory).** A front-of-screen Memory panel reflects what the agent has learned about the user across the conversation; the agent applies that memory silently on later queries.
- **Approve-with-edits movie-night commit.** The agent proposes a pick + backups + reason; the user can edit the reason and approve through a schema-driven dialog before the plan is committed.
- **Developer Inspector mode.** A togglable second mode surfaces the full event stream, a step-level activity timeline, and frontend-tool invocations — for both this app's debugging and the talk's pedagogical second half.

### Visual

The demo screen has two modes (LY3):

**User mode** (default) — chat input + main A2UI surface (~75% width); Memory panel pinned top-right (~25% width):

```
┌──────────────────────────────────────────────────────────────┬─────────────┐
│  videoclub                                                   │  MEMORY     │
│  [ what do you want to watch?                          ⏎ ]   │  genres:    │
│  [My Reviews]                                                │   [Comedy]  │
│                                                              │  notes:     │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐                │   • likes   │
│  │ A    │ │ B    │ │ C    │ │ D    │ │ E    │                │     feel-   │
│  └──────┘ └──────┘ └──────┘ └──────┘ └──────┘                │     good    │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐                └─────────────┘
│  │ F    │ │ G    │ │ H    │ │ I    │ │ J    │
│  └──────┘ └──────┘ └──────┘ └──────┘ └──────┘
│                                                          [⌘I → Protocol]
└────────────────────────────────────────────────────────────────────────────┘
```

**Inspector mode** (Cmd+I) — surface shrinks to ~55% width; right rail (~45%) shows Memory (top), Event Inspector (middle), Activity Timeline (bottom):

```
┌──────────────────────────────────────────────┬─────────────────────────────┐
│  videoclub                                   │  MEMORY                     │
│  [ search... ]                               │   genres: [Comedy]          │
│                                              │   maxRuntime: 120           │
│  ┌──────┐ ┌──────┐ ┌──────┐                  │   notes: • likes feel-good  │
│  │ A    │ │ B    │ │ C    │                  ├─────────────────────────────┤
│  └──────┘ └──────┘ └──────┘                  │  INSPECTOR                  │
│  ┌──────┐ ┌──────┐ ┌──────┐                  │   RUN_STARTED               │
│  │ D    │ │ E    │ │ F    │                  │   TOOL_CALL_START           │
│  └──────┘ └──────┘ └──────┘                  │    search_movies            │
│                                              │   TOOL_CALL_ARGS            │
│                                              │    {view:"grid"}            │
│                                              │   CUSTOM:a2ui (3 msgs)      │
│                                              │   RUN_FINISHED              │
│                                              ├─────────────────────────────┤
│                                              │  ACTIVITY                   │
│                                              │   ✓ Parse intent            │
│                                              │   ✓ Search local            │
│                                              │   ⏳ Search TMDB            │
└──────────────────────────────────────────────┴─────────────────────────────┘
```

**A2UI message shape (movie-discovery example):**

```jsonc
{ "createSurface":   { "surfaceId": "discovery", "catalogId": "videoclub" } }
{ "updateComponents":{ "surfaceId": "discovery", "components": [
    { "id": "root",    "component": "Column", "children": ["filters","grid"] },
    { "id": "filters", "component": "MovieFilterPanel", "data": { "path": "/filters" } },
    { "id": "grid",    "component": "Skeleton", "variant": "movie-grid" } ] } }
{ "updateDataModel": { "surfaceId": "discovery", "path": "/filters",
    "value": { "genres": ["Comedy"], "maxRuntime": 120 } } }
{ "updateComponents":{ "surfaceId": "discovery", "components": [
    { "id": "grid", "component": "MovieGrid", "data": { "path": "/movies" } } ] } }
{ "updateDataModel": { "surfaceId": "discovery", "path": "/movies", "value": [...] } }
```

**HITL interrupt shape (commit_movie_night example):**

```jsonc
{ "type": "RUN_FINISHED",
  "outcome": {
    "type": "interrupt",
    "interrupts": [{
      "id": "confirm-movie-night",
      "reason": "user_approval_required",
      "message": "Confirm tonight: Dune (backup: The Martian)?",
      "proposed": { "pickedMovieId": "...", "backupMovieIds": ["..."], "reason": "..." },
      "responseSchema": {
        "type": "object",
        "properties": {
          "approved":     { "type": "boolean" },
          "editedReason": { "type": "string" }
        },
        "required": ["approved"]
      }
    }]
  } }
```

### Use cases / edge cases

**Main use cases:**
- *Discovery.* User types "I want a fun feel-good comedy under 2h" → agent captures preferences → emits A2UI messages staged over ~2s → grid populates with comedies.
- *Memory growth.* User adds context ("we're 4 friends, no horror") → agent calls `update_preferences` only → Memory panel reflects the deltas; no redundant search.
- *Layout switch.* User asks "compare the top 3" → agent re-issues the discovery tool with `view: "comparison"` → surface swaps to a comparison table; data model preserves the relevant movies.
- *Frontend nudge.* After comparison, agent calls `highlightComparisonCriteria(["runtime", "mood"])` → those columns flash on the table.
- *HITL commit.* User says "OK pick one for tonight, plus a backup" → agent renders `MovieNightPlan` surface + emits an interrupt → user edits the `reason` → on approve, plan persists, run resumes with confirmation.
- *Developer mode.* User presses Cmd+I → right rail appears with Memory / Inspector / Activity → all subsequent runs show their full event trace.

**Edge cases:**
- *LLM picks an invalid `view` value* → discovery tool falls back to `view: "grid"` and emits a warning event in the inspector; user-visible behavior is unaffected.
- *Memory silent-use prompt drift* → if the LLM fails to apply remembered preferences, the orchestrator pre-injects them as hidden context in the user message (`DEMO_MODE_FIXTURES` makes this deterministic for the talk).
- *Approval rejected* → `RUN_STARTED` of the next run carries `{ approved: false }`; agent acknowledges, plan is not persisted, surface stays.
- *Approval times out / abandoned* → the interrupt remains pending in the run; reopening the page loads the latest run state and re-renders the approval UI.
- *TMDB unavailable* → the agent emits `RUN_ERROR` after the `STEP_FINISHED` for the failed step; the surface keeps any partial data already injected (filters echo, prior cards).
- *Frontend tool invoked while surface is gone* → the client-side handler is a no-op; the inspector still records the `TOOL_CALL_START`.
- *Memory grows unbounded* → `notes` array is capped at 8 most recent entries (oldest evicted) to keep prompt cost stable; structured keys hold one value each.
- *Catalog drift* (agent emits a `component` name not in the catalog) → renderer no-ops the unknown component and logs to the inspector; no UI crash.

### User Flows

| UF | Name | File |
|----|------|------|
| UF1 | Progressive movie discovery | [uf1-progressive-movie-discovery.md](./uf1-progressive-movie-discovery.md) |
| UF2 | Adaptive view layout | [uf2-adaptive-view-layout.md](./uf2-adaptive-view-layout.md) |
| UF3 | Persistent viewing preferences | [uf3-persistent-viewing-preferences.md](./uf3-persistent-viewing-preferences.md) |
| UF4 | Approve a movie-night plan with edits | [uf4-approve-movie-night-plan.md](./uf4-approve-movie-night-plan.md) |
| UF5 | Developer inspector mode | [uf5-developer-inspector-mode.md](./uf5-developer-inspector-mode.md) |

*(Each UF is documented in its own file. Notion integration not enabled — no `--db`/`--epic` provided.)*

## Decisions

### Locked design decisions (from grilling)

- **A2UI scope.** Migrate `movie-grid`, `watchlist-grid`, `reviews-grid` to A2UI v0.9. `review-form` stays as a tagged-union surface to serve as the "JSON maison" baseline contrast.
- **Catalog granularity.** C-medium: 8 components — `Column`, `MovieFilterPanel`, `MovieGrid`, `MovieComparisonTable`, `MovieNightPlan`, `WatchlistGrid`, `ReviewsGrid`, `Skeleton`. Composition only at the top level; domain widgets stay opaque.
- **Layout authority.** L3 hybrid: tools deterministically pick the layout for `watchlist-grid` and `reviews-grid`; the LLM picks the layout for movie-discovery via a `view` argument. Argument is visible in `TOOL_CALL_ARGS`.
- **Progressive rendering staging.** P3 default for `view: "grid"` (skeleton → filters echo → grid). P4 optional for `view: "night-plan"` if budget permits. Demo-mode `await sleep(700)` guarded by `DEMO_MODE_SLEEP` env to make frames legible.
- **Transport.** A2UI messages travel as AG-UI `CUSTOM` events with `name: "a2ui"`. Tools return arrays of A2UI messages; the orchestrator translates them into CUSTOM events on the existing SSE channel.
- **AG-UI feature scope.** S-wide minus replay: build inspector, HITL spec fix, viewing preferences (state delta), 2 frontend tools, activity timeline. Capability discovery and replay are slide-only.
- **Memory shape.** Static schema `{ genres?, maxRuntime?, moods? }` + free-text `notes: string[]` (capped at 8). Per-user JSONB on `agent_sessions`. (`region` removed — out of scope.)
- **Memory mechanism.** Dedicated `update_preferences(partial)` tool emits `STATE_DELTA` as JSON Patch. `STATE_SNAPSHOT` emitted at every run start. System prompt injects current memory each run for silent application.
- **HITL flagship.** `commit_movie_night` with editable `reason` field. Persists to a new `movie_night_plans` table.
- **HITL spec compliance.** Map AI SDK `tool-approval-request` → AG-UI `RUN_FINISHED { outcome: interrupt, interrupts: [...] }`. Approval UI renders from the interrupt's declared `responseSchema`. The current "missing tool result" approach is replaced.
- **Frontend tools.** Two: `showMovieDetails(movieId)` and `highlightComparisonCriteria(criteria: string[])`. Wiring W1: server stub with no-op `execute` returning `null`; client registry intercepts based on tool name; fire-and-forget. Inspector annotates them `(client-side)`.
- **Activity timeline.** St1 source — orchestrator-emitted, derived from tool calls. Synthetic `"Parsing intent"` step at run start. Stacked across multi-tool runs.
- **Demo mode.** `DEMO_MODE_FIXTURES` env flag short-circuits tool execution to canned responses keyed on prompt text for the 4 demo prompts. Prompt 1 also replays from fixtures right after the user→inspector pivot.
- **Demo flow.** 4 prompts: capture (user-mode) → pivot (Cmd+I) → memory growth → adaptive view + frontend tool → night-plan + HITL.

### Out of Scope

- **Replay / time-travel of runs** — slide-only mention; no event log persistence beyond the existing `agent_runs` table.
- **Capability discovery endpoint** — slide-only mention.
- **Migration of `review-form` to A2UI v0.9** — kept as tagged-union surface for the demo's "before" contrast.
- **A second HITL flow** (e.g., share-watchlist, bulk delete) — `commit_movie_night` is sufficient.
- **Multi-user features** (sharing, social, followship) — single-user app remains.
- **Watch-provider badges and region-based filtering** — region dropped entirely (not in memory schema, not in prompts, not in catalog); if P4 staging is built, watch providers can be mocked.
- **Memory rollback / forget** — user has no UI to clear or edit the Memory directly; the agent overwrites via `update_preferences`.
- **Approval history view** — the new `movie_night_plans` rows are written, but there is no UI to browse past plans.
- **Card-level A2UI primitives** (`Card`/`Image`/`Heading` composition) — domain widgets stay opaque (C-medium).
- **W3 (round-trip) wiring for frontend tools** — fire-and-forget only; talk mentions W3 as the principled alternative.

## Technical Specification

### Architecture

**High-level flow:** Existing AG-UI/AI-SDK orchestrator stays. Tools no longer return tagged-union surfaces; they return `{ data, a2uiMessages: A2UIMessage[] }`. The `streamAgUiEvents` translator emits the AI-SDK `tool-result` event as today **and** emits each A2UI message as an AG-UI `CUSTOM` event with `name: "a2ui"`. The frontend AG-UI client routes CUSTOM events to a new A2UI store; the store applies messages to per-surface state and React renders via the existing `A2UIRenderer` augmented with catalog-aware composition.

**Key components:**

- *Server*
  - `apps/api/src/services/agents/orchestrator.ts` — wires the new `update_preferences` tool, the rewritten `search_movies` (emits A2UI messages), the new `commit_movie_night` tool. Loads/saves memory; emits `STATE_SNAPSHOT` at run start.
  - `apps/api/src/services/agents/ag-ui-stream.ts` — emits `STEP_STARTED`/`STEP_FINISHED` around tool calls, `STATE_DELTA` from `update_preferences` results, `CUSTOM:a2ui` from tool A2UI message arrays, `RUN_FINISHED { outcome: interrupt }` for HITL tools (replaces the missing-result trick).
  - `apps/api/src/features/tools/*.ts` — tools refactored to return `{ result, a2uiMessages? }`. New tools: `update_preferences`, `commit_movie_night`. Frontend tools (`showMovieDetails`, `highlightComparisonCriteria`) defined as no-op stubs.
- *Shared contracts*
  - `packages/contracts/src/a2ui/` — new schemas: `protocol.ts` (createSurface/updateComponents/updateDataModel message types), `catalog.ts` (component definitions). Existing `watchlist-grid.ts`/`reviews-grid.ts`/`review-form.ts` remain as the *return-shape* contracts at the tool boundary; the wire format adopts the protocol shape.
  - `packages/contracts/src/agent/` — new: `viewing-preferences.ts` (memory schema), `interrupts.ts` (commit_movie_night responseSchema).
- *DB*
  - `packages/db/src/schema/agent_sessions.ts` — add `viewing_preferences` JSONB column.
  - `packages/db/src/schema/movie_night_plans.ts` — new table.
- *Client*
  - `apps/web/src/lib/a2ui/store.ts` — new: per-surface state, applies protocol messages, JSON-pointer data binding.
  - `apps/web/src/lib/a2ui/catalog.ts` — new: catalog declaration; maps component name → React renderer; renderers: `Column`, `MovieFilterPanel`, `MovieGrid`, `MovieComparisonTable`, `MovieNightPlan`, `WatchlistGrid`, `ReviewsGrid`, `Skeleton`.
  - `apps/web/src/lib/a2ui/registry.tsx` — refactored to dispatch via the catalog instead of the current tagged-union map; tagged-union `review-form` kept as a special case.
  - `apps/web/src/lib/ag-ui/client.ts` — extended subscription: handle CUSTOM events, STATE_SNAPSHOT/DELTA, STEP_STARTED/FINISHED, RUN_FINISHED with interrupt outcome.
  - `apps/web/src/lib/ag-ui/frontend-tools.ts` — new: registry of client-side tool handlers; matches by tool name.
  - `apps/web/src/contexts/memory-context.tsx` — new: holds current snapshot and applies deltas.
  - `apps/web/src/components/inspector/` — new: `inspector-panel.tsx`, `activity-timeline.tsx`, `memory-panel.tsx`.
  - `apps/web/src/contexts/inspector-mode-context.tsx` — new: toggles user/inspector mode (Cmd+I shortcut).

### Libraries & tools

- **`@ag-ui/core`, `@ag-ui/encoder`, `@ag-ui/client`** (already installed): event encoding/decoding; subscription model.
- **AI SDK (`ai`)** (already installed): orchestrator core; `tool()` factory used for both server and client-side stub tools.
- **Drizzle ORM** (already installed): `viewing_preferences` JSONB column; new `movie_night_plans` table.
- **Zod** (already installed): A2UI message and catalog schemas; viewing-preferences schema; interrupt response schemas.
- **`fast-json-patch`** (new): apply `STATE_DELTA` JSON Patch operations on the client; emit deltas server-side.
- **`json-pointer`** (new, ~3kb): A2UI data binding (resolve `path: "/movies"` against per-surface data model).
- **`@radix-ui/react-dialog`** via `@repo/ui` (already): approval dialog rendering.

### Data Requirements

**Schema changes:**

- `agent_sessions` — add column `viewing_preferences` (JSONB, default `'{}'`). Stores the durable per-user memory.
  - Note: keying memory by *session* is acceptable for the demo; "per-user" memory survives across sessions if the orchestrator hydrates from the user's most recent session, which it already does for HITL today.
- New table `movie_night_plans`:
  - `id` UUID PK
  - `user_id` text NOT NULL, indexed
  - `picked_movie_id` UUID NOT NULL, FK → `movies.id`
  - `backup_movie_ids` text[] (UUIDs)
  - `reason` text
  - `created_at` timestamptz NOT NULL default now()

**External data:** TMDB (existing). No new external integrations.

**Demo fixtures:** `apps/api/src/services/agents/demo-fixtures.ts` — keyed on prompt text; returns canned tool results (and A2UI message arrays) for the 4 scripted prompts when `DEMO_MODE_FIXTURES=true`.

### Rights & Permissions

| Permission | Description | User Roles |
|------------|-------------|------------|
| Read own preferences | Memory snapshot loaded at run start | Authenticated user |
| Update own preferences | Agent-driven `update_preferences` tool writes to the user's memory | Authenticated user |
| Read own movie-night plans | (No UI surface in scope; data accessible via DB only) | Authenticated user |
| Create own movie-night plan | `commit_movie_night` after explicit approval | Authenticated user |
| Toggle developer inspector | Cmd+I keyboard shortcut, no server-side gating | Any user |

### Testing strategy

- **Unit (Vitest):**
  - `streamAgUiEvents` — emits `STEP_STARTED`/`STEP_FINISHED` around `TOOL_CALL_*`; emits `CUSTOM:a2ui` for A2UI messages; emits `STATE_DELTA` for `update_preferences` results; emits `RUN_FINISHED { outcome: interrupt }` for HITL tools.
  - A2UI store — applies `createSurface`/`updateComponents`/`updateDataModel` correctly; resolves JSON-pointer bindings; handles unknown components without throwing.
  - Tools — `update_preferences` produces a JSON Patch matching the input; `commit_movie_night` blocks awaiting approval and resumes with the user-edited reason; `search_movies` emits the P3 staged sequence in order.
  - Memory injection — given current memory, the orchestrator builds a system prompt suffix that includes preferences in a stable, model-friendly shape.
- **Integration (Vitest + Testcontainers):**
  - End-to-end run for each of the 4 demo prompts against a real Postgres; assert event sequence matches a recorded snapshot.
  - HITL round-trip: run → interrupt → user POSTs approval with edited `reason` → resume → DB row exists with the user's reason.
  - Memory persistence across sessions for the same user.
- **React Testing Library:**
  - Catalog renderers each render expected shape from a representative protocol message sequence.
  - Inspector panel formats each event type; Activity timeline shows stacked steps; Memory panel reflects snapshot + flashes deltas.
  - LY3 toggle switches layout and Memory remains visible in both modes.
- **Smoke (manual / scripted):**
  - `DEMO_MODE_FIXTURES=true` runs all four prompts deterministically; output diff against a golden trace.
  - Sabotage rehearsal: kill TMDB, kill the LLM key, throttle network — verify graceful inspector messaging and fixture fallback.

## Production strategy

This feature ships behind a build-time toggle for the inspector mode (always available locally / on staging; gated to internal users in any future hosted deployment). For the *talk*, the relevant signals are demo reliability rather than aggregate usage. Concretely:

- **Pre-talk dress run** (mandatory): run all four prompts thrice in a row with `DEMO_MODE_FIXTURES=false` (real LLM + TMDB), then once with `DEMO_MODE_FIXTURES=true` (fallback). Record an event-trace snapshot from each run; flag any divergence.
- **Logging.** The existing `agent_runs` / `agent_run_tool_calls` tables already capture each tool invocation. Add `viewing_preferences_snapshot` (JSONB) on `agent_runs` — stores the snapshot read at run start — for after-the-fact verification of memory application.
- **Failure modes & alerting.** Three classes:
  - *Catalog drift* (agent emits an unknown component name) — log to inspector + console.warn; in production, this becomes an analytics event because it usually means the prompt+catalog diverged.
  - *Interrupt response schema violations* — server returns 422 with the schema diff; client renders the dialog without the offending field but does not approve.
  - *Memory write failures* — fall back gracefully (memory stays at the previous snapshot); the agent's silent-use behavior degrades but discovery still works.
- **Post-talk.** The work is intended to outlive the demo: A2UI/AG-UI feature scope (minus replay) is durable architecture. Next features (super watchlist, watched history) should be built directly against the new catalog and protocol surfaces rather than as new tagged-union side paths.
