# Implementation Plan: UF1 — Progressive Movie Discovery

> Slice of the [macro plan](./agentic-movie-experience-plan.md). Covers UF1 only: A2UI v0.9 on the wire, P3-staged discovery surface, silent migration of `watchlist-grid` + `reviews-grid` to the protocol. UF2 (`view: comparison|night-plan`), UF3 (memory), UF4 (HITL), UF5 (inspector) are out of scope here.

## 1. Feature Description

**Objective**: Replace the one-shot tagged-union surface dispatch with an A2UI v0.9 protocol carried over AG-UI `CUSTOM` events. Discovery renders progressively (skeleton → filters echo → grid). `watchlist-grid` and `reviews-grid` migrate silently. `review-form` stays tagged-union as the "JSON maison" baseline.

**Key Capabilities**:
- **CAN** stream A2UI messages (`createSurface`, `updateComponents`, `updateDataModel`) — one AG-UI `CUSTOM { name: "a2ui" }` event per message
- **CAN** stage discovery emission as: `createSurface` → `updateComponents` (skeleton) → `updateDataModel /filters` → `updateComponents` (real grid) → `updateDataModel /movies`
- **CAN** insert `await sleep(DEMO_MODE_SLEEP)` between A2UI frames when the env is set; degrade to network-paced rendering when unset
- **CAN** apply messages to a per-`surfaceId` client store with JSON-pointer data binding
- **CAN** render `watchlist-grid` and `reviews-grid` from the protocol (visually identical to today)
- **CAN** survive an unknown component name in `updateComponents` (no-op + console warn; renderer skips)
- **CANNOT** pick view layouts (LLM still produces grid only; UF2 adds `view`)
- **CANNOT** load/apply viewing preferences (UF3)
- **CANNOT** request approval / interrupts (UF4)
- **CANNOT** show inspector / activity timeline (UF5)
- **CANNOT** invoke client-side tools (UF5)

**Business Rules**:
- The new `discovery` tool replaces `search_movies` in the LLM tool registry. `search_movies` is retired to an internal helper (`searchMoviesData`) consumed by `discovery`.
- `discovery` accepts `view: string` (validated internally; UF1 only emits `"grid"`; invalid values fall back to grid + emit `CUSTOM { name: "warning" }`). The `view` argument is reserved for UF2; UF1 ignores anything other than grid.
- Discovery filters supported in UF1: `title`, `director`, `actor`, `genres[]`, `year`, `maxRuntime`, `excludedGenres[]`. `moods` is echoed in the filter panel but not enforced in the DB query.
- A2UI messages travel as AG-UI `CUSTOM` events with `name: "a2ui"` and `value` = the message object. They do not appear in `TOOL_CALL_RESULT` content shipped back to the LLM (stripped before persistence).
- Unknown component names are non-fatal: renderer no-ops, console.warn, no UI crash.
- `createSurface` is idempotent for an existing `surfaceId`: catalog snapshot may refresh; current data model is preserved unless explicitly cleared.
- `review-form` continues to render via the existing tagged-union path; it is **not** migrated.
- `DEMO_MODE_SLEEP` defaults unset; with it set (e.g., `700`) frames space out for visible staging.

**Visual Design**: see `prd.md` § Visual (LY3 user-mode sketch + A2UI message-shape example for discovery) and `uf1-progressive-movie-discovery.md` § Specification.

---

## 2. Architecture

Legend: 🟢 new file · 🟡 modified file · ⚪ reused as-is.

### A. Database (`packages/db/`)

**A1.** `repositories/movies.ts` 🟡 — extend `searchStructured` to accept `genres?: string[]` and `excludedGenres?: string[]` (instead of single `genre` string), and `maxRuntime?: number`. Existing single-string `genre` parameter can either be removed (preferred — only consumer is the soon-to-be-internal `searchMoviesData`) or coerced into `genres: [genre]`. No `findByIds` needed for UF1 (UF2 will add it for comparison/night-plan reuse).

  **Why**: discovery needs to enforce `genres`, `maxRuntime`, `excludedGenres` from the LLM-extracted filters; the current single-string `genre` cannot express multi-genre intent or exclusions.

### B. Contracts (`packages/contracts/`)

**B1.** `a2ui/protocol.ts` 🟢 — Zod schemas for the A2UI v0.9 wire format:
- `componentNodeSchema` — `{ id: string, component: string, children?: string[], data?: { path: string }, [propKey]: unknown }`
- `a2uiCreateSurfaceSchema` — `{ createSurface: { surfaceId, catalogId } }`
- `a2uiUpdateComponentsSchema` — `{ updateComponents: { surfaceId, components: ComponentNode[] } }`
- `a2uiUpdateDataModelSchema` — `{ updateDataModel: { surfaceId, path: string, value: unknown } }`
- `a2uiDeleteSurfaceSchema` — `{ deleteSurface: { surfaceId } }`
- `a2uiMessageSchema` — discriminated union of the four
- builders: `createSurface()`, `updateComponents()`, `updateDataModel()`, `deleteSurface()`

