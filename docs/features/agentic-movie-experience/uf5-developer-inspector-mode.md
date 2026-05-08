# UF5: Developer inspector mode

## Context

Most of what makes the agent powerful is invisible from the outside: which tools fired with which arguments, which A2UI messages built the surface, what state the agent is keeping, where it had to pause. The inspector mode is a togglable second view of the same UI that surfaces the full event stream, an activity timeline of named steps, and the always-visible memory panel — together making the protocol observable. This UF also delivers the two frontend tools (`showMovieDetails`, `highlightComparisonCriteria`) since they are most legible when their `(client-side)` annotation is visible in the inspector. Finally it includes the demo-mode fixture machinery (`DEMO_MODE_FIXTURES`) that makes the four scripted prompts deterministic for live presentation.

## Specification

AAU (authenticated), when I press Cmd+I (or Ctrl+I) anywhere in the app:
- The layout pivots from user-mode (~75% surface, Memory pinned top-right) to inspector-mode (~55% surface, right rail with Memory / Inspector / Activity stacked)
- The Memory panel persists in both modes (top-right area); only its size adjusts
- Pressing the shortcut again returns to user-mode
- The current surface, run state, and conversation are not interrupted by the toggle

AAU (authenticated), when inspector mode is active and a run is in progress, I see in the Inspector panel:
- `RUN_STARTED` and `RUN_FINISHED` events with `threadId`, `runId`, and (if applicable) the `interrupt` outcome
- `STEP_STARTED` / `STEP_FINISHED` events with the human-readable step name
- `TOOL_CALL_START` / `TOOL_CALL_ARGS` / `TOOL_CALL_END` / `TOOL_CALL_RESULT` events with truncated payloads (long JSON folds with a click-to-expand)
- `CUSTOM:a2ui` events with the protocol message body
- `STATE_SNAPSHOT` and `STATE_DELTA` events for memory changes
- `RUN_ERROR` events highlighted in red
- Frontend tool invocations annotated `(client-side)` so they are distinguishable from server tools
- Auto-scroll to latest event; older events scroll up

AAU (authenticated), when inspector mode is active, I see in the Activity Timeline panel:
- A vertical checklist of steps in order, stacked across multi-tool runs
- Status icons: ✓ done, ⏳ in progress, ○ pending
- Step names mapped from tool names (e.g., `search_movies` → "Searching local catalog"; `update_preferences` → "Updating memory"; `commit_movie_night` → "Committing tonight's plan")
- The synthetic "Parsing intent" step appears at the top of every run

AAU (authenticated), after a comparison surface is rendered, the agent may invoke frontend tools:
- `showMovieDetails(movieId)` — opens a movie detail modal/panel; the inspector logs `TOOL_CALL_START showMovieDetails (client-side)`
- `highlightComparisonCriteria(criteria)` — flashes the named columns of the visible comparison table for ~1.5s; the inspector logs `TOOL_CALL_START highlightComparisonCriteria (client-side)`

AAU (developer/presenter), when `DEMO_MODE_FIXTURES=true` is set in the API environment:
- The orchestrator short-circuits tool execution to canned results keyed on prompt text for the four scripted demo prompts
- Behavior is otherwise identical (event sequence, A2UI messages, Memory updates, HITL flow) — the audience cannot tell the difference
- Right after the user→inspector pivot, the user can re-issue Prompt 1 and see it complete in ~3s with the canonical fixture trace

## Success Scenario

- AAU, when I press Cmd+I during the demo, the layout switches in <300ms with no surface re-render
- AAU, when the agent runs through the climax prompt (Prompt 4), every protocol concept (RUN, STEP, TOOL_CALL, CUSTOM:a2ui, STATE_DELTA, interrupt outcome) shows up in the Inspector with no scroll-loss
- AAU, when the agent calls a frontend tool, the inspector annotates it `(client-side)` and the corresponding visual effect fires in the surface

## Error Scenario

- AAU, if the SSE connection drops mid-run, the inspector shows a `RUN_ERROR` entry and the Activity Timeline marks the in-progress step as ✗
- AAU, if `DEMO_MODE_FIXTURES=true` but the prompt text doesn't match any registered fixture, the orchestrator falls back to live execution and an inspector entry notes `fixture-miss: <prompt-hash>`
- AAU, if a frontend tool handler is missing for a tool name the server emitted, the inspector logs a `frontend-tool-not-registered` warning; the agent proceeds without waiting for a result (fire-and-forget)

## Edge Cases

- AAU, if I toggle inspector mode while a HITL approval dialog is open, the dialog stays visible in the new layout
- AAU, the inspector caps event display at the most recent ~200 events to keep the panel responsive; older events scroll out (no full history viewer in this scope)
- AAU, the inspector displays raw event JSON in a collapsed form by default; clicking expands the body inline
- AAU, the keyboard shortcut works regardless of focus context (typing in the chat input does not block it)
- AAU, the developer mode does not persist across page reloads — defaulting to user-mode keeps demos and end-user flows from accidentally exposing the rail

## Acceptance Criteria

- [ ] Cmd+I (Mac) / Ctrl+I (Win/Linux) toggles between user-mode and inspector-mode globally
- [ ] LY3 layout: user-mode shows ~75% surface + Memory; inspector-mode shows ~55% surface + Memory + Inspector + Activity stacked in the right rail
- [ ] Memory panel renders identically in both modes (top-right corner, sized appropriately)
- [ ] Inspector subscribes to all AG-UI events for the active run and renders `RUN_*`, `STEP_*`, `TOOL_CALL_*`, `CUSTOM`, `STATE_*`, `RUN_ERROR` with appropriate formatting
- [ ] Long event payloads (`TOOL_CALL_ARGS` > 200 chars, `TOOL_CALL_RESULT` > 200 chars, `CUSTOM:a2ui` > 200 chars) render truncated with click-to-expand
- [ ] Activity Timeline maps tool names to step labels using a single mapping table; unknown tools render with the tool name verbatim
- [ ] A synthetic "Parsing intent" step opens at `RUN_STARTED` and closes at the first `TOOL_CALL_START` or `TEXT_MESSAGE_START`
- [ ] Steps remain stacked across multiple tool calls within a run; the latest step is visually highlighted
- [ ] `showMovieDetails` and `highlightComparisonCriteria` are registered as server-side stub tools (no-op `execute` returning `null`) and as client-side handlers in a frontend-tools registry
- [ ] When the agent invokes a registered frontend tool, the client handler runs (fire-and-forget) and the inspector annotates the event `(client-side)`
- [ ] `DEMO_MODE_FIXTURES=true` short-circuits tool execution for the 4 scripted prompts; the event sequence and A2UI messages are indistinguishable from a live run
- [ ] A fixture-mode replay of Prompt 1 produces an identical event trace to the live execution recorded during dress rehearsal
- [ ] Capability discovery and replay/time-travel are documented as out of scope and represented only by slides during the talk
