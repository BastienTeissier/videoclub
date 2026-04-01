# UF2: TMDB Search Agent Tool

**Notion ticket:** *(not created — `--db` and `--epic` not provided)*

## Context

The AI agent currently only has a `search_movies` tool that queries the local database. When local results are insufficient for a user's query, the agent has no way to find additional movies. This UF adds a `search_tmdb` tool that searches TMDB live, fetches full details, and persists results to the local DB.

**Important:** The agent does **not** execute `search_tmdb` autonomously. When it judges local results are insufficient, it proposes the tool call, which is surfaced to the user as a confirmation button via the AG-UI protocol (see UF3). The tool only executes after user confirmation.

## Specification

AAU (authenticated), when I ask the agent about a movie that's not in the local database:
- The agent first searches the local DB using the existing `search_movies` tool
- If the agent judges the results are insufficient (too few or not matching the query), it **proposes** a `search_tmdb` call
- The proposed call is surfaced to me as a "Search TMDB for more results" button (see UF3)
- When I confirm, the `search_tmdb` tool queries TMDB's search endpoint with the user's query
- For each result, it fetches full movie details (credits, runtime, genres)
- All results are upserted into the local DB
- The tool returns the newly persisted movies as `MovieDto[]`

### Tool definition

```
Tool: search_tmdb
Parameters:
  - query: string (required) — the search query to send to TMDB
  - page: number (optional, default 1) — TMDB result page
Returns: MovieDto[] — movies found, with full details, persisted to local DB
Requires: user confirmation via AG-UI tool_call_confirmation event
```

### System prompt guidance

The system prompt instructs the agent to:
- Always try `search_movies` (local DB) first
- Propose `search_tmdb` when local results return 0 matches, don't match the user's apparent intent, or when the user explicitly requests broader search
- **Not** propose `search_tmdb` when local results appear to satisfy the query

## Success Scenario

- AAU, when I ask "Have you heard of the movie Stalker by Tarkovsky?" and it's not in the local DB, the agent proposes a TMDB search, I confirm it, and the movie is found, persisted with full credits, and displayed
- AAU, when the agent uses `search_tmdb`, the tool call is logged in the `tool_calls` table with input query and output results

## Error Scenario

- AAU, if TMDB API is unreachable, the agent receives an error from the tool and informs me that external search is temporarily unavailable
- AAU, if TMDB returns no results for the query, the agent tells me no additional movies were found matching my criteria
- AAU, if TMDB rate limit is hit, the tool returns a rate-limit error and the agent communicates this gracefully

## Edge Cases

- AAU, if the TMDB search returns movies already in the local DB, they are updated (upserted) without creating duplicates
- AAU, if the TMDB search returns many results, only the first page (20 results) is processed to avoid excessive API calls
- AAU, if the agent has already returned sufficient local results, it does not propose `search_tmdb` unnecessarily
- AAU, if I ignore the confirmation button and send a new message, the pending `search_tmdb` proposal is invalidated

## Acceptance Criteria

- [ ] A `search_tmdb` tool is registered in the agent orchestrator alongside `search_movies`
- [ ] The tool is configured to require user confirmation (not auto-executed by the agent)
- [ ] The tool calls TMDB's search endpoint and fetches full details for each result
- [ ] All results are upserted to the local DB via `upsertFromTmdb`
- [ ] The tool returns `MovieDto[]` matching the existing response format
- [ ] The system prompt instructs the LLM to propose `search_tmdb` when local results are insufficient
- [ ] Tool calls are persisted in the `tool_calls` table
- [ ] TMDB API errors are handled gracefully with user-friendly messages
- [ ] The TMDB client has a `searchMovies` endpoint available (already exists in `@repo/tmdb-client`)
