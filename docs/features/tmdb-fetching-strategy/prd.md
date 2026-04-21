# PRD: TMDB Fetching Strategy

## Why

- The local movie database currently contains only ~200 popular movies from an initial seed, severely limiting what users can discover through the AI agent.
- Users searching for niche, older, or less mainstream films get no results, making the app feel incomplete and unreliable.
- This feature introduces a two-pronged approach: a richer configurable seeding mechanism for baseline catalog coverage, and a live TMDB search tool that lets the AI agent fetch any movie on demand — making the catalog effectively unlimited.

## Result

### Acceptance Criteria

- [ ] A config file defines which TMDB sources to seed (popular, top_rated, trending, now_playing, upcoming) and how many pages per source
- [ ] Running the seed script imports movies from all configured sources with full details (credits, runtime)
- [ ] The TMDB client exposes new list endpoints: `getTopRatedMovies`, `getTrendingMovies`, `getNowPlayingMovies`, `getUpcomingMovies`
- [ ] The AI agent has a `search_tmdb` tool that queries TMDB, fetches full movie details, and upserts results into the local DB
- [ ] The agent does **not** call `search_tmdb` autonomously — it signals intent via an AG-UI tool-confirmation event when it judges local results are insufficient
- [ ] The frontend renders the AG-UI confirmation as a "Search TMDB for more results" button
- [ ] Clicking the button confirms the tool call, triggering the TMDB search and displaying newly found movies
- [ ] All movies fetched from TMDB are persisted with full details (cast, directors, runtime, genres)
- [ ] Duplicate movies (same tmdbId) are upserted, not duplicated

### Features

- Configurable seed script with support for multiple TMDB list endpoints
- New TMDB client endpoints for top_rated, trending, now_playing, upcoming
- New `search_tmdb` agent tool for live TMDB queries
- AG-UI foundation: streaming event protocol between backend and frontend
- AG-UI tool-confirmation flow: agent proposes `search_tmdb`, user approves via button
- Automatic persistence of all TMDB results with full movie details

### Visual

- **Chat UI**: After the agent returns local results, if it judges them insufficient, a "Search TMDB for more results" button appears below the response via AG-UI
- **Interaction**: Clicking the button confirms the pending tool call, shows a loading state, then new movie cards appear in the results grid
- **Post-search**: The button is disabled/hidden after the search completes or if the user starts a new query
- **API contract**: The `search_tmdb` tool returns the same `MovieDto` shape as local search results

### Interaction model: agent suggests, user confirms

The agent and user share responsibility for TMDB searches:

1. The agent searches the local DB first using `search_movies`
2. If the agent judges results are insufficient (see "Insufficiency criteria" below), it **proposes** a `search_tmdb` call rather than executing it
3. The backend emits an AG-UI `tool_call_confirmation` event containing the proposed tool name and arguments
4. The frontend renders this as a "Search TMDB for more results" button
5. The user clicks to confirm — the backend then executes `search_tmdb`
6. Results stream back and are displayed

This gives the user control over external API calls while leveraging the agent's judgment about when to suggest them.

### Insufficiency criteria

