# Implementation Plan: TMDB Fetching Strategy

## 1. Feature Description

**Objective**: Expand the movie catalog beyond the initial 200-movie seed by (1) adding configurable multi-source seeding, (2) a live `search_tmdb` agent tool, and (3) an AG-UI streaming protocol so the user can approve TMDB searches before they execute.

**Key Capabilities**:
- **CAN** seed movies from multiple TMDB sources (popular, top_rated, trending, now_playing, upcoming) via a config file
- **CAN** search TMDB live through the AI agent when local results are insufficient
- **CAN** stream agent responses to the frontend via AG-UI SSE events
- **CAN** show a confirmation button when the agent proposes a TMDB search — user decides whether to call the external API
- **CAN** upsert all TMDB results into the local DB with full details (credits, runtime, genres)
- **CANNOT** schedule automatic background syncs (manual seed only)
- **CANNOT** cache or proxy TMDB images (loaded from TMDB CDN)
- **CANNOT** resume interrupted streams (full AG-UI resumability out of scope)

**Business Rules**:
- Agent always searches local DB first via `search_movies`
- Agent proposes `search_tmdb` only when: 0 local results, results don't match intent, or user explicitly asks
- `search_tmdb` requires user confirmation via `needsApproval: true` (AI SDK) — never auto-executed
- TMDB results upserted by tmdbId — no duplicates
- Seed config validated before execution; invalid source types → error
- Pending confirmation invalidated when user sends a new message

---

## 2. Data Model

### No New Tables

All required DB tables already exist: `movies`, `agent_sessions`, `chat_messages`, `agent_runs`, `tool_calls`. No schema changes needed.

### New Config Schema (non-DB)

**File**: `packages/db/seed.config.json`

```json
{
  "sources": [
    { "type": "popular", "pages": 10 },
    { "type": "top_rated", "pages": 5 },
    { "type": "trending", "timeWindow": "week", "pages": 3 },
    { "type": "now_playing", "pages": 2 },
    { "type": "upcoming", "pages": 2 }
  ]
}
```

Validated with Zod schema at runtime:
- `type`: enum `popular | top_rated | trending | now_playing | upcoming`
- `pages`: positive integer
- `timeWindow`: optional, only for `trending` — `day | week`, defaults to `week`

### New Contract Types (non-DB)

AG-UI types are **not** added to `@repo/contracts` due to a Zod version conflict (`@ag-ui/core` depends on Zod 3, project uses Zod 4). Instead, AG-UI types are imported directly at the boundary — in the API route handler and in the frontend AG-UI client. See Architecture section for details.

---

## 3. Architecture

### Phase 1 — Configurable Seed (UF1)

#### A. `packages/tmdb-client/src/endpoints/top-rated-movies.ts` 🟢 NEW
**Purpose**: Fetch top-rated movies from TMDB

**Changes**:
- `getTopRatedMovies(client, page)` → `TmdbPaginatedResponse<TmdbMovie>`
- Calls `GET /movie/top_rated?page={page}`

**Reference**: ⚪ `packages/tmdb-client/src/endpoints/popular-movies.ts` — identical pattern, different endpoint

---

#### B. `packages/tmdb-client/src/endpoints/trending-movies.ts` 🟢 NEW
**Purpose**: Fetch trending movies

**Changes**:
- `getTrendingMovies(client, timeWindow, page)` → `TmdbPaginatedResponse<TmdbMovie>`
- `timeWindow`: `"day" | "week"`
- Calls `GET /trending/movie/{timeWindow}?page={page}`

---

#### C. `packages/tmdb-client/src/endpoints/now-playing-movies.ts` 🟢 NEW
**Purpose**: Fetch now-playing movies

**Changes**:
- `getNowPlayingMovies(client, page)` → `TmdbPaginatedResponse<TmdbMovie>`
- Calls `GET /movie/now_playing?page={page}`

---

#### D. `packages/tmdb-client/src/endpoints/upcoming-movies.ts` 🟢 NEW
**Purpose**: Fetch upcoming movies

**Changes**:
- `getUpcomingMovies(client, page)` → `TmdbPaginatedResponse<TmdbMovie>`
- Calls `GET /movie/upcoming?page={page}`

---

#### E0. `packages/tmdb-client/src/mappers.ts` 🟢 NEW
**Purpose**: Extract `mapTmdbToNewMovie()` from `packages/db/src/seed.ts` into the tmdb-client package

