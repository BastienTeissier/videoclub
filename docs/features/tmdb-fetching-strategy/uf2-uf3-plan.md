# Implementation Plan: TMDB Search Agent Tool + AG-UI Confirmation (UF2 + UF3)

## 1. Feature Description

**Objective**: Add a live `search_tmdb` agent tool that queries TMDB when local results are insufficient, and an AG-UI streaming protocol so the user approves TMDB searches before execution.

**Key Capabilities**:
- **CAN** search TMDB live through the AI agent when local results are insufficient
- **CAN** stream agent responses to the frontend via AG-UI SSE events
- **CAN** show a "Search TMDB for more results" confirmation button when the agent proposes `search_tmdb`
- **CAN** upsert all TMDB results into the local DB with full details (credits, runtime, genres)
- **CANNOT** auto-execute `search_tmdb` — always requires user confirmation via `needsApproval: true`
- **CANNOT** resume interrupted streams (full AG-UI resumability out of scope)

**Business Rules**:
- Agent always searches local DB first via `search_movies`
- Agent proposes `search_tmdb` only when: 0 local results, results don't match intent, or user explicitly asks
- TMDB results upserted by tmdbId — no duplicates
- Pending confirmation invalidated when user sends a new message

**Phases**:
- **Phase 2 (UF2)**: Backend — `search_tmdb` tool, orchestrator migration to `streamText` + `messages: CoreMessage[]`, system prompt update. Route temporarily wraps single message to CoreMessage[] and awaits full result as JSON.
- **Phase 3 (UF3)**: AG-UI bridge (AI SDK → AG-UI events), SSE chat route, frontend AG-UI client + `useAgentChat` hook, confirmation button UI. AG-UI types at boundary only (no `@repo/contracts` changes) due to Zod 3/4 conflict.

---

## 2. Architecture

### Phase 2 — search_tmdb Agent Tool (UF2)

#### A. `apps/api/src/lib/tmdb.ts` 🟢 NEW
**Purpose**: Shared TmdbClient singleton for the API app

**Changes**:
- Import `TmdbClient` from `@repo/tmdb-client`
- Lazy-initialized singleton via getter: `export function getTmdbClient()` — creates `TmdbClient` on first call, throws if `TMDB_API_KEY` is not set
- This avoids import-time crashes in test/build environments where `TMDB_API_KEY` may not be set

**Why**: Both `search_tmdb` tool and any future TMDB features need a client. Lazy singleton avoids passing it through factories while remaining test-safe.

---

#### B. `apps/api/src/features/tools/search-tmdb.ts` 🟢 NEW
**Purpose**: AI SDK tool that searches TMDB live, fetches full details, and persists to local DB

**Changes**:
- `createSearchTmdbTool(db)` factory, returns `tool()` from `ai`
- `needsApproval: true` — agent proposes, user confirms
- Input schema: `z.object({ query: z.string(), page: z.number().optional().default(1) })`
- Execute:
  1. `searchMovies(getTmdbClient(), query, page)` → `TmdbPaginatedResponse<TmdbMovie>` — access `.results` for the movie list
  2. Cap results to top 10 (by TMDB popularity order) to limit API calls
  3. Fetch details in parallel: `Promise.all(results.slice(0, 10).map(r => getMovieDetails(getTmdbClient(), r.id)))` → `TmdbMovieDetails[]`
  4. For each detail: `mapTmdbMovieDetails(details)` → `TmdbMovieMapped` (DB-ready object)
  5. `moviesRepository(db).upsertFromTmdb(movie)` → persisted `Movie` (Drizzle type)
  6. Map each persisted `Movie` to `MovieDto` (convert Date fields to ISO strings) before returning
- Error handling: catch TMDB API errors → return `{ error: "TMDB unavailable" }` or rate-limit message
- **TODO (pre-prod)**: Evaluate TMDB API quota impact — consider caching, reducing detail fetches, or using bulk endpoints if available

**Reference**: ⚪ `apps/api/src/features/tools/search-movies.ts` — same factory pattern with `tool()` + `inputSchema` + `execute`

---

#### C. `apps/api/src/services/agents/orchestrator.ts` ⚪ MODIFY
**Purpose**: Register search_tmdb, migrate to streamText, accept messages[], update system prompt

