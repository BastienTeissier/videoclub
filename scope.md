# Movie Agent MVP — Implementation Spec

## Goal

Build a TypeScript MVP centered on a **single universal input bar** that lets a user manage their movie life through an orchestrator agent.

This MVP is **not recommendation-first**. Recommendation is a later extension. The first focus is:

1. Retrieve movies from fuzzy user input
2. Add/remove movies from a watchlist
3. Manage a constrained **super watchlist** (max 3 movies, 7-day commitment)
4. Mark movies as watched and attach notes/reviews
5. Support both **chat-driven** and **click-driven** interactions
6. Use the orchestrator to map user intent to the correct backend tool and render the correct UI through AG-UI and/or A2UI

---

## Product Summary

### Core UX principles

* All flows start from a **single input bar**
* The system may also expose **click actions** in the UI
* The orchestrator is responsible for:

  * intent detection
  * entity resolution
  * tool routing
  * deciding which UI block to render
  * asking clarifying questions when necessary
* Deterministic business rules must live in backend services, **not in the LLM**
* The UI may prefill actions based on chat input, but the user should validate final state-changing actions when useful

### Example behaviors

* User types: `the movie with Amy Adams and aliens`

  * app returns likely matches
* User types: `add it to my watchlist`

  * app adds the resolved movie to the watchlist
* User types: `I love Gladiator`

  * orchestrator interprets this as possible watched/review sentiment
  * UI displays a **prefilled review/note draft** for Gladiator
  * user validates before saving
* User clicks: `Add to watchlist`

  * action goes through same backend domain service as chat
* User clicks: `Mark watched`

  * UI can open a note/review composer with optional prefilled text

---

## Scope and Release Order

### Release 1 — Movie retrieval and details

A real user can:

* search movies with fuzzy natural language
* select among candidate matches
* open a movie detail view

Example queries:

* `the sci-fi movie with Amy Adams and aliens`
* `movie with dreams and DiCaprio`
* `show me Villeneuve movies`
* `tell me about Heat`

### Release 2 — Watchlist management

A real user can:

* add a movie to watchlist
* remove a movie from watchlist
* show watchlist
* use either chat or click actions

### Release 3 — Super watchlist commitment mechanic

A real user can:

* add a movie to the super watchlist
* see the 3 active slots
* see due dates/countdowns
* get blocked if trying to add a 4th active movie
* have expired movies removed automatically from both super watchlist and normal watchlist

### Release 4 — Watched history and notes

A real user can:

* mark a movie as watched
* add a note/review
* validate a prefilled note generated from free text input
* show watched history

### Release 5 — Recommendation as an additional intent

A real user can:

* ask for recommendations
* ask what to watch from watchlist/super watchlist
* get recommendations informed by watched history and notes

---

## Functional Requirements

## 1. Movie retrieval

The app must support retrieving movies even when the user does not know the exact title.

Supported search signals:

* title fragments
* actor names
* director names
* short plot/description
* genre or mood keywords
* combinations of the above

Expected behavior:

* return strong candidate matches with confidence
* if ambiguity remains, render a clarification picker rather than guessing silently
* allow the user to open full details for a selected movie

## 2. Watchlist

The app must support:

* add movie to watchlist
* remove movie from watchlist
* list watchlist
* prevent duplicates

## 3. Super watchlist

The app must support:

* max 3 active movies
* each movie added gets an expiration timestamp 7 days later
* if not watched before expiry, remove it from:

  * super watchlist
  * normal watchlist
* if watched before expiry, move it to watched history and remove from active lists

## 4. Watched history and notes

The app must support:

* mark movie as watched
* attach a note/review
* optionally attach rating later
* show watched history
* display previously saved notes

## 5. Input + click parity

Every core action should be triggerable from:

* natural language input
* button click / UI action

Examples:

* chat: `add Arrival to my watchlist`
* click: `Add to watchlist`

Both paths must end in the same domain service call.

## 6. Prefilled note/review flow

When user utterances imply opinion or watched-state, the app should offer a prefilled note/review.

Examples:

* `I love Gladiator`
* `Arrival was beautiful but too slow`
* `I watched Parasite yesterday, incredible ending`

Expected behavior:

* orchestrator resolves movie and sentiment-bearing content
* UI opens a review/note composer with prefilled content
* user explicitly validates before saving

---

## Non-Goals for the first MVP

* advanced collaborative filtering
* multi-agent autonomous reasoning swarm
* unrestricted arbitrary UI generation
* complicated user identity/account system
* production-grade recommendation science
* full long-term memory beyond explicit persisted state

---

## System Architecture

## High-level architecture

### Frontend

* Next.js
* React
* TypeScript
* shadcn/ui
* AG-UI client integration for streaming/event transport
* A2UI-compatible component mapping for declarative blocks

### Backend