**B2.** `a2ui/catalog.ts` 🟢 — `videoclubCatalog` constant + `catalogId = "videoclub"`. UF1 components only:
- `Column` (composition primitive: `children: string[]`)
- `MovieFilterPanel` (data path → `{ genres?, maxRuntime?, excludedGenres?, moods? }`)
- `MovieGrid` (data path → `MovieDto[]`)
- `WatchlistGrid` (data path → `{ items: MovieDto[], message?: string, error?: string, state?: "loading" | "empty" | "error" }`)
- `ReviewsGrid` (data path → `{ items: ReviewWithMovieDto[], ...same state shape }`)
- `Skeleton` (no data; prop `variant: "movie-grid" | "row"`)
- *UF2 adds `MovieComparisonTable`, `MovieNightPlan`. Define them as catalog placeholders here with empty descriptions or omit until UF2 — pick the latter to keep this plan tight.*

  **Why**: catalog declares what the LLM is allowed to emit and what the renderer knows to draw. Locking UF1 components only prevents premature scope creep into UF2/UF4 widgets.

**B3.** `a2ui/index.ts` 🟡 — re-export `protocol` and `catalog`. Keep existing `watchlist-grid`, `reviews-grid`, `review-form` exports — those remain the **tool return-shape** contracts where useful, but watchlist/reviews shapes are now consumed primarily as `a2uiMessages` builders' input types.

### C. API agent + tools (`apps/api/src/`)

**C1.** `services/agents/a2ui-emitter.ts` 🟢 — pure functions returning ordered `A2UIMessage[]`:
- `discoverySurfaceMessages({ surfaceId, filters?, movies? })` → 5 messages: `createSurface(discovery, videoclub)`, `updateComponents` (Column → MovieFilterPanel + Skeleton grid), `updateDataModel /filters`, `updateComponents` (Column → MovieFilterPanel + real MovieGrid), `updateDataModel /movies`. If `filters` absent, drop the filter `updateDataModel`. If `movies` empty, leave `/movies = []` (renderer shows empty state).
- `watchlistGridMessages({ surfaceId, items, message?, error? })` → 3 messages: `createSurface`, `updateComponents` (Column → WatchlistGrid bound to `/state`), `updateDataModel /state`.
- `reviewsGridMessages({ surfaceId, items, message?, error? })` → same pattern as watchlist.

  **Why**: keeping emission in pure functions lets us unit-test the ordered message sequence without spinning up the SSE stream. Tools return the array as `a2uiMessages`; `ag-ui-stream` translates each into a `CUSTOM` event.