**Changes**:
- **Interface**: Replace `message: string` with `messages: CoreMessage[]` in `OrchestratorParams`
- **Import**: Add `streamText` (replace `generateText`), `createSearchTmdbTool`
- **System prompt**: Append instruction — "If local search results are insufficient (0 results, don't match user intent, or user asks for more), propose `search_tmdb`. Do NOT propose it when local results satisfy the query."
- **Tool registration**: Add `search_tmdb: createSearchTmdbTool(db)` alongside `search_movies`
- **Load conversation history**: Use `chatMessagesRepository(db).findBySessionId(sessionId)` to load previous messages, convert to `CoreMessage[]`, and prepend them before the new messages. This ensures the model has full conversation context server-side (authoritative, not relying on client-sent history).
- **Migrate to `streamText`**: Replace `generateText()` with `streamText()`. Change from `prompt: message` to `messages` parameter. Use `await result.text` to get final text result.
- **Return type**: Return `{ sessionId, response: await result.text, toolResults, steps: await result.steps }` — note: on `StreamTextResult`, both `result.text` and `result.steps` are `PromiseLike` (they auto-consume the stream), unlike `GenerateTextResult` where they are synchronous.
- **Persist tool calls**: Iterate `await result.steps` same as current, adapted for streamText result shape
- **Session/message persistence**: Keep current pattern — persist user messages, assistant messages, runs, tool calls server-side

---

#### D. `apps/api/src/features/chat/route.ts` ⚪ MODIFY
**Purpose**: Adapt to new orchestrator interface (temporary — Phase 3 replaces with SSE)

**Changes**:
- Keep `chatRequestSchema` input (message + sessionId)
- Wrap `message` into `CoreMessage[]`: `[{ role: "user", content: parsed.data.message }]`
- Pass `messages` instead of `message` to `runOrchestrator`
- Return same JSON shape as before (sessionId, response, toolResults)

**Why**: Temporary bridge so Phase 2 can be tested independently. Phase 3 replaces this with SSE streaming.

---

### Phase 3 — AG-UI Streaming + Confirmation Flow (UF3)

#### E. `apps/api` + `apps/web` — Install dependencies
**Purpose**: Add AG-UI libraries

**Changes**:
- `apps/api/package.json`: Add `@ag-ui/encoder` (brings `@ag-ui/core` transitively)
- `apps/web/package.json`: Add `@ag-ui/client` (`rxjs` comes as a regular dependency of `@ag-ui/client`, no explicit install needed)
- No changes to `@repo/contracts` — AG-UI types at boundary only (Zod 3/4 conflict)

---

#### F. `apps/api/src/features/chat/ag-ui-schema.ts` 🟢 NEW
**Purpose**: Custom Zod 4 schema matching AG-UI `RunAgentInput` shape

**Changes**:
- `runAgentInputSchema`: Zod 4 schema with fields: `threadId: z.string()`, `runId: z.string()`, `messages: z.array(messageSchema)`, `tools: z.array(...).optional()`, `context: z.array(...).optional()`
- `messageSchema`: Zod 4 schema for AG-UI messages (role + content + toolCalls etc.)
- Types exported: `RunAgentInput`, `AgUiMessage`

**Why**: Cannot import `RunAgentInputSchema` from `@ag-ui/core` (Zod 3). Custom Zod 4 schema validates incoming request at the boundary.

---

#### G. `apps/api/src/services/agents/message-translator.ts` 🟢 NEW
**Purpose**: Translate between AG-UI message format and AI SDK `CoreMessage[]` format

**Changes**:
- `agUiToAiSdk(messages: AgUiMessage[]): CoreMessage[]`:
  - `role: "user"` → `{ role: "user", content }`
  - `role: "assistant"` → `{ role: "assistant", content }` (with tool call parts if present)
  - `role: "tool"` → `{ role: "tool", content }` (tool results or approval responses)
- `extractApprovalResponses(messages)`: Finds tool-approval-response entries, returns AI SDK `ToolApprovalPart[]`

**Why**: AG-UI and AI SDK have different message schemas. Explicit, testable translation layer.

---

#### H. `apps/api/src/services/agents/ag-ui-stream.ts` 🟢 NEW
**Purpose**: Bridge AI SDK `streamText` result → AG-UI SSE events