* Node.js + TypeScript
* Hono or Fastify for API layer
* Orchestrator service
* Deterministic domain services/tools
* LLM used for intent parsing, extraction, and UI decision support only where useful

### Persistence

* PostgreSQL
* pgvector optional for later recommendation/search improvements
* Redis optional for ephemeral session state and streaming/session coordination

### External data

* TMDb API for movie metadata, search enrichment, posters, cast, director, runtime, synopsis

---

## Recommended monorepo structure

```txt
/apps
  /web
  /api
/packages
  /types
  /domain
  /orchestrator
  /ui-catalog
  /tmdb-client
  /movie-search
  /persistence
```

### Suggested internal layout

```txt
/apps/web
  /app
  /components
  /lib

/apps/api
  /src
    /routes
    /orchestrator
    /services
    /repositories
    /jobs
    /llm

/packages/types
/packages/domain
/packages/ui-catalog
/packages/tmdb-client
/packages/movie-search
/packages/persistence
```

---

## Domain Model

```ts
export type Movie = {
  id: string;
  tmdbId?: number;
  title: string;
  year?: number;
  synopsis?: string;
  genres: string[];
  cast: string[];
  directors: string[];
  runtime?: number;
  language?: string;
  posterUrl?: string;
  backdropUrl?: string;
  popularity?: number;
  releaseDate?: string;
};
```

```ts
export type WatchlistItem = {
  id: string;
  userId: string;
  movieId: string;
  addedAt: string;
};
```

```ts
export type SuperWatchlistItem = {
  id: string;
  userId: string;
  movieId: string;
  addedAt: string;
  expiresAt: string;
  status: "active" | "watched" | "expired" | "removed";
};
```

```ts
export type WatchedItem = {
  id: string;
  userId: string;
  movieId: string;
  watchedAt: string;
  note?: string;
  rating?: number;
  createdFrom?: "manual" | "prefill" | "chat" | "click";
};
```

```ts
export type AgentSession = {
  id: string;
  userId: string;
  lastResolvedMovieId?: string;
  context: Record<string, unknown>;
  updatedAt: string;
};
```

---

## Business Rules

These rules must be enforced in backend domain services.

### Rule 1 — No duplicate active watchlist entry

A movie cannot be inserted twice into the watchlist for the same user.

### Rule 2 — Super watchlist limit

A user may have at most 3 active super watchlist items.

### Rule 3 — Super watchlist expiry

When a movie is added to super watchlist:

* `expiresAt = addedAt + 7 days`

### Rule 4 — Expiry cascade

If a super watchlist item expires before being marked watched:

* mark super item as `expired`
* remove the corresponding movie from normal watchlist

### Rule 5 — Watched cascade

When a movie is marked watched:

* insert watched entry
* remove from watchlist if present
* remove from super watchlist if present
* mark super watchlist item status as `watched`

### Rule 6 — Review/note validation

Prefilled notes/reviews suggested from chat must not be auto-saved without user confirmation.

### Rule 7 — Same domain action path

Chat-triggered and click-triggered mutations must use the same backend service functions.

---

## Core Intents

```ts
export type Intent =
  | "movie_search"
  | "movie_details"
  | "watchlist_add"
  | "watchlist_remove"
  | "watchlist_show"
  | "super_watchlist_add"
  | "super_watchlist_remove"
  | "super_watchlist_show"
  | "watched_add"
  | "watched_show"
  | "note_prefill"
  | "note_save"
  | "recommendation"
  | "unknown";
```

### Intent examples

* `movie with Amy Adams and aliens` → `movie_search`
* `tell me about Gladiator` → `movie_details`
* `add Arrival to my watchlist` → `watchlist_add`
* `show my watchlist` → `watchlist_show`
* `put Dune in my super watchlist` → `super_watchlist_add`
* `what's in my super watchlist?` → `super_watchlist_show`
* `I watched Arrival` → `watched_add`
* `I love Gladiator` → `note_prefill` or `watched_add` + draft note depending on confidence

---

## Orchestrator Responsibilities

The orchestrator should be a single service that:

* accepts user message or UI action event
* classifies intent
* resolves entities (movie references, pronouns like `it`)
* chooses one or more tools
* returns structured UI instructions + assistant message
* may request clarification when there is not enough certainty

### Orchestrator flow

1. Receive input event
2. Load session context and latest resolved entities
3. Run intent + extraction
4. Resolve movie reference
5. Execute deterministic domain service(s)
6. Decide UI response block(s)
7. Stream AG-UI events and/or return A2UI block payloads

### Clarification policy

The orchestrator should ask clarification only when necessary, for example:

* multiple movie matches with similar confidence
* user says `add it` and there is no recent resolved movie
* note/review target is unclear

If multiple candidates exist, prefer showing a **clarification picker** rather than asking an open-ended textual question.

---

## Domain Services / Tools