**Changes**:
- Move `mapTmdbToNewMovie(details: TmdbMovieDetails): NewMovie` here
- Import `NewMovie` type from `@repo/db` is not possible (circular dep) — instead, return a plain object matching the shape and let callers cast/type it
- Alternative: define a `TmdbMovieMapped` interface locally that matches the DB insert shape, keep the mapper pure

**Why**: `mapTmdbToNewMovie` transforms TMDB types and is needed by both `seed.ts` and the `search_tmdb` tool. It belongs in the tmdb-client package alongside the types it transforms.

---

#### E. `packages/tmdb-client/src/index.ts` ⚪ MODIFY
**Changes**: Export 4 new endpoint functions + `mapTmdbToNewMovie` from `./mappers.js`

---

#### F. `packages/db/src/seed-config.ts` 🟢 NEW
**Purpose**: Zod schema + loader for seed config

**Changes**:
- `seedSourceSchema`: Zod discriminated union on `type`
  - `popular | top_rated | now_playing | upcoming` → `{ type, pages: z.number().int().positive() }`
  - `trending` → adds `timeWindow: z.enum(["day", "week"]).default("week")`
- `seedConfigSchema`: `z.object({ sources: z.array(seedSourceSchema).min(1) })`
- `loadSeedConfig()`: reads `seed.config.json`, parses with Zod, throws descriptive errors

---

#### G. `packages/db/seed.config.json` 🟢 NEW
**Purpose**: Default seed configuration

**Changes**: Config file as shown in Data Model section

---

#### H. `packages/db/src/seed.ts` ⚪ MODIFY
**Purpose**: Refactor to use config-based multi-source seeding

**Changes**:
- Remove `mapTmdbToNewMovie()` definition (moved to `@repo/tmdb-client/src/mappers.ts`)
- Import `mapTmdbToNewMovie` from `@repo/tmdb-client`
- Import `loadSeedConfig` and new TMDB client endpoints
- Create a `fetchSourcePage(source, page)` dispatcher:
  - `popular` → `getPopularMovies(client, page)`
  - `top_rated` → `getTopRatedMovies(client, page)`
  - `trending` → `getTrendingMovies(client, source.timeWindow, page)`
  - `now_playing` → `getNowPlayingMovies(client, page)`
  - `upcoming` → `getUpcomingMovies(client, page)`
- Iterate config sources, fetch pages, get details, upsert — same as current logic but generalized
- Log per-source progress: `"[popular] Page 3/10 — 20 movies upserted"`
- Skip sources with `pages: 0`
- Graceful error per source — continue with remaining sources if one fails

**Why**: Replaces hardcoded 10-page popular-only seed with configurable multi-source approach

---

### Phase 2 — search_tmdb Agent Tool (UF2)

#### I0. `apps/api/src/lib/tmdb.ts` 🟢 NEW
**Purpose**: API-level TmdbClient singleton

**Changes**:
- Create and export a shared `TmdbClient` instance: `new TmdbClient(process.env.TMDB_API_KEY!)`
- Lazy initialization or fail-fast if `TMDB_API_KEY` is not set

**Why**: Both the `search_tmdb` tool and any future TMDB-dependent features need a client instance. A singleton avoids passing it through every factory.

---

#### I. `apps/api/src/features/tools/search-tmdb.ts` 🟢 NEW
**Purpose**: AI SDK tool that searches TMDB live and persists results

**Changes**:
- `createSearchTmdbTool(db)` factory
- Imports the shared `TmdbClient` singleton from `../../lib/tmdb.js`
- Uses `tool()` from `ai` with `needsApproval: true`
- Input schema: `z.object({ query: z.string().describe("Search query"), page: z.number().optional().default(1) })`
- Execute:
  1. Call `searchMovies(tmdbClient, query, page)` from `@repo/tmdb-client`
  2. For each result, call `getMovieDetails(tmdbClient, id)` to get full details (credits, runtime)
  3. Map to DB format via `mapTmdbToNewMovie()` from `@repo/tmdb-client`
  4. Upsert each via `moviesRepository(db).upsertFromTmdb(movie)`
  5. Return array of persisted movies (matching `MovieDto` shape)
- Error handling: catch TMDB API errors → return `{ error: "TMDB unavailable" }` or rate-limit message

---

#### J. `apps/api/src/services/agents/orchestrator.ts` ⚪ MODIFY
**Purpose**: Register search_tmdb tool, update system prompt, migrate to streamText, handle approval flow