**Changes**:
- `streamAgUiEvents(streamResult, { threadId, runId, encoder })` — async generator yielding SSE-encoded strings
- Mapping:
  - Emit `RUN_STARTED` first
  - `text-delta` → `TEXT_MESSAGE_START` (before first delta) + `TEXT_MESSAGE_CONTENT { delta }` + `TEXT_MESSAGE_END` (after all text)
  - `tool-call` (auto-executed) → `TOOL_CALL_START { toolCallId, toolCallName }` + `TOOL_CALL_ARGS { toolCallId, delta }` + `TOOL_CALL_END`
  - `tool-result` → `TOOL_CALL_RESULT { toolCallId, content }`
  - `tool-approval-request` → `TOOL_CALL_START` + `TOOL_CALL_ARGS` + `TOOL_CALL_END` (no RESULT — signals pending approval)
  - Emit `RUN_FINISHED` at end
  - On error → `RUN_ERROR { message }`
- Uses `encoder.encode(event)` from `@ag-ui/encoder` for SSE formatting

**Why**: Decouples AI SDK stream internals from AG-UI protocol. Single responsibility.

---

#### I. `apps/api/src/features/chat/route.ts` ⚪ MODIFY (Phase 3 — replaces Phase 2 adaptation)
**Purpose**: Migrate from JSON response to AG-UI SSE streaming

**Changes**:
- Replace JSON handler with SSE streaming handler
- Accept POST with body validated by `runAgentInputSchema` (from `ag-ui-schema.ts`)
- Translate AG-UI messages → AI SDK `CoreMessage[]` via `agUiToAiSdk()`
- Detect approval responses via `extractApprovalResponses()`
- Call orchestrator with `messages` (orchestrator returns streamText result)
- Pipe through `streamAgUiEvents()` bridge
- Return `Response` with `Content-Type: text/event-stream`
- Use Hono's `streamSSE()` helper or raw `ReadableStream`

**Key flow**:
```
POST /api/v1/chat (RunAgentInput body)
→ validate with runAgentInputSchema
→ agUiToAiSdk(messages) → CoreMessage[]
→ extractApprovalResponses(messages) → approval parts
→ runOrchestrator({ db, messages, userId, sessionId })
→ streamAgUiEvents(result) → SSE events
→ return SSE stream
```

---

#### J. `apps/api/src/services/agents/orchestrator.ts` ⚪ MODIFY (Phase 3 update)
**Purpose**: Return stream result instead of awaited text

**Changes**:
- Phase 2 awaited the full result. Phase 3: return `streamText` result directly so route handler pipes it through AG-UI bridge
- **Conversation history**: Keep the server-side history loading from Phase 2. AG-UI client sends messages, but the backend uses its own DB as the authoritative source. Incoming AG-UI messages are used only for the latest user message and approval responses.
- Move persistence into `onFinish` callback passed to `streamText()`:
  - `event.text` → persist assistant message
  - `event.steps` → iterate to persist tool calls + results via `runs.createToolCall()` / `runs.completeToolCall()`
  - `runs.completeRun()` at the end
  - `onFinish` can return a Promise — async DB writes are awaited by the SDK
- Return type: `{ sessionId, runId, stream: StreamTextResult }` — route handler uses `stream.fullStream` for AG-UI bridge

---

#### K. `apps/web/src/lib/ag-ui/client.ts` 🟢 NEW
**Purpose**: Configure AG-UI HttpAgent for the web app

**Changes**:
- `createAgentClient()` → `HttpAgent` instance
  - URL: `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"}/api/v1/chat`
- Export typed helper for creating agent runs

---

#### L. `apps/web/src/hooks/use-agent-chat.ts` 🟢 NEW
**Purpose**: React hook wrapping AG-UI client for chat UI

**Changes**:
- `useAgentChat()` returns:
  - `messages: Message[]` — conversation history
  - `isLoading: boolean`
  - `error: string | null`
  - `pendingApproval: { toolCallId, toolName, args } | null`
  - `sendMessage(text: string): void`
  - `approveToolCall(toolCallId: string): void`
  - `rejectToolCall(toolCallId: string): void`