The agent uses LLM judgment to decide when to propose a TMDB search. The system prompt instructs it to propose `search_tmdb` when:
- Local search returned 0 results
- Local results don't match the user's apparent intent (e.g., asked for a specific movie by name but it wasn't found)
- The user explicitly asks to search for more movies or mentions TMDB

The agent should **not** propose TMDB search when:
- Local results appear to satisfy the query (e.g., user asked for "sci-fi movies" and got several)
- The conversation is not about finding movies

### Use cases / edge cases

**Main use cases:**
- User searches for a well-known movie not in the local DB → agent returns few/no local results → proposes TMDB search → user clicks button → movie is found, persisted, and displayed
- User searches for a niche foreign film → agent has no local match → proposes TMDB search → user clicks button → TMDB search finds it
- Developer wants to seed the DB with top-rated and trending movies → edits config file → runs seed script

**Edge cases:**
- TMDB API is down or rate-limited → agent tool returns an error → user sees a friendly error message
- TMDB search returns movies already in local DB → upsert updates existing records without duplication
- TMDB search returns 0 results → user is informed no additional movies were found
- Config file has invalid source names → seed script validates and reports errors before starting
- User clicks the TMDB button multiple times → subsequent clicks are debounced or disabled during loading
- User ignores the TMDB button and sends a new message → the pending confirmation is invalidated

### User Flows

| UF | Name | File |
|----|------|------|
| UF1 | Configurable movie seeding | [uf1-configurable-movie-seeding.md](./uf1-configurable-movie-seeding.md) |
| UF2 | TMDB search agent tool | [uf2-tmdb-search-agent-tool.md](./uf2-tmdb-search-agent-tool.md) |
| UF3 | AG-UI tool confirmation for TMDB search | [uf3-ag-ui-approval-tmdb-search.md](./uf3-ag-ui-approval-tmdb-search.md) |

*(Each UF is documented in its own file. See linked files for full specifications.)*

## Decisions

### Out of Scope

- Movie detail page (viewing full info for a single movie)
- User reviews and ratings
- Watchlist management
- Scheduled/periodic background sync (cron job) — only manual seed runs for now
- TMDB image caching or proxying — posters are loaded directly from TMDB CDN
- Multi-language TMDB support — English only for now
- Full authentication system — current dev-auth middleware (mocked userId) is sufficient for this feature; real auth is a separate concern

### Dependencies

- **AG-UI foundation**: This feature requires implementing the AG-UI event protocol between backend and frontend. There is currently **no AG-UI implementation** in the codebase. The streaming event layer and frontend consumer must be built as part of this work (see UF3 for scope).

## Technical Specification

### Architecture

- **TMDB client** (`packages/tmdb-client/`): New list endpoints — `getTopRatedMovies`, `getTrendingMovies`, `getNowPlayingMovies`, `getUpcomingMovies` — must be added alongside the existing `getPopularMovies` and `searchMovies`
- **Seed script** (`packages/db/src/seed.ts`): Refactored to read a config file and iterate over configured TMDB sources using the new TMDB client endpoints
- **Agent orchestrator** (`apps/api/src/services/agents/`): New `search_tmdb` tool registered alongside existing `search_movies`, configured to require user confirmation via AG-UI
- **AG-UI server** (`apps/api/`): New streaming endpoint that emits AG-UI events including `tool_call_confirmation` for pending tool approvals
- **AG-UI client** (`apps/web/`): Event consumer that renders AG-UI events, including the tool-confirmation button

### Libraries & tools

- **AG-UI protocol**: Event-based streaming protocol between backend agent and frontend. Must be implemented from scratch — no existing implementation exists in the codebase
- **@repo/tmdb-client**: Existing TMDB wrapper, extended with 4 new list endpoints
- **Drizzle ORM**: Existing upsert mechanism via `upsertFromTmdb` in movies repository

### Data Requirements

- **External data**: TMDB API (requires API key via `TMDB_API_KEY` env var)
- **Config file**: New `packages/db/seed.config.json` (or similar) defining sources and page counts
- **No schema changes**: The existing `movies` table already stores all fields needed from TMDB

### Rights & Permissions

| Permission | Description | User Roles |
|------------|-------------|------------|
| Seed execution | Run the seed script to populate the DB | Developer |
| TMDB search confirmation | Click the TMDB search button in chat UI | Any authenticated user (currently dev-mocked) |

### Testing strategy

- **Unit tests**: Config file parsing and validation, TMDB tool input/output mapping, new TMDB client endpoints
- **Integration tests**: Seed script with mocked TMDB responses, agent orchestrator with TMDB tool, AG-UI event emission for tool confirmation
- **E2E consideration**: Chat flow where local results are insufficient → AG-UI button appears → user confirms → TMDB results displayed

## Production strategy

- Monitor TMDB API usage to stay within rate limits (40 requests/10 seconds for free tier)
- Track metrics: number of TMDB searches triggered by users, local-vs-TMDB resolution ratio (how often queries need TMDB), new movies persisted per day
- Alert on TMDB API errors or sustained rate limiting
- Log all TMDB tool calls via existing `tool_calls` table for observability
