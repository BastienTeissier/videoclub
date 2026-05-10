# UF1: Progressive movie discovery

## Context

When the user types a discovery query into the chat (e.g., "I want a fun feel-good comedy under 2h"), the agent answers by emitting a sequence of A2UI v0.9 protocol messages rather than returning a single payload. The user sees the surface evolve through visible frames: the layout appears as a skeleton, the agent's parsed filters echo back, and finally the movie cards populate. Discovery is the flagship surface where progressive rendering and the "structure vs. data" separation are most visible. This UF also delivers the silent migration of `watchlist-grid` and `reviews-grid` to the same protocol — they don't get their own UFs because their tools always pick the same layout, but they live on the new A2UI plumbing.

## Specification

AAU (authenticated), when I type a natural-language discovery query, I see:
- A surface frame appears immediately containing a `MovieFilterPanel` placeholder and a `Skeleton` grid (5–10 placeholder cards), arranged in a `Column`
- Within ~700ms (controlled by `DEMO_MODE_SLEEP`), the filter panel populates with the parameters the agent extracted from my query (e.g., genres `Comedy`, max runtime `120`)
- The grid skeleton swaps to a `MovieGrid` with real movie cards as the data lands
- The total visible delay between submitting the query and seeing real results is the same as today (no extra latency in production mode), but there are now 3+ visible frames instead of one burst

AAU (authenticated), when I view the results:
- Each movie card renders the same poster, title, year, and bookmark overlay as today
- Sorting and counts match what `search_movies` returns
- Subsequent updates to the same surface (e.g., a follow-up query that refines results) update the data model without re-rendering the structure

AAU (authenticated), when I trigger the watchlist or reviews views:
- Both render via the same A2UI protocol — `createSurface` + `updateComponents` (Column + grid) + `updateDataModel("/items", ...)`
- Visually identical to today; the change is in the wire format and how the renderer dispatches

## Success Scenario

- AAU, when I type "feel-good comedy under 2h" and the agent successfully extracts `genres: ["Comedy"], maxRuntime: 120`, I see the filter chips appear with those values before the grid populates
- AAU, when local search returns enough results, the grid populates in a single frame after the filters echo
- AAU, when I view my watchlist, the grid appears via A2UI messages in the network trace, indistinguishable visually from today's behavior

## Error Scenario

- AAU, if the agent fails to extract any filters from my query, I see the filter panel render empty and a generic skeleton, then results (or an empty state) appear
- AAU, if the search tool errors mid-stream, the surface keeps the last frame it received (skeleton or filter echo) and a non-blocking error toast appears in the chat
- AAU, if the renderer encounters a component name not in the catalog, the surface skips that component (no crash) and the inspector logs a `catalog-drift` warning

## Edge Cases

- AAU, if `DEMO_MODE_SLEEP` is unset, frames flush at network speed; on fast connections the staging may flicker as ~150ms between frames — acceptable in production
- AAU, if I submit two queries rapidly, the second query creates a new run that updates the same `surfaceId` — the user sees the first frame replaced cleanly, not two stacked surfaces
- AAU, if a filter the agent echoes is not enforced by `search_movies` (e.g., `region`), the chip still displays — agent intent is shown even when downstream enforcement is partial
- AAU, if results are empty, the grid component renders an empty state rather than a Skeleton; the filter echo still happens

## Acceptance Criteria

- [ ] Discovery search emits at least 3 A2UI messages: `createSurface`, an `updateComponents` with skeleton, and at least one `updateDataModel` for `/movies`
- [ ] When the agent parses filters from the query, an `updateDataModel` for `/filters` is emitted *before* `/movies` (filters echo first)
- [ ] All A2UI messages travel as AG-UI `CUSTOM` events with `name: "a2ui"`
- [ ] The frontend A2UI store applies messages to per-surface state via JSON Pointer paths
- [ ] The catalog includes `Column`, `MovieFilterPanel`, `MovieGrid`, `Skeleton` (plus `MovieComparisonTable`, `MovieNightPlan` for UF2; `WatchlistGrid`, `ReviewsGrid` for the silent migration)
- [ ] `watchlist-grid` and `reviews-grid` surfaces are rendered through the A2UI protocol, replacing the tagged-union dispatch in `lib/a2ui/registry.tsx` for these two types
- [ ] `review-form` continues to render via the existing tagged-union path (intentionally not migrated)
- [ ] `DEMO_MODE_SLEEP=700` makes the staging visible; with the env unset, behavior degrades gracefully to network-paced rendering
- [ ] An unknown component name in `updateComponents` does not crash the renderer; it is logged to the inspector
- [ ] Visual regression: side-by-side with the previous tagged-union implementation, the watchlist and reviews grids look identical