- Internally:
  - Creates `HttpAgent` via `createAgentClient()`
  - Manages `threadId` state (created on first message)
  - Uses `agent.subscribe(subscriber)` in `useEffect` (returns `{ unsubscribe }` for cleanup — no RxJS bridge needed)
  - Subscriber callbacks:
    - `onTextMessageContentEvent` → accumulate assistant text via `textMessageBuffer`
    - `onToolCallEndEvent` → track completed tool calls (name + args)
    - `onToolCallResultEvent` → parse movie results from tool output
    - `onRunFinishedEvent` → check for tool calls without results → set `pendingApproval`
    - `onRunErrorEvent` → set error from `event.error`
    - `onMessagesChanged` → sync full messages array to state
  - On `approveToolCall`: agent already has messages in internal state; add tool-approval message, call `runAgent()` again
  - On `sendMessage`: resets `pendingApproval`, adds user message via `agent.addMessages()`, starts new run
  - Cleanup: `agent.abortRun()` + `unsubscribe()` in `useEffect` return

---

#### M. `apps/web/src/components/movie-search.tsx` ⚪ MODIFY
**Purpose**: Replace fetch-based chat with AG-UI streaming, add confirmation button

**Changes**:
- Replace `chatSearch()` + manual state with `useAgentChat()` hook
- Streaming text: show assistant response as it streams (character by character via `messages` state)
- Movie results: extract from tool call results (`search_movies` output)
- Confirmation button:
  - Render when `pendingApproval !== null && pendingApproval.toolName === "search_tmdb"`
  - Label: "Search TMDB for more results"
  - On click: `approveToolCall(pendingApproval.toolCallId)`, show loading state
  - Disabled during loading or after completion
  - Hidden when user sends a new message
- Error states: show TMDB errors or run errors

---

#### N. `apps/web/src/lib/api/chat.ts` ❌ DELETE
**Purpose**: Dead code after AG-UI migration

**Why**: All chat communication goes through `useAgentChat()` hook + AG-UI client.

---

#### O. `packages/contracts/src/http/chat.ts` ⚪ MODIFY
**Purpose**: Remove dead chat contracts

**Changes**:
- Remove `chatRequestSchema`, `ChatRequest`, `chatResponseSchema`, `ChatResponse`
- Update `packages/contracts/src/http/index.ts` to remove the exports

**Why**: JSON chat endpoint replaced by AG-UI SSE. These schemas are no longer used.

---

## 3. Test List

### Phase 2 — search_tmdb Tool

#### `apps/api/src/features/tools/search-tmdb.test.ts`

1. **`searches TMDB and upserts results`** — Mock `searchMovies` → paginated response with 2 results, mock `getMovieDetails` per result (called in parallel), mock `upsertFromTmdb` → verify all called with correct args
2. **`returns persisted movies mapped to MovieDto[] shape`** — Verify output array has `id`, `tmdbId`, `title`, `year`, `genres`, and string dates (not Date objects)
3. **`returns empty array when TMDB returns no results`** — Mock `searchMovies` → `{ results: [] }` → tool returns `[]`
4. **`returns error object on TMDB API failure`** — Mock `searchMovies` throws → tool returns `{ error: "TMDB unavailable" }`
5. **`has needsApproval set to true`** — Inspect tool config → `needsApproval === true`

#### `apps/api/src/services/agents/orchestrator.test.ts` (NEW file)

6. **`registers both search_movies and search_tmdb tools`** — Mock `streamText`, verify `tools` arg contains both tool names
7. **`passes messages array to streamText`** — Call with `messages: [{ role: "user", content: "test" }]` → verify `streamText` called with `messages` (not `prompt`)
8. **`system prompt includes search_tmdb guidance`** — Verify `system` arg contains "search_tmdb" and "insufficient"
9. **`persists tool calls and results from steps`** — Mock `streamText` returning steps with tool calls → verify `createToolCall` + `completeToolCall` called
10. **`persists assistant message with response text`** — Mock `streamText` with text → verify `chatMessagesRepository.create` called with `role: "assistant"`
11. **`loads previous session messages and prepends to CoreMessage[]`** — Create session with prior messages in DB → call orchestrator → verify `streamText` receives `messages` array that includes previous messages before the new one

### Phase 3 — AG-UI Streaming

#### `apps/api/src/services/agents/message-translator.test.ts`

