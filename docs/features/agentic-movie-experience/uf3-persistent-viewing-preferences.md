# UF3: Persistent viewing preferences

## Context

A movie-discovery agent that forgets between turns has to be re-told everything on each query. This UF gives the agent a small, structured memory of the user's viewing taste that survives across runs and sessions. The memory is captured by the agent through a dedicated `update_preferences` tool, mirrored to the user via a front-of-screen Memory panel, and applied silently on later queries — a follow-up question like "find me something for tonight" should pick up genres, runtime constraints, and free-text notes without the user having to repeat them. This is the AG-UI side of the demo: `STATE_SNAPSHOT` at run start, `STATE_DELTA` per update, with the durable store on the server side.

## Specification

AAU (authenticated), when I mention something durable about my taste in chat (e.g., "I want a feel-good comedy under 2h"):
- The agent calls `update_preferences` with a partial diff (e.g., `{ genres: ["Comedy"], maxRuntime: 120, notes: ["likes feel-good"] }`)
- The Memory panel pinned in the top-right (visible in both user-mode and inspector-mode) reflects the new state within ~200ms of the tool call
- Updated keys briefly highlight (1.5s flash) so I can see what changed
- The conversation continues; the search proceeds normally

AAU (authenticated), when I add more context across the conversation (e.g., "we're 4 friends, no horror please"):
- The agent calls `update_preferences` again with another diff (e.g., `{ notes: [...prev, "group of 4", "no horror"] }`)
- The notes list grows; the Memory panel reflects the additions
- The agent may decide *not* to re-run search if my message only adds context — the panel updates without a redundant grid re-render

AAU (authenticated), when I issue a follow-up query that omits constraints (e.g., "find me something for tonight"):
- The agent reads the current memory snapshot (loaded by the orchestrator into the system prompt at run start)
- Search arguments include remembered preferences (e.g., `genres: ["Comedy"]`) without the user having said "comedy" in this turn
- A small `memory-applied` event briefly highlights the keys the agent used in the Memory panel
- Results match the remembered taste

AAU (authenticated), when I view the Memory panel:
- I see structured keys: `genres`, `maxRuntime`, `moods`
- I see a free-text `notes` list (most recent at top, capped at 8 entries)
- I do not see a way to manually edit or clear memory in this scope (out of scope for this UF)

## Success Scenario

- AAU, when I tell the agent twice in the same conversation that I prefer short movies, the second `update_preferences` call merges the value cleanly (no duplicate notes; structured `maxRuntime` overwrites)
- AAU, when I close the page and return later, the Memory panel still shows my preferences (memory persists across sessions for the same user)
- AAU, when I issue a follow-up that contradicts memory (e.g., "actually I want a long epic"), the agent overrides for the current query and may call `update_preferences` to revise the stored value

## Error Scenario

- AAU, if the `update_preferences` write fails (DB error), the Memory panel does not update and the inspector shows a `STATE_DELTA` failure event; the conversation continues; on the next run, memory reads the last successful snapshot
- AAU, if the agent applies memory poorly on stage (e.g., picks too narrow a filter), `DEMO_MODE_FIXTURES` ensures the rehearsed result for Prompt 3; outside demo mode, results may vary

## Edge Cases

- AAU, if the agent submits a partial diff with `null` for a field, the value is cleared (set to undefined in the JSONB)
- AAU, if I issue a query that the agent decides should *not* use memory (e.g., "show me anything different"), the agent may skip injecting preferences for that turn — visible in the inspector by the absence of a `memory-applied` event
- AAU, if memory is empty (first run), `STATE_SNAPSHOT` emits `{}`; the Memory panel shows an empty state ("No preferences captured yet")
- AAU, if the `notes` array would exceed 8 entries, the oldest entry is evicted before the write

## Acceptance Criteria

- [ ] `agent_sessions` table has a `viewing_preferences` JSONB column, default `'{}'`, populated per user
- [ ] An `update_preferences` tool exists, exposed to the LLM, with a Zod schema accepting `{ genres?, maxRuntime?, moods?, notes? }` as a partial diff
- [ ] The orchestrator emits `STATE_SNAPSHOT` once per run, immediately after `RUN_STARTED`, carrying the current memory
- [ ] Each `update_preferences` invocation produces a `STATE_DELTA` event whose body is a valid JSON Patch describing only what changed
- [ ] The orchestrator injects the current memory into the system prompt for every run in a stable, structured form
- [ ] On a follow-up query that omits constraints, the agent's `search_movies` call includes arguments derivable from memory; this is verified in `TOOL_CALL_ARGS`
- [ ] When memory keys are *read* (not written), the orchestrator emits a `CUSTOM` event named `memory-applied` carrying the list of keys; the Memory panel highlights those keys briefly
- [ ] The Memory panel renders structured keys and a notes list, capped at 8 entries
- [ ] The Memory panel is always visible in both LY3 modes (top-right corner)
- [ ] Memory persists across sessions for the same user