**Changes**:
- **Interface change**: Replace `message: string` with `messages: CoreMessage[]` in `OrchestratorParams`. The route handler translates AG-UI messages to AI SDK `CoreMessage[]` format and passes the full conversation history. The orchestrator no longer receives a single prompt string.
- **System prompt update**: Add instruction — "If local search results are insufficient (0 results, or don't match user intent), propose `search_tmdb`. Do NOT use it when local results are satisfactory."
- **Register tool**: Add `search_tmdb: createSearchTmdbTool(db)` to tools map
- **Migrate to `streamText`**: Replace `generateText()` with `streamText()` to support streaming + approval. Change from `prompt: message` to `messages` parameter.
- **Handle approval flow**:
  - First call: if `streamText` returns `tool-approval-request` parts in content → the stream includes these parts, backend maps them to AG-UI events (see Phase 3)
  - Second call (after user approval): messages include `tool-approval-response` → AI SDK executes the tool → streams results
- **Persist tool calls**: Iterate `result.steps` to persist tool calls with input/output (same as current, adapted for stream result)
- **Persistence model**: Backend remains the source of truth for conversation history. The orchestrator still persists user messages, assistant messages, runs, and tool calls from each request — even though the frontend also maintains conversation state via AG-UI. The AG-UI messages array is used for the AI SDK call, but all messages are also persisted server-side for audit and history.

---

### Phase 3 — AG-UI Streaming + Confirmation Flow (UF3)

#### K–M. AG-UI types — boundary-only approach (NO changes to `@repo/contracts`)

**Why not in contracts**: `@ag-ui/core@0.0.48` depends on `zod@^3.22.4` (Zod 3), but the project uses `zod@^4.3.6` (Zod 4). Re-exporting AG-UI Zod schemas through `@repo/contracts` would create type incompatibilities and bundle two Zod versions.