12. **`translates user message`** — AG-UI `{ role: "user", content: "hello" }` → AI SDK `{ role: "user", content: "hello" }`
13. **`translates assistant message with tool calls`** — AG-UI assistant message with `toolCalls` array → AI SDK format with tool-call content parts
14. **`extracts approval responses from tool messages`** — AG-UI tool message with approval → returns `ToolApprovalPart[]`
15. **`handles empty messages array`** — `[]` → `[]`

#### `apps/api/src/services/agents/ag-ui-stream.test.ts`

16. **`emits RUN_STARTED and RUN_FINISHED`** — Any stream → first event type is `RUN_STARTED`, last is `RUN_FINISHED`
17. **`maps text deltas to TEXT_MESSAGE_START/CONTENT/END`** — Mock stream with text deltas → verify 3 AG-UI event types in order
18. **`maps auto-executed tool call to TOOL_CALL lifecycle`** — Mock stream with tool-call + tool-result → verify `TOOL_CALL_START` + `TOOL_CALL_ARGS` + `TOOL_CALL_END` + `TOOL_CALL_RESULT`
19. **`maps tool-approval-request to TOOL_CALL without RESULT`** — Mock stream with approval request → verify `TOOL_CALL_START` + `TOOL_CALL_ARGS` + `TOOL_CALL_END` emitted, NO `TOOL_CALL_RESULT`
20. **`emits RUN_ERROR on stream error`** — Mock stream throws → verify `RUN_ERROR` event emitted

#### `apps/api/src/features/chat/route.test.ts` (REPLACE existing)

21. **`POST /api/v1/chat returns SSE stream`** — Verify response `Content-Type` is `text/event-stream`
22. **`streams AG-UI events for text response`** — Mock orchestrator → verify `TEXT_MESSAGE_CONTENT` events in SSE output
23. **`handles approval flow across two requests`** — First request → tool-approval-request events; second request with approval message → `TOOL_CALL_RESULT` event
24. **`returns 400 for invalid RunAgentInput`** — Missing `threadId` → HTTP 400

#### `apps/web/src/hooks/use-agent-chat.test.ts`

25. **`sends message and accumulates streaming text`** — Mock AG-UI events → verify `messages` state contains assistant text
26. **`sets pendingApproval when tool call has no result`** — Mock tool call events without result → `pendingApproval` is `{ toolCallId, toolName: "search_tmdb", args }`
27. **`approveToolCall sends new run with approval message`** — Call `approveToolCall(id)` → verify new `runAgent()` called with tool-approval message
28. **`resets pendingApproval on new message`** — `pendingApproval` set → call `sendMessage("new query")` → `pendingApproval` is `null`

#### `apps/web/src/components/movie-search.test.tsx` (REPLACE existing)

29. **`submits query on Enter`** — Type + Enter → verify `sendMessage` called with query text
30. **`shows streaming text response`** — Mock hook returning messages with assistant text → verify text rendered
31. **`renders movie cards from tool results`** — Mock hook with movies in tool results → verify `MovieCard` components rendered
32. **`shows TMDB confirmation button when pendingApproval`** — Mock hook with `pendingApproval: { toolName: "search_tmdb" }` → button with text "Search TMDB for more results" visible
33. **`clicking confirm button calls approveToolCall`** — Click button → verify `approveToolCall` called with correct `toolCallId`
34. **`hides button after approval completes`** — `pendingApproval` goes `null` → button not in DOM

---

## 4. To Do List

### Phase 2 — search_tmdb Agent Tool (UF2)

- [ ] **Create TmdbClient lazy singleton**
  - File: `apps/api/src/lib/tmdb.ts` 🟢
  - Import `TmdbClient` from `@repo/tmdb-client`, export `getTmdbClient()` getter (lazy init, throws on first access if env var missing)

- [ ] **Create search_tmdb tool**
  - File: `apps/api/src/features/tools/search-tmdb.ts` 🟢
  - Factory `createSearchTmdbTool(db)` with `needsApproval: true`, TMDB search (`.results`) → cap top 10 → parallel detail fetches → map → upsert → map to `MovieDto` → return