**C2.** `services/agents/ag-ui-stream.ts` 🟡 — additions:
- On `tool-result` parts whose `output` carries `a2uiMessages: A2UIMessage[]`: for each message, optionally `await sleep(Number(process.env.DEMO_MODE_SLEEP) || 0)` then emit `CUSTOM { name: "a2ui", value: msg }`. Emission order matches array order.
- Strip `a2uiMessages` from the output before serializing it into `TOOL_CALL_RESULT.content` so later LLM turns do not see the wire-format noise. Keep `data` (or whatever the tool's structured payload is named) as the visible result.
- No other UF1 changes here — `STATE_*`, `STEP_*`, `RUN_FINISHED.outcome` belong to UF3/UF4/UF5.

  **Why**: this is the single translation point between AI-SDK tool outputs and the AG-UI wire. Doing the strip here (instead of in each tool) keeps tool authors free to return one object that serves both the wire and the LLM history.

**C3.** `features/tools/discovery.ts` 🟢 — top-level LLM-facing tool. Input shape:
```ts
z.object({
  filters: z.object({
    title: z.string().optional(),
    director: z.string().optional(),
    actor: z.string().optional(),
    genres: z.array(z.string()).optional(),
    year: z.number().optional(),
    maxRuntime: z.number().optional(),
    excludedGenres: z.array(z.string()).optional(),
    moods: z.array(z.string()).optional(),
  }).optional(),
  view: z.string().default("grid"),
})
```
Execute:
1. If `view !== "grid"` → log + emit a `warning` flag in the returned `warnings[]` (consumed in C2 to emit `CUSTOM { name: "warning" }` in a follow-up phase; for UF1 just fall back silently to grid).
2. Call `searchMoviesData(db, filters)` → `MovieDto[]`.
3. Return `{ data: { movies, filters }, a2uiMessages: discoverySurfaceMessages({ surfaceId: "discovery", filters, movies }) }`.

`needsApproval: false`. Description string includes `getCatalogPromptDescription()` so the LLM grounds its emitted layouts in the catalog. `surfaceId` is a constant `"discovery"` for UF1 (one in-flight discovery surface per chat).

  **Why**: the LLM should see one tool for movie discovery. Hiding `search_movies` and adding `view` (even if UF1 only honors `"grid"`) lets UF2 land without a second tool-registry change.

**C4.** `features/tools/search-movies.ts` 🟡 — convert to internal helper. Export `searchMoviesData(db, filters): Promise<MovieDto[]>`. **Do not** export an `ai`-SDK `tool()` from this file. Remove from orchestrator registry.

**C5.** `features/tools/watchlist-show.ts` 🟡 — return shape becomes:
```ts
{
  data: { items, count, message?, error? },
  a2uiMessages: watchlistGridMessages({
    surfaceId: "watchlist",
    items, message, error,
  }),
}
```
The internal `data` shape can match what tests already assert; only the wire-format is new. Empty/error encoded as `updateDataModel /state` value `"empty" | "error"` plus the items array (renderer prefers `state` when set).

**C6.** `features/tools/review-show.ts` 🟡 — same pattern as C5, surfaceId `"reviews"`.

**C7.** `services/agents/orchestrator.ts` 🟡 — replace `search_movies` registration with `discovery`. Update the system prompt: agent uses `discovery` for any movie-discovery query (the description on the tool already lists the catalog and what `view` means; here the prompt just nudges agents to call it instead of `search_tmdb` first). No memory injection in UF1.

### D. Web client (`apps/web/src/`)

**D1.** `lib/a2ui/json-pointer.ts` 🟢 — ~30-line `get(state, path)` / `set(state, path, value)` for `/foo/bar` paths. Empty string `""` → root. Missing intermediate keys created on `set`. Returns new objects (immutable). No external dep.

**D2.** `lib/a2ui/store.ts` 🟢 — per-surface state machine.
- Internal state: `Record<surfaceId, { catalogId: string, components: Record<id, ComponentNode>, dataModel: unknown }>`.
- `applyMessage(state, msg)`:
  - `createSurface` → if surface absent, init empty. If present, refresh `catalogId` only — preserve `components` and `dataModel`.
  - `updateComponents` → upsert each by `id` into `components`; do not delete unreferenced ids.
  - `updateDataModel` → `dataModel = jsonPointer.set(dataModel, path, value)`.
  - `deleteSurface` → drop the surface key.
  - Unknown shape → no-op + `console.warn`.
- Exposes hooks: `useA2UISurface(surfaceId)` returns `{ catalogId, rootId: "root", components, dataModel } | undefined`. Subscribers notified when the surface changes (use Zustand-style or a simple `useSyncExternalStore` — pick whichever already exists in the codebase; if none, plain `useSyncExternalStore`).

**D3.** `lib/a2ui/catalog.ts` 🟢 — client-side `Record<componentName, RendererComponent>` mapping component name → React component. Renderer signature: `({ node, surfaceId }: { node: ComponentNode; surfaceId: string }) => ReactNode`. Unknown name → `null` + `console.warn` + (UF5 will also push to inspector log; UF1 just warns).

**D4.** `lib/a2ui/renderers/column.tsx` 🟢 — iterates `node.children: string[]`, looks each child id up in the surface's `components`, recurses via the catalog.

**D5.** `lib/a2ui/renderers/skeleton.tsx` 🟢 — variant `"movie-grid"` renders a 5-card placeholder grid using shadcn `Skeleton`; `"row"` renders a single row placeholder. Other variants → default to movie-grid.

**D6.** `lib/a2ui/renderers/movie-filter-panel.tsx` 🟢 — reads filters from `node.data.path` (e.g., `/filters`). Resolves via `jsonPointer.get(surface.dataModel, node.data.path)`. Renders chips: `genres[]`, `maxRuntime` (`"≤ {n} min"`), `excludedGenres[]` (`"no {g}"`), `moods[]`. Empty filters → empty panel (no chips). No `region` field.

**D7.** `lib/a2ui/renderers/movie-grid.tsx` 🟢 — reads `MovieDto[]` from `node.data.path`. Reuses existing `MovieCard` ⚪. Empty array → existing empty-state UI from current movie-grid path. Layout matches today's `movie-search.tsx` grid.

**D8.** `lib/a2ui/renderers/watchlist-grid.tsx` 🟡 — refactor to read from bound path (`node.data.path` resolved via the store), preserving its current visuals (count title, MovieCard grid, error/empty states). Must work with the existing `WatchlistContext` / overlay logic untouched.

**D9.** `lib/a2ui/renderers/reviews-grid.tsx` 🟡 — same as D8, surfaceId `"reviews"`. Preserves the star-rating + excerpt + date layout.

**D10.** `lib/a2ui/renderers/review-form.tsx` ⚪ — unchanged; tagged-union path retained.

**D11.** `lib/a2ui/registry.tsx` 🟡 — two paths:
- Tagged-union (`review-form` only): existing `surface.type` switch dispatch.
- Protocol surfaces (`watchlist-grid`, `reviews-grid`, the new `discovery`): new top-level `<A2UIRenderer surfaceId="..."/>` component reads the surface from the store, looks up `components["root"]`, renders it via the client catalog (D3).

  **Why**: keeping the tagged-union dispatch alive for `review-form` honors the locked decision to keep that surface as the JSON-maison baseline; the new path coexists rather than replaces.

**D12.** `hooks/use-agent-chat.ts` 🟡 — subscribe to `onCustomEvent`: when `event.name === "a2ui"`, parse `event.value` against `a2uiMessageSchema` and call `a2uiStore.applyMessage(value)`. Other CUSTOM names ignored in UF1 (warnings/memory-applied land in UF3/UF5). No other changes.

**D13.** `components/movie-search.tsx` 🟡 — drop the `setMovies()` projection path for `search_movies` / `search_tmdb` array results. Render the discovery surface via `<A2UIRenderer surfaceId="discovery"/>`. The watchlist/reviews surfaces also render via `<A2UIRenderer surfaceId="watchlist"/>` / `<A2UIRenderer surfaceId="reviews"/>` when active. The clarification picker UI and review-form modal are untouched. `ChatResultsContext.movies` slot can stay (used by other paths still alive for now) — UF1 just stops writing to it from search-tool projection.

  **Note for the implementer**: `search_tmdb` still returns a movies array. UF1 keeps it on the legacy `setMovies()` path until UF4 brings TMDB into the protocol — *or* the implementer can wrap its results into `discoverySurfaceMessages` immediately. Pick the second path if cheap; otherwise leave it for a follow-up.

### E. Environment

**E1.** `apps/api/.env.example` 🟡 — add `DEMO_MODE_SLEEP=` (default unset/empty). Code reads `process.env.DEMO_MODE_SLEEP` directly (no env-loader file).

### F. Dependencies

No new dependencies for UF1. JSON Pointer is rolled in-house (D1). `fast-json-patch` is UF3.

---

## 3. Test List

Tests for added behavior only. Skip framework / Drizzle / AI-SDK / `@ag-ui/*` internals.

### Unit (Vitest)

**A2UI emitter** — `apps/api/src/services/agents/a2ui-emitter.test.ts` 🟢
1. **`discoverySurfaceMessages` orders frames** — given `{ filters: { genres: ["Comedy"], maxRuntime: 120 }, movies: [m1, m2] }`, returns: `[createSurface, updateComponents (skeleton), updateDataModel /filters, updateComponents (real grid), updateDataModel /movies]` in that exact order
2. **No `filters` arg** — emits 4 messages (drops the `/filters` `updateDataModel`); skeleton frame still present
3. **Empty `movies` array** — still emits the final `updateDataModel /movies` with `value: []`; renderer is responsible for empty state
4. **`watchlistGridMessages` emits 3 messages** — `createSurface(watchlist) → updateComponents (Column → WatchlistGrid bound to /state) → updateDataModel /state` with `{ items, message?, error?, state? }`
5. **`reviewsGridMessages` emits 3 messages** — same shape as watchlist for surfaceId `"reviews"`
6. **State encoding** — when `error` is set, the `/state` `updateDataModel` value carries `state: "error"` and the error message; when `items` is empty and no error, `state: "empty"`

**Discovery tool** — `apps/api/src/features/tools/discovery.test.ts` 🟢
7. **`view: "grid"` happy path** — calls `searchMoviesData` with the parsed filters; returns `{ data: { movies, filters }, a2uiMessages: [...5 frames] }`
8. **`maxRuntime` and `excludedGenres` reach the DB query** — assert via spy on `moviesRepository.searchStructured` that those fields are forwarded
9. **`moods` is echoed but not in DB call** — `searchStructured` receives no `moods`; the message at `updateDataModel /filters` does include `moods`
10. **Invalid `view: "carousel"`** — falls back to grid frames (UF1 does not yet emit `CUSTOM { name: "warning" }`; assert the returned `a2uiMessages` are still grid-shaped and `data.warnings` lists `{ code: "invalid-view" }`)
11. **Description string contains catalog component names** — sanity check on prompt grounding (`Column`, `MovieFilterPanel`, `MovieGrid`, `Skeleton` all appear in the tool's description)

**ag-ui-stream** — `apps/api/src/services/agents/ag-ui-stream.test.ts` 🟡 *(extend existing)*
12. **Emits one `CUSTOM { name: "a2ui" }` per A2UI message in order** — given a `tool-result` whose `output.a2uiMessages` has 5 entries, the SSE stream contains 5 CUSTOM events with `value` matching each entry, all preceding the `TOOL_CALL_RESULT`
13. **`DEMO_MODE_SLEEP=100` inserts ≥100ms gap** — measure `Date.now()` between consecutive CUSTOM emissions; assert `>= 100` ms; test resets env after
14. **`a2uiMessages` is stripped from `TOOL_CALL_RESULT.content`** — parsed content has `data` but no `a2uiMessages` key
15. **No CUSTOM emitted when `a2uiMessages` absent** — backwards-compat for tools that don't yet return them (e.g., `search_tmdb`)

**JSON pointer** — `apps/web/src/lib/a2ui/json-pointer.test.ts` 🟢
16. **`get(state, "/movies")`** — returns nested array from `{ movies: [...] }`
17. **`get(state, "")`** — returns root
18. **`get(state, "/missing/path")`** — returns `undefined`, no throw
19. **`set(state, "/filters/genres", value)`** — returns a new object; original unchanged; nested object also new
20. **`set` creates missing intermediate keys** — `set({}, "/a/b/c", 1)` yields `{ a: { b: { c: 1 } } }`

**A2UI store** — `apps/web/src/lib/a2ui/store.test.ts` 🟢
21. **`createSurface` initializes empty surface** — for a new `surfaceId`, state has `{ catalogId, components: {}, dataModel: {} }`
22. **`createSurface` is idempotent for an existing surfaceId** — components and dataModel preserved; `catalogId` may refresh
23. **`updateComponents` upserts by id** — re-applying with the same id replaces the node; unreferenced ids retained
24. **`updateDataModel /movies`** — writes via JSON pointer; subscriber for that surface fires
25. **Unknown component name does not throw** — `updateComponents` containing `component: "FooBar"` applies into store; the catalog renderer (separate concern) handles the fallback
26. **`deleteSurface` removes the entry** — subsequent `useA2UISurface` returns `undefined`

### Component (React Testing Library)

**A2UIRenderer (protocol path)** — `apps/web/src/lib/a2ui/registry.test.tsx` 🟡 *(extend existing)*
27. **Recorded `view: "grid"` sequence** — feed the 5 messages from `discoverySurfaceMessages` into the store; render `<A2UIRenderer surfaceId="discovery"/>`; first paints `Skeleton`, then after `updateComponents` swap paints `MovieGrid` with two cards
28. **Filter chips appear** — after `updateDataModel /filters` with `{ genres: ["Comedy"], maxRuntime: 120 }`, `MovieFilterPanel` shows "Comedy" chip and "≤ 120 min" chip
29. **Tagged-union `review-form` path still renders** — passing a `surface.type === "review-form"` object renders the existing form (regression)
30. **Unknown component name** — store contains a node with `component: "Unknown"`; renderer outputs nothing for that node, sibling nodes still render, `console.warn` called once

**MovieFilterPanel renderer** — `apps/web/src/lib/a2ui/renderers/movie-filter-panel.test.tsx` 🟢
31. **Empty filters** — no chips rendered
32. **All filter fields populated** — chips for each `genres` entry, one for `maxRuntime`, one per `excludedGenres`, one per `moods`
33. **No `region` field** — even if data contains a `region` key (defensive), no chip is rendered

**MovieGrid renderer** — `apps/web/src/lib/a2ui/renderers/movie-grid.test.tsx` 🟢
34. **Renders one MovieCard per movie** — given `MovieDto[]` of length 3, three cards present
35. **Empty movies** — empty-state UI shown (text or placeholder); no `Skeleton`

**WatchlistGrid (refactored)** — `apps/web/src/lib/a2ui/renderers/watchlist-grid.test.tsx` 🟡 *(extend existing)*
36. **Reads items from bound path** — node `data: { path: "/state" }` + dataModel `{ items: [...], state: "ok" }` → grid renders the items
37. **Empty state** — `state: "empty"` renders the existing empty-state component
38. **Error state** — `state: "error"` renders the error message

**ReviewsGrid (refactored)** — `apps/web/src/lib/a2ui/renderers/reviews-grid.test.tsx` 🟡 *(extend existing)*
39. **Reads items from bound path** — same shape as D8; star rating + excerpt + date all visible
40. **Empty/error states** — same as watchlist

### Integration (Vitest, no Testcontainers needed for UF1)

**Discovery → SSE → store flow** — `apps/api/src/services/agents/discovery-flow.test.ts` 🟢 *(or co-locate in `ag-ui-stream.test.ts`)*
41. **End-to-end emission** — driving the orchestrator with a stub `streamText` that yields one tool-call to `discovery` and the tool-result with `a2uiMessages`; the SSE bytes parse into the expected ordered AG-UI events: `RUN_STARTED`, `TOOL_CALL_START`, `TOOL_CALL_ARGS`, `TOOL_CALL_END`, 5× `CUSTOM { name: "a2ui" }`, `TOOL_CALL_RESULT`, `RUN_FINISHED`

### Verify gate (UF1)

Manual + automated:
- `pnpm typecheck` green
- `pnpm lint` green
- `pnpm test` green across `@repo/contracts`, `@repo/db`, `@repo/api`, `@repo/web`
- Live in-browser: type "feel-good comedy under 2h" → 3+ visible frames (with `DEMO_MODE_SLEEP=700` set in `apps/api/.env`); without env, frames flush at network speed
- Live: open watchlist → A2UI messages visible in network trace; visual parity with current behavior
- Live: open reviews → same parity
- Live: review-form path still works (open via `review_add`)

*(No golden-trace runner in UF1; that's bootstrapped in UF5 / Phase 5 of the macro plan. UF1 may opt-in by manual SSE capture into `apps/api/tests/__goldens__/uf1-discovery.json` if convenient — not a verify-gate requirement.)*

---

## 4. To Do List

Tasks ordered by build dependency. Each bullet is a commit-sized unit. Verify gate at the end of each phase must pass before moving on.

### Phase 0 — UF1 prerequisites (~½ day)

- [ ] **Extend `searchStructured` filters** — `packages/db/src/repositories/movies.ts`
  - Replace single `genre: string` with `genres?: string[]` (AND-by-overlap or first-match-wins, pick whatever is simpler — `arrayIlike` already supports the column type)
  - Add `excludedGenres?: string[]` (NOT-overlap)
  - Add `maxRuntime?: number` (`runtime <= maxRuntime`)
  - Update existing `searchStructured` test to cover the three new fields

- [ ] **A2UI protocol contracts** — `packages/contracts/src/a2ui/protocol.ts` 🟢
  - Zod schemas + builders per §2 B1
  - Barrel re-export from `packages/contracts/src/a2ui/index.ts`

- [ ] **A2UI catalog contract** — `packages/contracts/src/a2ui/catalog.ts` 🟢
  - `videoclubCatalog` with UF1 components only (`Column`, `MovieFilterPanel`, `MovieGrid`, `WatchlistGrid`, `ReviewsGrid`, `Skeleton`)
  - Helper `getCatalogPromptDescription()` returning a stable string for tool descriptions
  - Barrel re-export

- [ ] **Add `DEMO_MODE_SLEEP` to env example** — `apps/api/.env.example`

- [ ] **Verify Phase 0**: `pnpm typecheck` green; `pnpm --filter @repo/db test` and `pnpm --filter @repo/contracts test` green.

### Phase 1 — Server emission (~½ day)

- [ ] **A2UI emitter (server)** — `apps/api/src/services/agents/a2ui-emitter.ts` 🟢
  - `discoverySurfaceMessages`, `watchlistGridMessages`, `reviewsGridMessages`
  - Tests per §3 (1)–(6)

- [ ] **`CUSTOM:a2ui` emission + `DEMO_MODE_SLEEP` + content strip** — `apps/api/src/services/agents/ag-ui-stream.ts` 🟡
  - On `tool-result`: read `output.a2uiMessages`; emit per-message CUSTOM events; sleep between if env set; strip `a2uiMessages` from `TOOL_CALL_RESULT.content`
  - Tests per §3 (12)–(15)

- [ ] **Discovery tool** — `apps/api/src/features/tools/discovery.ts` 🟢
  - Input shape per §2 C3; calls `searchMoviesData`
  - Returns `{ data, a2uiMessages }`
  - Description includes catalog summary
  - Tests per §3 (7)–(11)

- [ ] **Retire `search_movies` to internal helper** — `apps/api/src/features/tools/search-movies.ts` 🟡
  - Export `searchMoviesData(db, filters)`; remove `tool()` factory export
  - Update existing tests to call the helper directly (or delete tests redundant with `discovery.test.ts`)

- [ ] **Refactor `watchlist_show`** — `apps/api/src/features/tools/watchlist-show.ts` 🟡
  - Return `{ data, a2uiMessages: watchlistGridMessages(...) }`
  - Update existing test

- [ ] **Refactor `review_show`** — `apps/api/src/features/tools/review-show.ts` 🟡
  - Same pattern; surfaceId `"reviews"`
  - Update existing test

- [ ] **Wire `discovery` in orchestrator; drop `search_movies`** — `apps/api/src/services/agents/orchestrator.ts` 🟡
  - Replace `search_movies` registration with `discovery`
  - Update system prompt to reference `discovery` for movie-discovery flows

- [ ] **Verify Phase 1**: `pnpm --filter @repo/api test` green; `pnpm --filter @repo/api dev`, send a discovery query, observe `CUSTOM` events in the SSE response (curl or browser network tab).

### Phase 2 — Client store + protocol renderers (~½ day)

- [ ] **JSON Pointer helper** — `apps/web/src/lib/a2ui/json-pointer.ts` 🟢 + tests per §3 (16)–(20)

- [ ] **A2UI store + `useA2UISurface` hook** — `apps/web/src/lib/a2ui/store.ts` 🟢 + tests per §3 (21)–(26)

- [ ] **Client catalog map** — `apps/web/src/lib/a2ui/catalog.ts` 🟢
  - Maps name → renderer component; unknown → null + warn

- [ ] **`Column` and `Skeleton` renderers** — `apps/web/src/lib/a2ui/renderers/{column,skeleton}.tsx` 🟢

- [ ] **`MovieFilterPanel` renderer** — `apps/web/src/lib/a2ui/renderers/movie-filter-panel.tsx` 🟢 + tests per §3 (31)–(33)

- [ ] **`MovieGrid` renderer (reuses `MovieCard`)** — `apps/web/src/lib/a2ui/renderers/movie-grid.tsx` 🟢 + tests per §3 (34)–(35)

- [ ] **Verify Phase 2**: `pnpm --filter @repo/web test` green for new renderers and store.

### Phase 3 — Wire-up + grids migration (~½ day)

- [ ] **Refactor `WatchlistGrid` to read from bound path** — `apps/web/src/lib/a2ui/renderers/watchlist-grid.tsx` 🟡 + tests per §3 (36)–(38)

- [ ] **Refactor `ReviewsGrid` to read from bound path** — `apps/web/src/lib/a2ui/renderers/reviews-grid.tsx` 🟡 + tests per §3 (39)–(40)

- [ ] **Refactor `A2UIRenderer` to dispatch tagged-union (review-form) vs protocol (everything else)** — `apps/web/src/lib/a2ui/registry.tsx` 🟡 + tests per §3 (27)–(30)

- [ ] **Hook `useAgentChat` to route `onCustomEvent` `a2ui` → store** — `apps/web/src/hooks/use-agent-chat.ts` 🟡

- [ ] **Replace `setMovies()` projection with `<A2UIRenderer surfaceId="discovery"/>`** — `apps/web/src/components/movie-search.tsx` 🟡
  - Watchlist surface → `<A2UIRenderer surfaceId="watchlist"/>`; reviews surface → `<A2UIRenderer surfaceId="reviews"/>`
  - `search_tmdb` projection: keep on legacy `setMovies()` for now (UF1 punt) OR wrap into discovery messages (preferred if cheap)
  - Update `movie-search.test.tsx`

- [ ] **Verify Phase 3**: full app live test — type "feel-good comedy under 2h" with `DEMO_MODE_SLEEP=700` → 3+ visible frames; open watchlist → grid appears via A2UI messages (network tab confirms `CUSTOM:a2ui` events); open reviews → same; trigger `review_add` → existing review form modal still works.

### Phase 4 — Polish + verify gate (~¼ day)

- [ ] **Smoke test the cross-phase fallback** — confirm that if reviews-grid migration breaks, reverting that one renderer keeps the app live (per macro plan's Phase 1 fallback)
- [ ] **`pnpm typecheck && pnpm lint && pnpm test`** all green
- [ ] **`pnpm depcruise`** green (no boundary violations)
- [ ] **Visual regression check** — side-by-side compare watchlist + reviews grids against `main`; flag any pixel-level drift
- [ ] **Update `context.md`** — note that UF1 has shipped; record any new in-flight code state if relevant

### Cross-phase fallback (pre-agreed in macro plan)

If Phase 3 budget slips, drop reviews-grid migration: keep watchlist + discovery on the protocol, leave reviews-grid on tagged-union dispatch. UF1 still passes its primary acceptance (discovery is on A2UI; one of the two existing grids is migrated).

---

## 5. Context: Current System Architecture

### Agent stack

`@ag-ui/core`, `@ag-ui/encoder`, `@ag-ui/client` are wired end-to-end. The chat route runs `runOrchestrator` and pipes `streamText`'s `fullStream` through `streamAgUiEvents`, which encodes events using `EventEncoder`. The web client subscribes via `HttpAgent` from `@ag-ui/client`.

- **Current behavior**: tool returns object → orchestrator emits `RUN_STARTED`, optional `TEXT_MESSAGE_*`, `TOOL_CALL_START` / `TOOL_CALL_ARGS` / `TOOL_CALL_END`, `TOOL_CALL_RESULT` (full JSON-stringified output), `RUN_FINISHED`. One AG-UI run = one big tool result + one final paint.
- **Current limitations (UF1-relevant)**: no `CUSTOM` events on the wire; no progressive emission; no sleep-between-frames; tool results travel as a single blob.

### A2UI implementation (current)

Tagged-union pattern. Tools that drive surfaces return `{ type: "watchlist-grid" | "review-form" | "reviews-grid", ...data }`. `MovieSearch` watches `toolResults`, picks the right surface object, projects it into a single React state slot (`a2uiSurface` on `ChatResultsContext`); `<A2UIRenderer>` dispatches by `surface.type` to one of three typed renderers. Movie discovery results bypass the registry — `search_movies` returns `MovieDto[]` and `MovieSearch` projects the array into a separate `movies` slot rendered as a static grid.

- **Current behavior**: one tool return → one re-render.
- **Current limitations (UF1-relevant)**: no protocol messages on the wire; no structure-vs-data separation; movie-discovery surface lives entirely outside the A2UI registry.

### Orchestrator + tools (current)

`runOrchestrator` creates/resumes a session, persists the user message, runs `streamText` with 8 tools (`search_movies`, `search_tmdb`, `watchlist_show`, `watchlist_add`, `watchlist_remove`, `review_add`, `review_show`, `review_delete`). `onFinish` persists tool calls + assistant message. System prompt is static. `runApprovedTool` exists for `search_tmdb` HITL — out of scope for UF1.

### DB stack (current — relevant to UF1)

- `movies` table: `id`, `tmdbId`, `title`, `year`, `synopsis`, `genres text[]`, `cast text[]`, `directors text[]`, `runtime`, `language`, `posterUrl`, `backdropUrl`, `popularity`, `releaseDate`.
- `moviesRepository.searchStructured(params)` accepts `title`, `director`, `actor`, `genre` (single string), `year`. Uses `arrayIlike` helper for `genres`, `cast`, `directors`. Limit 10. **No `genres[]`, `excludedGenres`, `maxRuntime`, `findByIds`** — UF1 adds the first three.

### Web app (current)

- `MovieSearch` is the chat surface. It reads `toolResults` from `useAgentChat()` and projects each into one of: `setMovies()`, `setA2UISurface()`, `setClarification()`. Watchlist/review overlays driven by `WatchlistContext` + `ReviewContext`.
- `useAgentChat` subscribes via `HttpAgent.subscribe({ onTextMessageContentEvent, onToolCallEndEvent, onToolCallResultEvent, onRunFinishedEvent, onRunErrorEvent })`. **`onCustomEvent` is not subscribed** — UF1 adds it.
- `ChatResultsContext` holds three mutually-exclusive slots: `movies | a2uiSurface | clarification`.

### Key files (UF1-touched)

| File | Purpose | UF1 action |
|------|---------|------------|
| `apps/api/src/services/agents/orchestrator.ts` | Session, tool registry, system prompt | Replace `search_movies` → `discovery` |
| `apps/api/src/services/agents/ag-ui-stream.ts` | AI-SDK stream → AG-UI events | Add `CUSTOM:a2ui` emission + sleep + content strip |
| `apps/api/src/features/tools/search-movies.ts` | Local DB search returning `MovieDto[]` | Demote to internal helper `searchMoviesData` |
| `apps/api/src/features/tools/watchlist-show.ts` | Tagged-union `watchlist-grid` | Add `a2uiMessages` to return |
| `apps/api/src/features/tools/review-show.ts` | Tagged-union `reviews-grid` | Add `a2uiMessages` to return |
| `packages/db/src/repositories/movies.ts` | `searchStructured`, `searchByTitle`, `findById`, `upsertFromTmdb` | Extend filters: `genres[]`, `maxRuntime`, `excludedGenres[]` |
| `packages/contracts/src/a2ui/index.ts` | Tagged-union schema barrel | Add `protocol`, `catalog` re-exports |
| `apps/web/src/hooks/use-agent-chat.ts` | Subscribe to AG-UI events | Add `onCustomEvent` → A2UI store |
| `apps/web/src/lib/a2ui/registry.tsx` | Tagged-union dispatch by `surface.type` | Bifurcate: tagged-union for `review-form`, protocol for the rest |
| `apps/web/src/lib/a2ui/renderers/watchlist-grid.tsx` | Typed `data` prop renderer | Read from bound path via store |
| `apps/web/src/lib/a2ui/renderers/reviews-grid.tsx` | Typed `data` prop renderer | Read from bound path via store |
| `apps/web/src/lib/a2ui/renderers/review-form.tsx` | Typed `data` prop renderer | **Unchanged** (kept tagged-union) |
| `apps/web/src/components/movie-search.tsx` | Main UI; projects tool results into context | Replace `setMovies()` projection with `<A2UIRenderer surfaceId="discovery"/>` |
| `apps/web/src/contexts/chat-results-context.tsx` | `movies / a2uiSurface / clarification` | Read-only for UF1 (writes from search-tool projection removed) |

---

## 6. Reference Implementations

Existing patterns to follow when implementing each UF1 element. ⚪ marks files to read but not modify; 🟡/🟢 mark targets that follow these patterns.

### Drizzle repository extensions
- **Repository factory shape** → `packages/db/src/repositories/watchlist.ts` ⚪ (function returning method bag with `db`-scoped closures)
- **Multi-field structured search using `and(...)` + `arrayIlike` helper** → existing `moviesRepository.searchStructured` in `packages/db/src/repositories/movies.ts:18-88` ⚪ (extend in place)
- **`releaseDate` ordering / `desc(popularity)`** — already present in the same function; carry through

### AI-SDK tools
- **Tool with Zod input + structured output** → `apps/api/src/features/tools/search-movies.ts` ⚪ (becomes the internal helper; current shape is the reference for `discovery`)
- **Tool returning a tagged-union surface for the UI** → `apps/api/src/features/tools/watchlist-show.ts` ⚪ (refactor target — the `{ data, a2uiMessages }` shape replaces it)
- **Tool with optional `movieId` shortcut + clarification fallback** → `apps/api/src/features/tools/review-add.ts` ⚪ (inspiration for any future shortcut path on `discovery`; UF1 itself doesn't need it)
- **Description string referencing a list** → existing tools embed lists in description; mirror that style for the catalog summary in `discovery.ts`

### AG-UI server emission
- **`EventEncoder` usage + ordered yield of typed events** → `apps/api/src/services/agents/ag-ui-stream.ts:10-131` ⚪ (extend the `tool-result` branch around line 79)
- **AG-UI event type imports** — current file imports `EventType` from `@ag-ui/core`; add `EventType.CUSTOM` for the new emission

### AG-UI client subscription
- **Subscribe pattern with multiple typed handlers + accumulator refs + threadId binding** → `apps/web/src/hooks/use-agent-chat.ts:25-219` ⚪
- **`HttpAgent.subscribe({ onCustomEvent, ... })`** — `onCustomEvent` is part of the standard `@ag-ui/client` subscription interface; mirror existing handler style (no manual SSE parsing required)

### A2UI surface dispatch (current → target)
- **Tagged-union renderer registry** → `apps/web/src/lib/a2ui/registry.tsx:9-24` ⚪ (preserve the switch for `review-form`; add a top-level path that goes to the new protocol renderer)
- **Renderer with typed `data` prop reading nested fields** → `apps/web/src/lib/a2ui/renderers/watchlist-grid.tsx:11-37` ⚪ (refactor target — replace typed prop with bound-path resolution against the store)
- **Renderer composing `MovieCard` into a grid with overlay context** → same file ⚪ (carry `WatchlistContext` interaction unchanged)

### React contexts
- **Provider + `useFoo` hook with throw-if-outside-provider** → `apps/web/src/contexts/chat-results-context.tsx`, `watchlist-context.tsx`, `review-context.tsx` ⚪ (model only if a client-side store ends up needing a provider; the recommended `useSyncExternalStore` path skips this entirely for UF1)
- **Single source of truth for transient tool results** → `chat-results-context.tsx` ⚪ — UF1 keeps the file but stops writing to its `movies` slot from search-tool projection

### Component testing
- **RTL setup + render with provider wrappers** → `apps/web/src/components/review-form.test.tsx`, `apps/web/src/lib/a2ui/registry.test.tsx`, `apps/web/src/components/bookmark-icon.test.tsx` ⚪
- **Recorded message-sequence simulation** — no existing reference; the new `registry.test.tsx` cases for the protocol path (§3 27–30) are the first

### Server unit testing
- **`streamAgUiEvents` test setup** → `apps/api/src/services/agents/ag-ui-stream.test.ts` ⚪ (extend with the new CUSTOM-emission cases)
- **Tool unit tests (mock `db` + spy on repository)** → `apps/api/src/features/tools/watchlist-show.test.ts`, `review-show.test.ts`, `search-tmdb.test.ts` ⚪

### MovieCard reuse
- **`MovieCard` with overlays** → `apps/web/src/components/movie-card.tsx:10-42` ⚪ — the new `MovieGrid` renderer composes `MovieCard` exactly as `WatchlistGrid` already does. `BookmarkIcon` and `ReviewIcon` overlays continue to work because they consume their own contexts (`WatchlistContext`, `ReviewContext`) — no plumbing change required.

### Style + conventions
- **Feature folder structure** → `apps/api/src/features/<name>/{route,*.ts}` (existing `chat/`, `watchlist/`, `reviews/`, `movies/`)
- **Barrel re-exports** → `packages/contracts/src/{a2ui,domain,http}/index.ts` and root `index.ts`
- **Test colocation** → `*.test.ts(x)` next to source

---

## 7. Notes

- **A2UI v0.9 has no upstream client library.** The protocol is implemented in this repo as a custom layer carried inside AG-UI's `CUSTOM` event channel. Don't search npm for `a2ui`.
- **`review-form` stays tagged-union.** This is locked in `prd.md` § Locked design decisions. Keep the tagged-union path in `registry.tsx` alive for it.
- **`DEMO_MODE_SLEEP` defaults unset.** With it unset, frames flush at network speed; no behavior regression vs today. With it set (e.g., `700`), staging becomes visible — recommended during rehearsal only.
- **Token cost.** The catalog summary in `discovery`'s description is small in UF1 (6 components, ~150–200 tokens). UF2/UF4 grow it to 8.
- **search_tmdb projection.** UF1 leaves `search_tmdb` results on the legacy `setMovies()` projection by default. Wrapping it into `discoverySurfaceMessages` is a cheap stretch — apply only if Phase 3 has time.

---

## Unresolved questions

*(none at time of writing — all UF1-scoped questions resolved during plan grilling. If the implementer hits a snag, the macro plan's § "Resolved questions" probably has the answer.)*
