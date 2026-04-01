# UF3: AG-UI Tool Confirmation for TMDB Search

**Notion ticket:** *(not created — `--db` and `--epic` not provided)*

## Context

When the agent returns local search results that are insufficient, it proposes a `search_tmdb` tool call rather than executing it autonomously. The frontend receives this proposal via the AG-UI protocol and renders it as a confirmation button. This gives the user control over when external API calls happen while leveraging the agent's judgment about when to suggest them.

**Prerequisite:** There is currently **no AG-UI implementation** in the codebase. This UF requires building the AG-UI foundation — a streaming event protocol between the backend agent and the frontend chat UI. The scope below covers both the foundation and the TMDB-specific confirmation flow.

## Specification

AAU (authenticated), when I search for movies via the agent and the results are insufficient:
- I see the agent's response with whatever local results it found
- Below the response, a "Search TMDB for more results" button appears (rendered from an AG-UI `tool_call_confirmation` event)
- When I click the button, a loading state is shown
- The confirmation is sent to the backend, which executes the `search_tmdb` tool (from UF2)
- New movie results stream back and appear in the results grid
- The button is disabled or hidden after the search completes

### AG-UI Integration

**Backend (AG-UI server):**
- The agent orchestrator emits AG-UI events over a streaming connection (e.g., SSE or WebSocket)
- When the agent proposes `search_tmdb`, the backend emits a `tool_call_confirmation` event with the tool name, arguments, and a confirmation ID
- On receiving user confirmation, the backend executes the tool and streams results back

**Frontend (AG-UI client):**
- The chat UI subscribes to the AG-UI event stream
- When a `tool_call_confirmation` event is received, it renders a button with the proposed action
- Clicking the button sends the confirmation back to the backend
- The frontend **never calls tools directly** — all tool execution happens on the backend (per architecture principle: backend owns all privileged logic)

### AG-UI foundation scope (for this feature)

The AG-UI implementation needed for this feature is:
- Streaming event transport (SSE recommended for simplicity)
- Event types: `text_delta`, `tool_call_start`, `tool_call_confirmation`, `tool_call_result`, `run_complete`, `error`
- Backend: event emitter integrated with the agent orchestrator
- Frontend: event consumer integrated with the chat component
- Contracts: AG-UI event schemas in `@repo/contracts`

Full AG-UI protocol (resumability, reconnect, etc.) is out of scope for this feature.

## Success Scenario

- AAU, when I ask "Show me movies by Bela Tarr" and only 1 local result exists, I see 1 movie card and a "Search TMDB for more results" button below
- AAU, when I click the button, I see a loading indicator, then additional movies by Bela Tarr appear from TMDB
- AAU, the newly found movies are added to the results grid alongside the original local result

## Error Scenario

- AAU, if the TMDB search fails after I click the button, I see an error message like "Could not reach TMDB — please try again later"
- AAU, if TMDB returns no additional results, I see a message like "No additional movies found on TMDB"

## Edge Cases

- AAU, if I click the button while it's already loading, nothing happens (debounced/disabled)
- AAU, if the agent returned 0 local results, the button still appears (the agent still proposes TMDB search)
- AAU, if I start a new search query, any previous TMDB confirmation button from an earlier response is invalidated and no longer clickable

## Acceptance Criteria

### AG-UI Foundation
- [ ] AG-UI event schemas are defined in `@repo/contracts` (at minimum: `text_delta`, `tool_call_start`, `tool_call_confirmation`, `tool_call_result`, `run_complete`, `error`)
- [ ] Backend emits AG-UI events over a streaming connection (SSE) from the agent orchestrator
- [ ] Frontend consumes the AG-UI event stream in the chat component
- [ ] The chat endpoint is migrated from JSON request/response to streaming

### TMDB Confirmation Flow
- [ ] When the agent proposes `search_tmdb`, the backend emits a `tool_call_confirmation` event
- [ ] The frontend renders the confirmation as a "Search TMDB for more results" button
- [ ] Clicking the button sends confirmation to the backend, which executes the tool
- [ ] Tool results stream back and are displayed as movie cards
- [ ] A loading state is shown while the TMDB search is in progress
- [ ] The button is disabled/hidden after the search completes
- [ ] Error states from TMDB are displayed as user-friendly messages
- [ ] Previous confirmation buttons are invalidated when the user sends a new message