- [ ] **Update orchestrator**
  - File: `apps/api/src/services/agents/orchestrator.ts` ⚪
  - Change `message: string` → `messages: CoreMessage[]`
  - Replace `generateText` → `streamText`, `prompt` → `messages`
  - Load previous session messages from DB via `findBySessionId`, convert to `CoreMessage[]`, prepend to incoming messages
  - Register `search_tmdb` tool
  - Update system prompt with insufficiency criteria
  - Await full result for JSON return (Phase 2 only) — note `result.text` and `result.steps` are `PromiseLike` on `StreamTextResult`

- [ ] **Adapt chat route for new orchestrator**
  - File: `apps/api/src/features/chat/route.ts` ⚪
  - Wrap `message` into `[{ role: "user", content }]` before calling orchestrator

- [ ] **Write Phase 2 tests**
  - `apps/api/src/features/tools/search-tmdb.test.ts` — tests 1–5
  - `apps/api/src/services/agents/orchestrator.test.ts` — tests 6–11

- [ ] **Verify Phase 2**
  - `pnpm typecheck` passes
  - `pnpm test --filter @repo/api` passes

### Phase 3 — AG-UI Streaming + Confirmation (UF3)

- [ ] **Install AG-UI dependencies**
  - `pnpm --filter @repo/api add @ag-ui/encoder`
  - `pnpm --filter @repo/web add @ag-ui/client`

- [ ] **Create AG-UI validation schema**
  - File: `apps/api/src/features/chat/ag-ui-schema.ts` 🟢
  - Zod 4 schema matching AG-UI `RunAgentInput` shape

- [ ] **Create message translator**
  - File: `apps/api/src/services/agents/message-translator.ts` 🟢
  - `agUiToAiSdk()` + `extractApprovalResponses()`

- [ ] **Create AG-UI stream bridge**
  - File: `apps/api/src/services/agents/ag-ui-stream.ts` 🟢
  - `streamAgUiEvents()` async generator: AI SDK stream parts → AG-UI events

- [ ] **Update orchestrator for streaming return**
  - File: `apps/api/src/services/agents/orchestrator.ts` ⚪
  - Return `streamText` result directly (not awaited). Use `onFinish` callback for persistence.

- [ ] **Migrate chat route to SSE**
  - File: `apps/api/src/features/chat/route.ts` ⚪
  - Accept `RunAgentInput`, translate messages, pipe through AG-UI bridge, return SSE stream

- [ ] **Create AG-UI frontend client**
  - File: `apps/web/src/lib/ag-ui/client.ts` 🟢
  - `createAgentClient()` → `HttpAgent` instance

- [ ] **Create useAgentChat hook**
  - File: `apps/web/src/hooks/use-agent-chat.ts` 🟢
  - State management: messages, isLoading, pendingApproval, error
  - AG-UI event subscriptions, approve/reject/send actions

- [ ] **Update movie search UI**
  - File: `apps/web/src/components/movie-search.tsx` ⚪
  - Replace `chatSearch` with `useAgentChat()`, add streaming text, add TMDB confirmation button

- [ ] **Delete dead chat client**
  - File: `apps/web/src/lib/api/chat.ts` ❌
  - Remove entire file

- [ ] **Clean up dead contracts**
  - File: `packages/contracts/src/http/chat.ts` ⚪
  - Remove `chatRequestSchema`, `ChatRequest`, `chatResponseSchema`, `ChatResponse`
  - File: `packages/contracts/src/http/index.ts` ⚪
  - Remove chat exports

- [ ] **Write Phase 3 tests**
  - `apps/api/src/services/agents/message-translator.test.ts` — tests 12–15
  - `apps/api/src/services/agents/ag-ui-stream.test.ts` — tests 16–20
  - `apps/api/src/features/chat/route.test.ts` — tests 21–24 (replace existing)
  - `apps/web/src/hooks/use-agent-chat.test.ts` — tests 25–28
  - `apps/web/src/components/movie-search.test.tsx` — tests 29–34 (replace existing)

- [ ] **Verify Phase 3**
  - `pnpm typecheck` passes
  - `pnpm test` passes (all workspaces)
  - Manual: search "Stalker by Tarkovsky" → local results insufficient → "Search TMDB" button appears → click → movies found and displayed

---

## 5. Context: Current System Architecture

