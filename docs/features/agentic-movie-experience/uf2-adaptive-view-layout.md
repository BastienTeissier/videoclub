# UF2: Adaptive view layout

## Context

The same discovery surface needs to show movies as a grid, a side-by-side comparison, or a final "movie night plan" depending on what the user is trying to do. Rather than pre-baking three separate UI panels, the agent decides the layout per query by passing a `view` argument to the discovery tool. The frontend A2UI store keeps the data model intact across switches and only swaps the component graph — demonstrating the structure-vs-data separation that A2UI v0.9 exists to provide. The choice of `view` is observable in the AG-UI `TOOL_CALL_ARGS` event so the audience (and any future debugger) can see *which layout the LLM picked and why*.

## Specification

AAU (authenticated), after a tool result that listed movies (`discovery` grid, `watchlist_show`, or `review_show`), when I ask the agent to "compare the top 3" or "compare those":
- The agent re-issues the discovery tool with `view: "comparison"` and a shortlist of movie IDs
- The same surface (`surfaceId: "discovery"`) re-renders with `MovieComparisonTable` instead of `MovieGrid`
- Movies already loaded in the data model are reused; no fresh TMDB call unless I explicitly ask for new data
- The comparison columns include criteria the model judged relevant (e.g., runtime, mood, group-safety) — the criteria list comes from the tool's argument, also visible in the inspector
- After the table renders, the agent may invoke the `highlightComparisonCriteria` frontend tool to flash one or two columns

AAU (authenticated), after a tool result that listed movies, when I ask the agent to pick a movie for tonight ("OK pick one for tonight, plus a backup"):
- The agent re-issues the discovery tool with `view: "night-plan"`
- The surface re-renders with a `MovieNightPlan` component showing one primary pick, one or more backups, and a free-text `reason` the model wrote
- This surface is the input to the HITL approval flow in UF4 — once the surface renders, the run finishes with an `interrupt` outcome (handled in UF4)

AAU (authenticated), at any time, the inspector reflects the layout choice:
- The `TOOL_CALL_ARGS` event for the discovery tool shows the `view` parameter explicitly
- A subsequent `CUSTOM:a2ui` event shows the new `updateComponents` payload (the structure swap)
- A subsequent `CUSTOM:a2ui` may show a small `updateDataModel` patch (e.g., `/comparison/criteria`) but `/movies` is left intact

## Success Scenario

- AAU, when I have just run a grid discovery and ask "compare the top 3", I see the grid replaced by a 3-column comparison table within ~1s, populated with the same three movies
- AAU, when the comparison renders, columns for the criteria the agent chose (e.g., runtime, mood) are present
- AAU, when the agent decides one column is the most decisive, that column briefly flashes (highlighted by the frontend tool)

## Error Scenario

- AAU, if the LLM emits a `view` value not in the catalog (`{"view": "carousel"}`), the discovery tool silently falls back to `view: "grid"`, emits a `RUN_ERROR` warning to the inspector, and the user sees a grid layout
- AAU, if the comparison receives fewer than 2 movie IDs, it falls back to a grid; the agent narrates "I couldn't find enough movies to compare" in the chat

## Edge Cases

- AAU, if I switch from comparison back to grid (e.g., "show me more movies"), the surface re-renders as a grid and the data model preserves the previous shortlist for any subsequent compare command
- AAU, if I ask for night-plan without a prior comparison, the agent picks among the currently visible movies and emits a `MovieNightPlan` directly
- AAU, if the catalog is updated mid-session (developer hot-reload), running queries continue with the original catalog snapshot; new queries pick up the change
- AAU, the agent may call `showMovieDetails(movieId)` before or after a layout switch; this is independent of the surface state and opens a modal regardless of which view is active

## Acceptance Criteria

- [ ] The discovery tool accepts a `view: "grid" | "comparison" | "night-plan"` argument
- [ ] The argument value is included in the `TOOL_CALL_ARGS` AG-UI event for every discovery call
- [ ] Each `view` produces a distinct sequence of A2UI messages with the appropriate component name (`MovieGrid`, `MovieComparisonTable`, `MovieNightPlan`)
- [ ] When the surface already exists, `view` swaps emit `updateComponents` (structure swap) without rebuilding the data model for `/movies`
- [ ] The catalog includes `MovieComparisonTable` and `MovieNightPlan` with documented props and bindable paths
- [ ] An invalid `view` value falls back to `"grid"` and emits a warning event
- [ ] `MovieComparisonTable` reuses already-loaded movie data when the agent passes a subset of IDs already in the model
- [ ] The `highlightComparisonCriteria` frontend tool can be invoked after a comparison renders and visibly flashes the requested columns (delivered fully in UF5, surfaced here)

## Demo flow & LLM-behavior caveat

The canonical demo path for UF2 is **watchlist → comparison/night-plan**, not grid → comparison.

### Demo script

1. `add Inception to my watchlist` → confirm
2. `add The Grand Budapest Hotel to my watchlist` → confirm
3. `add Pulp Fiction to my watchlist` → confirm
   (or pre-seed via fixture and skip 1-3)
4. `show my watchlist` → `WatchlistGrid` surface renders
5. `compare the top 3 in my watchlist by runtime` → `MovieComparisonTable` surface renders alongside the watchlist (different `surfaceId`s, both stay visible)
6. (Optional) `pick one for tonight, plus a backup, give a short reason` → `MovieNightPlan` surface

### Why not `discovery` grid → comparison

The `discovery view=grid → discovery view=comparison` flow is **technically supported by the tool** (the dispatcher in `discovery.ts` accepts all three views from any caller context) but **unreliable in practice** due to LLM behavior:

- A turn-2 prompt like "compare the top 3 comedies" pattern-matches the model's "extract filters → call discovery" instinct so cleanly that even an explicit prompt rule saying "use IDs from the most recent tool result" loses to it.
- Symptom: the model issues a fresh `discovery view=grid` call (often with re-extracted filters that drop the original `maxRuntime` constraint), then `view=comparison` against IDs from that *new* grid. User sees a popularity-grid flash followed by a comparison of unrelated movies.
- Root cause is at the model-attention layer, not the tool/wiring layer: nested JSON in `tool` messages is lower-salience than assistant-authored prose, and there is no prose breadcrumb in the conversation listing what was just shown.

The watchlist→comparison flow sidesteps this entirely:

- `watchlist_show` is a different tool, with no filter parameters — the model has no learned "re-call with filters" pattern to misfire.
- The watchlist surface is a separate `surfaceId` from `discovery`, so the comparison renders *alongside* the watchlist instead of overwriting it. Demo composition is richer.

### Deferred robustness work (Plan A)

A "synthetic breadcrumb" approach — server persists a plain-text assistant message after each grid render listing titles + UUIDs — is documented in `uf2-plan.md` §8 as deferred follow-up. It would make the discovery→comparison flow robust enough to be a first-class demo path again, but is not required for the watchlist-based demo.