**Approach instead**:
- `apps/api` imports `@ag-ui/core` types directly in the route handler and AG-UI bridge (already a dependency via `@ag-ui/encoder`)
- `apps/web` imports `@ag-ui/client` types directly in the AG-UI client and hook
- Validation of incoming `RunAgentInput` is done with a **custom Zod 4 schema** in the route handler (matching AG-UI's expected shape) rather than using `RunAgentInputSchema` from `@ag-ui/core`
- App-specific helpers like `isPendingApproval()` live in `apps/api/src/services/agents/` or `apps/web/src/lib/ag-ui/` respectively

---

#### N. `apps/api/src/services/agents/ag-ui-stream.ts` 🟢 NEW
**Purpose**: Bridge AI SDK `streamText` result → AG-UI SSE events

**Changes**:
- `streamAgUiEvents(streamResult, { threadId, runId, encoder })` async generator
- Maps AI SDK stream parts to AG-UI events:
  - `text-delta` → `TEXT_MESSAGE_CONTENT { messageId, delta }`
  - Before first text delta → `TEXT_MESSAGE_START { messageId, role: "assistant" }`
  - After all text → `TEXT_MESSAGE_END { messageId }`
  - `tool-call` (auto-executed) → `TOOL_CALL_START { toolCallId, toolCallName }` + `TOOL_CALL_ARGS { toolCallId, delta }` + `TOOL_CALL_END { toolCallId }`
  - `tool-result` → `TOOL_CALL_RESULT { toolCallId, content }`
  - `tool-approval-request` → `TOOL_CALL_START` + `TOOL_CALL_ARGS` + `TOOL_CALL_END` (no result — signals pending approval)
- Wraps each event with `encoder.encode(event)` for SSE formatting
- Emits `RUN_STARTED` at beginning, `RUN_FINISHED` at end
- On error → `RUN_ERROR { message }`

**Why**: Decouples AI SDK internals from AG-UI protocol. Single responsibility: translate stream formats.

---

#### O. `apps/api/src/features/chat/route.ts` ⚪ MODIFY
**Purpose**: Migrate from JSON response to AG-UI SSE streaming

**Changes**:
- Replace JSON handler with SSE streaming handler
- Accept POST with `RunAgentInput`-shaped body
- Validate with a custom Zod 4 schema matching the AG-UI `RunAgentInput` shape (not the Zod 3 schema from `@ag-ui/core`)
- Translate AG-UI messages → AI SDK message format (user/assistant/tool messages)
- Detect approval responses in messages → pass to AI SDK as `tool-approval-response`
- Call `streamText()` via orchestrator
- Pipe through `streamAgUiEvents()` bridge
- Return `Response` with `Content-Type: text/event-stream`
- Use Hono's `streamSSE()` helper or raw `ReadableStream`
- Use `@ag-ui/encoder`'s `EventEncoder` for SSE serialization

**Key flow**:
```
POST /api/v1/chat (RunAgentInput body)
→ parse messages from AG-UI format
→ detect any tool-approval-responses
→ call orchestrator (streamText + tools)
→ pipe AI SDK stream through AG-UI bridge
→ return SSE stream
```

---

#### P. `apps/api/src/services/agents/message-translator.ts` 🟢 NEW
**Purpose**: Translate between AG-UI message format and AI SDK message format

**Changes**:
- `agUiToAiSdk(messages: AgUiMessage[]): CoreMessage[]` — maps AG-UI messages to AI SDK format
  - UserMessage → `{ role: 'user', content }`
  - AssistantMessage → `{ role: 'assistant', content }` (with tool call parts if present)
  - ToolMessage → `{ role: 'tool', content }` (tool results or approval responses)
- `extractApprovalResponses(messages)` — finds tool-approval-response entries in AG-UI tool messages, returns AI SDK `ToolApprovalResponse[]`

**Why**: AG-UI and AI SDK have different message formats. This layer keeps the translation explicit and testable.

---

#### Q. `apps/web/src/lib/ag-ui/client.ts` 🟢 NEW
**Purpose**: Configure AG-UI HttpAgent for the app

**Changes**:
- `createAgentClient(threadId?)` → `HttpAgent` instance
  - URL: `${API_BASE_URL}/api/v1/chat`
  - Optional headers (auth token when real auth is added)
- Export typed helpers for sending messages via the agent

---

#### R. `apps/web/src/hooks/use-agent-chat.ts` 🟢 NEW
**Purpose**: React hook wrapping AG-UI client for chat UI

**Changes**:
- `useAgentChat()` hook returning:
  - `messages: Message[]` — conversation history
  - `isLoading: boolean`
  - `error: string | null`
  - `pendingApproval: { toolCallId, toolName, args } | null` — non-null when a tool needs user confirmation
  - `sendMessage(text: string): void` — sends user message, starts new run
  - `approveToolCall(toolCallId: string): void` — confirms pending tool, starts new run with approval
  - `rejectToolCall(toolCallId: string): void` — rejects pending tool
- Internally:
  - Creates `HttpAgent` via `createAgentClient()`
  - Manages `threadId` state (created on first message, reused for session)
  - Subscribes to AG-UI events:
    - `onTextMessageContent` → accumulate assistant text
    - `onToolCallStart/Args/End` → track tool calls
    - `onToolCallResult` → parse movie results, update state
    - `onRunFinished` → check for pending tool calls without results → set `pendingApproval`
    - `onRunError` → set error state
  - On `approveToolCall`: builds messages array with tool-approval-response, calls `runAgent()` again

**Why**: Encapsulates AG-UI subscription logic and state management in a reusable hook. Keeps movie-search.tsx focused on rendering.

---

#### S. `apps/web/src/components/movie-search.tsx` ⚪ MODIFY
**Purpose**: Replace fetch-based chat with AG-UI streaming, add confirmation button

**Changes**:
- Replace `chatSearch()` + local state with `useAgentChat()` hook
- Streaming text: show assistant response as it streams (character by character)
- Movie results: extract from tool call results (search_movies output)
- Confirmation button:
  - Render when `pendingApproval !== null && pendingApproval.toolName === "search_tmdb"`
  - Label: "Search TMDB for more results"
  - On click: `approveToolCall(pendingApproval.toolCallId)` + show loading state
  - Disabled during loading or after completion
  - Hidden when user sends a new message (pendingApproval resets)
- Error states: show TMDB errors from tool results or run errors

---

#### T. `apps/web/src/lib/api/chat.ts` ⚪ MODIFY
**Purpose**: Remove — replaced by AG-UI client

**Changes**: Delete `chatSearch()` function. All chat communication goes through the AG-UI hook.

---

### Dependencies to Install

#### `apps/api/package.json`:
- `@ag-ui/encoder` — SSE event encoding
- `@ag-ui/core` — types and schemas (if not already via encoder)

#### `apps/web/package.json`:
- `@ag-ui/client` — HttpAgent + event subscriber (includes `@ag-ui/core`)
- `rxjs` — peer dependency of `@ag-ui/client`

#### `packages/contracts/package.json`:
- No AG-UI dependencies (Zod 3/4 conflict — AG-UI types used at boundary only)

---

## 4. Test Plan

### Phase 1 — Configurable Seed

#### `packages/tmdb-client/src/endpoints/top-rated-movies.test.ts` (+ 3 similar)
1. **`calls correct TMDB endpoint URL`** — mock HTTP → verify `GET /movie/top_rated?page=2`
2. **`returns paginated response`** — mock response → verify typed `TmdbPaginatedResponse<TmdbMovie>` output

_(Same pattern for trending, now-playing, upcoming. Trending also tests timeWindow param in URL.)_

#### `packages/db/src/seed-config.test.ts`
3. **`validates valid config`** — valid JSON → parses without error
4. **`rejects invalid source type`** — `{ type: "foobar" }` → Zod error with valid types listed
5. **`rejects negative pages`** — `{ pages: -1 }` → Zod error
6. **`defaults timeWindow to week for trending`** — `{ type: "trending", pages: 1 }` → parsed with `timeWindow: "week"`
7. **`rejects empty sources array`** — `{ sources: [] }` → Zod error

#### `packages/db/src/seed.test.ts`
8. **`processes all configured sources`** — 3 sources in config, mock TMDB → verify all 3 endpoints called with correct page counts
9. **`skips sources with pages 0`** — source with `pages: 0` → endpoint not called
10. **`continues on source failure`** — first source throws, second succeeds → second source movies upserted
11. **`deduplicates movies across sources`** — same tmdbId from 2 sources → `upsertFromTmdb` called (upsert handles dedup)

### Phase 2 — search_tmdb Tool

#### `apps/api/src/features/tools/search-tmdb.test.ts`
12. **`searches TMDB and upserts results`** — mock TMDB client → verify `searchMovies` called, `getMovieDetails` called per result, `upsertFromTmdb` called per movie
13. **`returns persisted movies as MovieDto[]`** — verify output matches `MovieDto` shape
14. **`returns empty array when TMDB returns no results`** — mock empty response → returns `[]`
15. **`returns error on TMDB API failure`** — mock TMDB throws → returns `{ error: "..." }`
16. **`has needsApproval set to true`** — verify tool config includes `needsApproval: true`

#### `apps/api/src/services/agents/orchestrator.test.ts` (ADD to existing)
17. **`registers search_tmdb tool`** — verify tools map includes `search_tmdb`
18. **`returns tool-approval-request when search_tmdb proposed`** — mock AI returning tool-approval-request → verify it's included in stream output

### Phase 3 — AG-UI Streaming

#### `apps/api/src/services/agents/message-translator.test.ts`
19. **`translates AG-UI UserMessage to AI SDK format`** — `{ role: "user", content: "hello" }` → AI SDK user message
20. **`translates AG-UI AssistantMessage with tool calls`** — assistant message with tool call parts → AI SDK format with tool call content
21. **`extracts approval responses from ToolMessage`** — tool message with approval → returns `ToolApprovalResponse[]`
22. **`handles empty messages array`** — `[]` → `[]`

#### `apps/api/src/services/agents/ag-ui-stream.test.ts`
23. **`emits RUN_STARTED and RUN_FINISHED`** — any stream → first event is RUN_STARTED, last is RUN_FINISHED
24. **`maps text deltas to TEXT_MESSAGE_START/CONTENT/END`** — mock stream with text deltas → verify AG-UI text events in order
25. **`maps tool call to TOOL_CALL_START/ARGS/END/RESULT`** — mock stream with tool call + result → verify 4 AG-UI events
26. **`maps tool-approval-request to TOOL_CALL without RESULT`** — mock stream with approval request → verify TOOL_CALL_START/ARGS/END emitted, no TOOL_CALL_RESULT
27. **`emits RUN_ERROR on stream error`** — mock stream throws → verify RUN_ERROR event

#### `apps/api/src/features/chat/route.test.ts` (REPLACE existing)
28. **`POST /api/v1/chat returns SSE stream`** — verify response Content-Type is `text/event-stream`
29. **`streams AG-UI events for a text response`** — mock orchestrator → verify TEXT_MESSAGE events in SSE stream
30. **`handles approval flow across two requests`** — first request returns tool-approval-request events, second request with approval → tool executes → TOOL_CALL_RESULT event
31. **`returns 400 for invalid RunAgentInput`** — missing threadId → 400

#### `apps/web/src/hooks/use-agent-chat.test.ts`
32. **`sends message and accumulates streaming text`** — mock AG-UI events → verify messages state updated
33. **`sets pendingApproval when tool call has no result`** — mock tool call events without result → `pendingApproval` is set
34. **`approveToolCall sends new run with approval message`** — call approveToolCall → verify new runAgent() called with tool message
35. **`resets pendingApproval on new message`** — pending approval exists → sendMessage → pendingApproval is null

#### `apps/web/src/components/movie-search.test.tsx` (REPLACE existing)
36. **`submits query on Enter`** — type + Enter → verify sendMessage called
37. **`shows streaming text response`** — mock hook with response text → verify text rendered
38. **`renders movie cards from tool results`** — mock hook with movies → verify MovieCards
39. **`shows TMDB confirmation button when pendingApproval`** — mock hook with pendingApproval → button visible with "Search TMDB for more results"
40. **`clicking confirm button calls approveToolCall`** — click button → verify approveToolCall called
41. **`hides button after approval completes`** — pendingApproval goes null → button hidden

---

## 5. To Do List

### Phase 1 — Configurable Seed (UF1)

- [ ] **Add TMDB list endpoints + extract mapper**
  - Create `packages/tmdb-client/src/endpoints/top-rated-movies.ts` — `getTopRatedMovies(client, page)`
  - Create `packages/tmdb-client/src/endpoints/trending-movies.ts` — `getTrendingMovies(client, timeWindow, page)`
  - Create `packages/tmdb-client/src/endpoints/now-playing-movies.ts` — `getNowPlayingMovies(client, page)`
  - Create `packages/tmdb-client/src/endpoints/upcoming-movies.ts` — `getUpcomingMovies(client, page)`
  - Create `packages/tmdb-client/src/mappers.ts` — move `mapTmdbToNewMovie()` from `packages/db/src/seed.ts`
  - Modify `packages/tmdb-client/src/index.ts` — export new endpoints + `mapTmdbToNewMovie`

- [ ] **Create seed config**
  - Create `packages/db/src/seed-config.ts` — Zod schema + `loadSeedConfig()`
  - Create `packages/db/seed.config.json` — default config with popular(10), top_rated(5), trending(3), now_playing(2), upcoming(2)

- [ ] **Refactor seed script**
  - Modify `packages/db/src/seed.ts` — remove `mapTmdbToNewMovie` (now imported from `@repo/tmdb-client`), config-based multi-source seeding with `fetchSourcePage()` dispatcher

- [ ] **Write Phase 1 tests**
  - `packages/tmdb-client/src/endpoints/top-rated-movies.test.ts` (+ 3 similar)
  - `packages/db/src/seed-config.test.ts` — tests 3-7
  - `packages/db/src/seed.test.ts` — tests 8-11

- [ ] **Verify Phase 1**
  - `pnpm typecheck` passes
  - `pnpm test --filter @repo/tmdb-client --filter @repo/db` passes
  - Manual: `pnpm db:seed` with new config → movies from all sources upserted

### Phase 2 — search_tmdb Agent Tool (UF2)

- [ ] **Create TmdbClient singleton + search_tmdb tool**
  - Create `apps/api/src/lib/tmdb.ts` — shared `TmdbClient` singleton
  - Create `apps/api/src/features/tools/search-tmdb.ts` — tool with `needsApproval: true`, fetches TMDB + upserts (uses singleton client)

- [ ] **Update orchestrator**
  - Modify `apps/api/src/services/agents/orchestrator.ts`:
    - Change interface from `message: string` to `messages: CoreMessage[]`
    - Register `search_tmdb` tool
    - Update system prompt with insufficiency criteria
    - Migrate from `generateText` to `streamText`
    - Keep server-side persistence of all messages, runs, and tool calls

- [ ] **Write Phase 2 tests**
  - `apps/api/src/features/tools/search-tmdb.test.ts` — tests 12-16
  - Add to `apps/api/src/services/agents/orchestrator.test.ts` — tests 17-18

- [ ] **Verify Phase 2**
  - `pnpm typecheck` passes
  - `pnpm test --filter @repo/api` passes

### Phase 3 — AG-UI Streaming + Confirmation (UF3)

- [ ] **Install AG-UI dependencies**
  - `pnpm --filter @repo/api add @ag-ui/encoder @ag-ui/core`
  - `pnpm --filter @repo/web add @ag-ui/client rxjs`
  - ~~`pnpm --filter @repo/contracts add @ag-ui/core`~~ — **removed**: Zod 3/4 conflict, AG-UI types used at boundary only

- [ ] **Create custom AG-UI validation schema**
  - Create `apps/api/src/features/chat/ag-ui-schema.ts` — Zod 4 schema matching AG-UI `RunAgentInput` shape (replaces importing `RunAgentInputSchema` from `@ag-ui/core`)
  - No changes to `@repo/contracts` — AG-UI types stay at the boundary

- [ ] **Create AG-UI server bridge**
  - Create `apps/api/src/services/agents/ag-ui-stream.ts` — AI SDK → AG-UI event mapper
  - Create `apps/api/src/services/agents/message-translator.ts` — AG-UI ↔ AI SDK message translator

- [ ] **Migrate chat endpoint to SSE**
  - Modify `apps/api/src/features/chat/route.ts` — accept `RunAgentInput`, return SSE stream via AG-UI bridge

- [ ] **Create AG-UI frontend client**
  - Create `apps/web/src/lib/ag-ui/client.ts` — HttpAgent factory
  - Create `apps/web/src/hooks/use-agent-chat.ts` — React hook with streaming state, pendingApproval, approve/reject

- [ ] **Update movie search UI**
  - Modify `apps/web/src/components/movie-search.tsx` — use `useAgentChat()`, streaming text, confirmation button
  - Delete `apps/web/src/lib/api/chat.ts` — replaced by AG-UI client

- [ ] **Clean up dead contracts**
  - Remove `chatRequestSchema` and `ChatResponse` from `packages/contracts/src/http/chat.ts` (dead code after SSE migration)
  - Update `packages/contracts/src/http/index.ts` to remove the exports

- [ ] **Write Phase 3 tests**
  - `apps/api/src/services/agents/message-translator.test.ts` — tests 19-22
  - `apps/api/src/services/agents/ag-ui-stream.test.ts` — tests 23-27
  - `apps/api/src/features/chat/route.test.ts` — tests 28-31
  - `apps/web/src/hooks/use-agent-chat.test.ts` — tests 32-35
  - `apps/web/src/components/movie-search.test.tsx` — tests 36-41

- [ ] **Verify Phase 3**
  - `pnpm typecheck` passes
  - `pnpm test` passes (all workspaces)
  - Manual: search "Stalker by Tarkovsky" → local results insufficient → "Search TMDB" button appears → click → movies found and displayed

---

## 6. Context: Current System Architecture

### TMDB Client (`packages/tmdb-client/`)
- 3 endpoints: `getPopularMovies`, `searchMovies`, `getMovieDetails`
- HTTP client with Bearer token auth, typed responses
- Limitation: no list endpoints beyond popular — addressed by Phase 1

### Seed Script (`packages/db/src/seed.ts`)
- Hardcoded: 10 pages of popular movies, CONCURRENCY=5
- Uses `mapTmdbToNewMovie()` (to be moved to `@repo/tmdb-client`) + `upsertFromTmdb()` per movie
- Limitation: single source, not configurable — addressed by Phase 1

### Agent Orchestrator (`apps/api/src/services/agents/orchestrator.ts`)
- Uses `generateText()` (not streaming) with `search_movies` tool only
- Persists sessions, messages, runs, tool calls
- System prompt: movie expert extracting structured search params
- Limitation: no TMDB tool, no streaming, no approval flow — addressed by Phases 2+3

### Chat Endpoint (`apps/api/src/features/chat/route.ts`)
- `POST /api/v1/chat` — JSON request/response
- Validates `chatRequestSchema`, calls orchestrator, returns JSON
- Limitation: no SSE streaming — addressed by Phase 3

### Frontend Chat (`apps/web/src/components/movie-search.tsx`)
- Client component, form-based input, calls `chatSearch()` on submit
- Extracts movies from `toolResults`, renders `MovieCard` grid
- Limitation: no streaming, no tool confirmation UI — addressed by Phase 3

### Movies Repository (`packages/db/src/repositories/movies.ts`)
- `searchByTitle`, `searchStructured`, `upsertFromTmdb` — all needed methods already exist
- `upsertFromTmdb` handles conflict on `tmdbId` — dedup built in

### Key Files

| File | Purpose |
|------|---------|
| `packages/tmdb-client/src/endpoints/popular-movies.ts` | Pattern for new TMDB endpoints |
| `packages/tmdb-client/src/types.ts` | `TmdbMovie`, `TmdbPaginatedResponse`, `TmdbMovieDetails` |
| `packages/tmdb-client/src/mappers.ts` | `mapTmdbToNewMovie` (moved from seed.ts) |
| `packages/db/src/seed.ts` | Current seed script (to be refactored) |
| `packages/db/src/repositories/movies.ts` | `upsertFromTmdb`, `searchStructured` |
| `apps/api/src/services/agents/orchestrator.ts` | Agent loop (to add streaming + search_tmdb) |
| `apps/api/src/features/tools/search-movies.ts` | Reference for tool definition pattern |
| `apps/api/src/features/chat/route.ts` | Chat endpoint (to migrate to SSE) |
| `apps/api/src/lib/ai-provider.ts` | `getModel()` — OpenRouter/Ollama dual provider |
| `apps/api/src/lib/tmdb.ts` | Shared `TmdbClient` singleton (new) |
| `apps/web/src/components/movie-search.tsx` | Chat UI (to add streaming + confirmation) |
| `apps/web/src/lib/api/chat.ts` | Current chat API client (to be deleted) |
| `apps/web/src/lib/api/client.ts` | `apiFetch()` wrapper (keep for non-chat endpoints) |

---

## 7. Reference Implementations

| Pattern | File | Reuse |
|---------|------|-------|
| TMDB list endpoint | `packages/tmdb-client/src/endpoints/popular-movies.ts` | ⚪ Clone for 4 new endpoints |
| TMDB movie details fetch | `packages/tmdb-client/src/endpoints/movie-details.ts` | ⚪ Used by search_tmdb tool |
| Seed movie transform | `packages/tmdb-client/src/mappers.ts` (`mapTmdbToNewMovie`) | ⚪ Moved from seed.ts; reused by seed + search_tmdb tool |
| Movie upsert | `packages/db/src/repositories/movies.ts` (`upsertFromTmdb`) | ⚪ Reused by search_tmdb tool |
| AI SDK tool definition | `apps/api/src/features/tools/search-movies.ts` | ⚪ Pattern for search_tmdb |
| Orchestrator + generateText | `apps/api/src/services/agents/orchestrator.ts` | ⚪ Migrate to streamText |
| Repository factory | `packages/db/src/repositories/movies.ts` | ⚪ Pattern reference |
| Hono route handler | `apps/api/src/features/chat/route.ts` | ⚪ Modify for SSE |
| Frontend component | `apps/web/src/components/movie-search.tsx` | ⚪ Modify for AG-UI |

---

## Notes

- **AI SDK v6**: Uses `ai@^6.0.137`. Key APIs: `tool()` with `inputSchema` + `needsApproval`, `streamText()` with `stopWhen`. `tool-approval-request` returned as content part when tool needs approval. **Verified**: `streamText` + `needsApproval` confirmed working in installed version.
- **AG-UI v0.0.48**: `@ag-ui/core` (types), `@ag-ui/encoder` (SSE), `@ag-ui/client` (HttpAgent + RxJS). No dedicated confirmation event — uses tool-call lifecycle + multi-turn pattern.
- **Zod version conflict**: `@ag-ui/core@0.0.48` depends on `zod@^3.22.4` (Zod 3), but the project uses `zod@^4.3.6` (Zod 4). AG-UI types are therefore used only at the boundary (route handler + frontend client), not re-exported through `@repo/contracts`. Validation of AG-UI inputs uses custom Zod 4 schemas.
- **Multi-turn approval flow**: First `streamText` call returns `tool-approval-request` → streamed as AG-UI TOOL_CALL without RESULT → frontend shows button → second request with approval → tool executes.
- **RxJS dependency**: `@ag-ui/client` depends on RxJS. This adds ~30kb gzipped to the frontend bundle. Acceptable for the streaming functionality it enables.
- **No schema migrations**: All DB tables already exist from Phase B (agent-foundation-plan). No `pnpm db:generate` needed.
- **Hono SSE**: Hono provides `streamSSE()` helper in `hono/streaming`. Alternatively, use raw `ReadableStream` with `@ag-ui/encoder` for full control.

## Unresolved Questions

1. **AG-UI client RxJS integration in React**: `@ag-ui/client` is RxJS-based. The `useAgentChat` hook will need to bridge RxJS Observables to React state. May need a small `useObservable` helper or manual subscription in `useEffect`. Verify during implementation.
2. ~~**AI SDK `streamText` + `needsApproval` compatibility**~~: **RESOLVED** — Verified in installed `ai@6.0.137` type definitions. `needsApproval` is a valid property on `Tool`, and `tool-approval-request`/`tool-approval-response` are real content part types handled by `streamText`.
3. **AG-UI `RunAgentInput` validation**: Since we cannot use `RunAgentInputSchema` from `@ag-ui/core` (Zod 3/4 conflict), we will write a custom Zod 4 schema in `apps/api/src/features/chat/ag-ui-schema.ts`. Verify the expected shape by inspecting `@ag-ui/core` TypeScript types during implementation.
