# Agent Layer Setup Plan (Deferred)

Prerequisite: `plans/setup-monorepo.md` completed. Working web app with movie search, full DX stack.

---

## Phase A — Auth foundation

**Goal**: Token-based auth baseline.

- [ ] Backend: JWT middleware — token parsing, validation, user extraction, reject invalid
- [ ] Frontend: token storage, API client injects bearer, unauthorized handling
- [ ] Env vars: `JWT_SECRET`, `JWT_ISSUER`

**Done when**: protected route rejects bad tokens, frontend calls protected routes.

---

## Phase B — AI SDK and agent foundation

**Goal**: Minimal backend-owned agent architecture.

- [ ] Install Vercel AI SDK + provider package
- [ ] `src/features/agents/` — agent entrypoint, orchestrator module
- [ ] `src/features/tools/` — tool registry
- [ ] One read-only tool (`searchMovies`) with schema-validated input using `@repo/tmdb-client`
- [ ] Persistence hooks for sessions/messages via `@repo/db`
- [ ] DB tables: `agent_sessions`, `chat_messages`, `agent_runs`, `tool_calls`, `tool_results`

**Done when**: backend runs minimal agent flow, tool callable, output persisted.

---

## Phase C — AG-UI integration

**Goal**: Streaming agent events to frontend.

- [ ] Backend: AG-UI endpoint(s)
- [ ] Wire AG-UI events to agent lifecycle
- [ ] Auth handling for AG-UI requests
- [ ] Frontend: AG-UI client/adapters in `src/lib/ag-ui/`

**Done when**: frontend receives AG-UI events, auth failures handled.

---

## Phase D — A2UI integration

**Goal**: Structured UI rendering through safe registry.

- [ ] Backend: A2UI payload builders
- [ ] Frontend: renderer registry in `src/lib/a2ui/`
- [ ] Map approved surface types to UI adapters
- [ ] Validation before rendering

**Done when**: backend emits structured UI, frontend renders through approved components only.

---

## Phase E — Background job infrastructure

**Goal**: Recurring job capability for super watchlist expiry.

- [ ] `apps/api/src/jobs/` — job runner
- [ ] `expireSuperWatchlistItems` job
- [ ] `POST /api/v1/jobs/expire-super-watchlist` internal endpoint

**Done when**: expiry job runs, cascades state changes.

---

## Phase F — Chat feature skeleton (vertical slice)

**Goal**: First end-to-end agent flow from input to rendered output.

- [ ] Chat page — input composer + message list
- [ ] Connect to backend orchestrator endpoint
- [ ] Persist session/messages
- [ ] Display streamed output + tool events
- [ ] Render at least one A2UI surface

**Done when**: user types query, gets agent response with tool results and UI blocks.

---

## Phase G — Agent layer documentation

**Goal**: Docs for humans and coding agents covering all agent-layer patterns.

- [ ] `docs/agent-architecture.md` — agent lifecycle, tool registration, orchestration flow, session/message persistence model, AG-UI event contract, A2UI payload contract. Written so a coding agent can add a new tool or agent feature without guessing.
- [ ] `docs/conventions.md` — update with agent-layer patterns: how to add a new tool, how to add an AG-UI event, how to add an A2UI surface type, how to add a background job
- [ ] `docs/packages.md` — update with any new packages or expanded API surfaces
- [ ] Update `CLAUDE.md` with agent-specific instructions and pointers to new docs

**Done when**: a coding agent can implement a new tool, AG-UI event, or A2UI surface by following the docs alone.