These should be implemented as typed services callable by the orchestrator.

```ts
export type SearchMoviesInput = {
  query: string;
};

export type SearchMoviesOutput = {
  matches: Array<{
    movieId: string;
    title: string;
    year?: number;
    confidence: number;
    reason?: string;
  }>;
};
```

```ts
export type GetMovieDetailsInput = {
  movieId: string;
};
```

```ts
export type AddToWatchlistInput = {
  userId: string;
  movieId: string;
};
```

```ts
export type RemoveFromWatchlistInput = {
  userId: string;
  movieId: string;
};
```

```ts
export type AddToSuperWatchlistInput = {
  userId: string;
  movieId: string;
};
```

```ts
export type RemoveFromSuperWatchlistInput = {
  userId: string;
  movieId: string;
};
```

```ts
export type MarkWatchedInput = {
  userId: string;
  movieId: string;
  watchedAt?: string;
  note?: string;
  createdFrom?: "manual" | "prefill" | "chat" | "click";
};
```

```ts
export type SaveNoteInput = {
  userId: string;
  movieId: string;
  note: string;
  watchedAt?: string;
  rating?: number;
  createdFrom?: "manual" | "prefill" | "chat" | "click";
};
```

```ts
export type GetListInput = {
  userId: string;
};
```

### Required services

* `searchMovies`
* `getMovieDetails`
* `addToWatchlist`
* `removeFromWatchlist`
* `getWatchlist`
* `addToSuperWatchlist`
* `removeFromSuperWatchlist`
* `getSuperWatchlist`
* `markWatched`
* `saveNote`
* `getWatchedHistory`
* `expireSuperWatchlistItems`

---

## Search and Retrieval Strategy

## Phase 1 strategy

Use a hybrid deterministic search strategy:

1. title-based search
2. TMDb multi-search or search/movie calls
3. metadata filtering by actor/director/keywords if present
4. optional LLM-assisted query interpretation for fuzzy descriptions

### Search behavior

The `searchMovies` service should return:

* ranked candidates
* score/confidence
* brief reason such as:

  * `matched actor Amy Adams + alien contact plot`
  * `matched director Christopher Nolan`

### Recommendation for MVP

Keep search deterministic first. Use the LLM only to transform vague user phrasing into structured hints, not to invent movie candidates.

---

## UI Architecture

## AG-UI responsibilities

Use AG-UI for:

* streaming assistant messages
* progress/tool activity events
* action events from UI back to orchestrator
* in-place UI updates after mutations

## A2UI responsibilities

Use A2UI-compatible declarative blocks for a small trusted component catalog.

### Minimal component catalog

```ts
export type UiComponentType =
  | "movie_search_results"
  | "movie_detail_card"
  | "watchlist_panel"
  | "super_watchlist_panel"
  | "watched_history_panel"
  | "review_prefill_form"
  | "clarification_picker"
  | "confirmation_banner";
```

### Component behavior

#### `movie_search_results`

Shows ranked movie candidates with actions:

* View details
* Add to watchlist
* Add to super watchlist
* Mark watched

#### `movie_detail_card`

Shows:

* poster
* title/year
* synopsis
* cast/director
* runtime
* actions

#### `watchlist_panel`

Shows current watchlist with actions:

* Remove
* Promote to super watchlist
* Mark watched
* Get details

#### `super_watchlist_panel`

Shows 3 commitment slots with:

* movie card
* due date
* countdown badge
* remove/replace/mark watched actions

#### `watched_history_panel`

Shows watched items with:

* date watched
* saved note
* edit note action (optional later)

#### `review_prefill_form`

Shows:

* resolved movie
* editable prefilled note/review
* optional watched date
* confirm/cancel buttons

#### `clarification_picker`

Shows a small list of candidate movies for explicit user selection.

---

## Input and Click Interaction Model

Every interaction should normalize into a single action envelope.

```ts
export type UserInteraction =
  | {
      type: "chat_message";
      sessionId: string;
      userId: string;
      text: string;
    }
  | {
      type: "ui_action";
      sessionId: string;
      userId: string;
      action: string;
      payload: Record<string, unknown>;
    };
```

### Examples

#### Chat

```json
{
  "type": "chat_message",
  "sessionId": "s1",
  "userId": "u1",
  "text": "add Arrival to my watchlist"
}
```

#### Click

```json
{
  "type": "ui_action",
  "sessionId": "s1",
  "userId": "u1",
  "action": "watchlist.add",
  "payload": { "movieId": "m_arrival" }
}
```

The orchestrator should map both to the same domain service execution path.

---

## Prefilled Review / Note Flow

This is an important UX detail and should be implemented explicitly.

## Trigger conditions

If the user message includes:

* strong sentiment about a movie
* strong evidence they watched a movie
* a short review-like phrase

Examples:

* `I love Gladiator`
* `Gladiator was amazing`
* `I watched Arrival yesterday, beautiful and emotional`

## Flow

1. Detect target movie and sentiment-bearing text
2. Decide whether confidence is high enough to propose a draft
3. Render `review_prefill_form` with:

   * movie selected
   * prefilled note text
   * optional watched date inferred if present
4. User validates or edits
5. Backend saves the note and optionally marks watched

## Save semantics

* Do not auto-save from free text alone
* Require explicit confirm action
* If the user confirms `watched`, apply watched cascade rules

---

## Backend API Plan

## Public API endpoints

### `POST /api/orchestrator/respond`

Main entry point for chat input and UI actions.

Request:

```ts
{
  interaction: UserInteraction;
}
```

Response:

* AG-UI stream or structured response envelope containing assistant text, actions, and UI blocks

### `GET /api/watchlist`

Return current watchlist

### `GET /api/super-watchlist`

Return current super watchlist

### `GET /api/watched`

Return watched history

### `POST /api/jobs/expire-super-watchlist`

Internal/admin/cron endpoint to process expired super watchlist entries

## Internal service interfaces

Use service classes/functions rather than thin SQL directly from route handlers.

Example:

```ts
class WatchlistService {
  async add(userId: string, movieId: string): Promise<void> {}
  async remove(userId: string, movieId: string): Promise<void> {}
  async list(userId: string): Promise<WatchlistItem[]> {}
}
```

---

## Persistence and Schema Notes

### Tables

* `movies`
* `watchlist_items`
* `super_watchlist_items`
* `watched_items`
* `agent_sessions`

### Suggested constraints

* unique `(user_id, movie_id)` on `watchlist_items`
* partial/controlled uniqueness for active `super_watchlist_items`
* indexes on `user_id`, `movie_id`, `expires_at`

### Suggested super watchlist DB rule approach

Application-level enforcement is acceptable for MVP, but also add indexes to help consistency.

---

## Background Job

A recurring job must process super watchlist expiry.

### Job behavior

* find active super watchlist items with `expiresAt < now()`
* mark them expired
* remove related watchlist item
* optionally emit an event for UI notification later

### Frequency

* every hour is enough for MVP

---

## Suggested Implementation Order

## Milestone 1 — first real-user testable build

User can:

* search for a movie from fuzzy text
* open movie details
* add/remove from watchlist
* show watchlist

### Acceptance criteria

* query like `movie with Amy Adams and aliens` returns Arrival among top results
* user can click `Add to watchlist`
* user can type `show my watchlist`
* watchlist updates immediately

## Milestone 2 — super watchlist

User can:

* add up to 3 movies
* see countdown/due date
* get blocked on the 4th

### Acceptance criteria

* adding a 4th active movie returns a deterministic error state/UI
* due dates are visible

## Milestone 3 — watched + notes + prefill

User can:

* mark movie watched
* add note manually
* validate a prefilled note from chat text
* see watched history

### Acceptance criteria

* `I love Gladiator` opens a prefilled note form for Gladiator
* confirmation persists note
* watched/super/watchlist cascades behave correctly

## Milestone 4 — richer AG-UI / A2UI orchestration

User can:

* do everything from one input bar
* use click shortcuts from rendered panels
* see the correct UI blocks rendered dynamically

---

## Coding Guidelines for the Implementing Agent

* Keep business logic deterministic and outside prompts
* Use structured outputs for intent/extraction if LLM is involved
* Keep the UI component catalog intentionally small
* Prefer explicit typed payloads between frontend, orchestrator, and services
* Avoid true multi-agent architecture in this phase
* Reuse the same service calls for click and chat mutations
* Store enough session context to resolve pronouns like `it` and support follow-up actions
* Log all state-changing operations for debugging

---

## Suggested Initial Tasks

1. Scaffold monorepo with web, api, shared packages
2. Define shared types for domain, intents, UI payloads, and interactions
3. Implement TMDb-backed movie search and movie details retrieval
4. Implement watchlist persistence + UI
5. Implement orchestrator intent routing for search/details/watchlist intents
6. Implement super watchlist domain rules + expiry job
7. Implement watched history + note save flow
8. Implement prefilled review form flow for sentiment-bearing movie utterances
9. Add AG-UI streaming + A2UI block rendering for the small component catalog
10. Add recommendation later as a separate intent family

---

## Final Build Target

A user should be able to stay in one unified interface and do all of the following:

* search a movie without knowing the title exactly
* inspect details
* add it to a watchlist
* promote it to a 3-slot super watchlist with a 7-day commitment
* mark it watched
* save a note/review, including from a prefilled draft suggested by the agent
* ask to see watchlist, super watchlist, watched history, or movie details from the same input bar

This is the MVP target. Recommendation can be layered on top once the personal movie management loop is working end-to-end.