### Agent Orchestrator (`apps/api/src/services/agents/orchestrator.ts`)
- Uses `generateText()` with single `prompt: message` string
- Registers only `search_movies` tool
- Persists sessions, messages, runs, tool calls via `@repo/db` repositories
- System prompt: movie expert that extracts search params
- Step limit: `stepCountIs(5)`
- Returns `{ sessionId, response, toolResults }`
- **Limitation**: No TMDB tool, no streaming, no approval flow

### Chat Route (`apps/api/src/features/chat/route.ts`)
- `POST /api/v1/chat` — validates `chatRequestSchema` (message + sessionId), calls orchestrator, returns JSON
- User ID from `devAuth` middleware (`dev-user-001`)
- **Limitation**: No SSE streaming

### Search Movies Tool (`apps/api/src/features/tools/search-movies.ts`)
- `tool()` factory with structured input: title, director, actor, genre, year
- Delegates to `moviesRepository.searchStructured(input)`
- **Used as reference pattern** for search_tmdb tool

### Frontend Chat (`apps/web/src/components/movie-search.tsx`)
- Client component, form input, calls `chatSearch()` on submit
- Extracts movies from `toolResults` where `toolName === "search_movies"`
- No streaming, no tool confirmation UI
- **Limitation**: Replaced entirely by AG-UI in Phase 3

### TMDB Client (`packages/tmdb-client/`)
- Endpoints: `searchMovies`, `getMovieDetails`, `getPopularMovies`, + 4 new list endpoints (Phase 1)
- `mapTmdbMovieDetails(details)` mapper for DB-ready objects
- `TmdbClient` class with Bearer token auth

### Movies Repository (`packages/db/src/repositories/movies.ts`)
- `upsertFromTmdb(movie)` — conflict on `tmdbId`, updates all fields → dedup built in
- `searchStructured(params)` — title, director, actor, genre, year → ordered by popularity, limit 10

### Key Files

| File | Purpose |
|------|---------|
| `apps/api/src/services/agents/orchestrator.ts` | Agent loop — migrate to streamText + search_tmdb |
| `apps/api/src/features/tools/search-movies.ts` | Reference pattern for tool factory |
| `apps/api/src/features/chat/route.ts` | Chat endpoint — migrate to SSE |
| `apps/api/src/lib/ai-provider.ts` | `getModel()` — OpenRouter/Ollama dual provider |
| `packages/tmdb-client/src/index.ts` | `searchMovies`, `getMovieDetails`, `mapTmdbMovieDetails` |
| `packages/db/src/repositories/movies.ts` | `upsertFromTmdb`, `searchStructured` |
| `apps/web/src/components/movie-search.tsx` | Chat UI — replace with AG-UI hook |
| `apps/web/src/lib/api/chat.ts` | Current chat client — to be deleted |
| `apps/web/src/lib/api/client.ts` | `apiFetch()` wrapper — keep for non-chat endpoints |
| `packages/contracts/src/http/chat.ts` | `chatRequestSchema`, `ChatResponse` — to be removed |

---

## 6. Reference Implementations

| Pattern | File | Reuse |
|---------|------|-------|
| AI SDK tool factory | `apps/api/src/features/tools/search-movies.ts` | ⚪ Clone pattern for `search-tmdb.ts` |
| TMDB search endpoint | `packages/tmdb-client/src/endpoints/search-movies.ts` | ⚪ Used by search_tmdb tool |
| TMDB details endpoint | `packages/tmdb-client/src/endpoints/movie-details.ts` | ⚪ Used by search_tmdb tool per result |
| TMDB → DB mapper | `packages/tmdb-client/src/mappers.ts` (`mapTmdbMovieDetails`) | ⚪ Used by search_tmdb tool |
| Movie upsert | `packages/db/src/repositories/movies.ts` (`upsertFromTmdb`) | ⚪ Used by search_tmdb tool |
| Orchestrator loop | `apps/api/src/services/agents/orchestrator.ts` | ⚪ Migrate to streamText |
| Hono route handler | `apps/api/src/features/chat/route.ts` | ⚪ Modify for SSE |
| Frontend chat | `apps/web/src/components/movie-search.tsx` | ⚪ Replace internals with useAgentChat |
| API fetch client | `apps/web/src/lib/api/client.ts` | ⚪ Keep for non-chat endpoints |

---

## Notes

- **AI SDK v6** (`ai@^6.0.137`): `tool()` with `needsApproval`, `streamText()` with `stopWhen`. `tool-approval-request`/`tool-approval-response` are content part types. Verified in installed version.
- **AG-UI v0.0.48**: `@ag-ui/core` (types), `@ag-ui/encoder` (SSE), `@ag-ui/client` (HttpAgent + RxJS). No dedicated confirmation event — uses tool-call lifecycle + multi-turn pattern.
- **Zod 3/4 conflict**: `@ag-ui/core` depends on Zod 3, project uses Zod 4. AG-UI types used at boundary only. Custom Zod 4 schemas for validation.
- **Multi-turn approval flow**: First `streamText` → `tool-approval-request` → AG-UI TOOL_CALL without RESULT → frontend button → second request with approval → tool executes.
- **RxJS**: Regular dependency of `@ag-ui/client` (not a peer dependency). Installed automatically — no explicit install needed in `apps/web`.
- **No schema migrations**: All DB tables exist. No `pnpm db:generate` needed.
- **Hono SSE**: `streamSSE()` from `hono/streaming` or raw `ReadableStream` with `@ag-ui/encoder`.

## Resolved Questions

### 1. RxJS → React bridge

**No RxJS bridge needed.** `HttpAgent.runAgent()` returns `Promise<RunAgentResult>`, not an Observable. RxJS is internal only. The hook pattern is:

```ts
const agent = new HttpAgent({ url });
const { unsubscribe } = agent.subscribe({
  onTextMessageContentEvent({ textMessageBuffer }) { setText(textMessageBuffer); },
  onToolCallEndEvent(event, { toolCallName, toolCallArgs }) { /* track tool calls */ },
  onToolCallResultEvent(event) { /* parse results */ },
  onRunFinishedEvent() { setLoading(false); },
  onRunErrorEvent(event) { setError(event.error); },
  onMessagesChanged({ messages }) { setMessages([...messages]); },
});
await agent.runAgent({ tools: [...] });
// Cleanup: agent.abortRun(); unsubscribe();
```

Key: `agent.subscribe(subscriber)` returns `{ unsubscribe }` — use in `useEffect` cleanup. Agent instance manages `threadId`, `messages`, `state` internally. `runAgent()` takes only `RunAgentParameters` (partial: `runId?`, `tools?`, `context?`, `forwardedProps?`, `abortController?`).

### 2. AG-UI `RunAgentInput` exact shape

The full `RunAgentInput` (what the backend receives):

```ts
type RunAgentInput = {
  threadId: string;
  runId: string;
  messages: Message[];        // union type
  tools: Tool[];              // { name, description, parameters? }
  context: Context[];         // { value, description }
  parentRunId?: string;
  state?: any;
  forwardedProps?: any;
};
```

`Message` union: `UserMessage | AssistantMessage | SystemMessage | DeveloperMessage | ToolMessage | ActivityMessage | ReasoningMessage`

Key message types for the Zod 4 schema:
- **UserMessage**: `{ role: "user", id: string, content: string | InputContent[], name? }`
- **AssistantMessage**: `{ role: "assistant", id: string, content?: string, toolCalls?: ToolCall[] }`
- **ToolMessage**: `{ role: "tool", id: string, toolCallId: string, content: string, error? }`
- **ToolCall**: `{ id: string, type: "function", function: { name: string, arguments: string } }`

For the `ag-ui-schema.ts` Zod 4 schema, we only need `user`, `assistant`, and `tool` roles (the roles our chat uses).

### 3. streamText `onFinish` for persistence

**Confirmed.** `onFinish` callback signature: `(event: OnFinishEvent<TOOLS>) => PromiseLike<void> | void`

`event` provides:
- `event.text: string` — final generated text
- `event.steps: StepResult[]` — all steps with `toolCalls` and `toolResults` per step
- `event.totalUsage: LanguageModelUsage` — aggregate token usage

Can return a Promise (async DB writes are awaited). This is the canonical place for persistence in Phase 3.

**Impact on architecture**: In Phase 3, the orchestrator passes an `onFinish` callback to `streamText()` that persists assistant message + tool calls + run completion. The stream result is returned immediately to the route handler for piping through the AG-UI bridge.
