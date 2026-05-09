# Context

Domain glossary for this codebase. When a deeper module is named after a concept, the concept lives here.

Use these terms exactly in code, plans, ADRs, and conversations. If a term feels fuzzy during design work, sharpen it here in the same step.

## Tool categories

The agent's tool registry has two categories of tools, distinguished by what their result represents on the wire:

### Mutation tool

A tool whose execution changes server-side domain state (review or watchlist rows) and returns a **MutationOutcome** envelope.

Current members: `review_delete`, `watchlist_add`, `watchlist_remove`.

Mutation tools may signal that input was ambiguous by returning a **needs-clarification** marker, which the stream layer converts into a **clarification interrupt** before reaching the client.

### Surface-emitting tool

A tool whose execution emits one or more A2UI protocol messages and whose own return value is a structured `data` payload for the LLM. The frontend reads from the A2UI store, not from the tool's return value.

Current members: `discovery`, `watchlist_show`, `review_show`, `review_prefill`, `commit_movie_night`.

`review_prefill` was previously named `review_add`. It builds a prefilled review form surface for the user to confirm; it does **not** persist a review. The actual review write happens via REST when the user submits the form.

## MutationOutcome

The envelope returned by every mutation tool. Three variants:

- **success** — the mutation occurred. Carries the affected client-side **domain keys** (so the frontend knows what to refetch), a user-facing message, and optionally the affected movie.
- **error** — the mutation could not be performed. Carries a structured error code and a user-facing message.
- **needs-clarification** — input resolved to multiple candidates. The stream layer translates this into a **clarification interrupt**; the client never sees this variant directly.

The envelope's depth comes from `affected: DomainKey[]` — the frontend dispatches refetches by reading this field instead of pattern-matching on tool name.

## DomainKey

The string identifier for a refetchable client-side domain collection. Currently `"watchlist" | "reviews"`. New domains add a member here, a refetcher on the frontend, and an entry in `useMovieState`; mutation tools then declare which domains they affect.

## Domain collection

A client-side store for a single domain (watchlist, reviews) with a shared lifecycle: initial fetch, refetch, and optimistic mutations with rollback. Implemented by the **`useDomainCollection`** primitive (`hooks/use-domain-collection.ts`), which owns the per-item request counter and the rule "only roll back if your counter is still the latest." Each domain context (`WatchlistProvider`, `ReviewProvider`) wraps the primitive with domain-specific state shape and API calls.

Optimistic updates only fire on direct UI actions (clicking bookmark, submitting review). Agent-driven mutations refetch via the **DomainKey** registry instead — they're already settled server-side by the time the frontend learns about them.

## Movie state

The unified read/write surface for "everything we know about one movie": watchlist membership, review rating, plus the actions that change them. Exposed by **`useMovieState(movieId)`** (`hooks/use-movie-state.ts`), which composes `useWatchlist` + `useReviews`. Consumers stop joining contexts manually; new movie-scoped domains extend this hook in one place.

## Clarification interrupt

A specific shape of AG-UI interrupt raised when a mutation tool resolves to multiple candidate movies. The interrupt's `proposed` field carries the candidates; the user's response selects one by `movieId`. On resume, the original tool is re-invoked with `movieId` set, bypassing the search phase.

This unifies "agent needs disambiguation" with "agent needs approval" (e.g. `commit_movie_night`) under one mechanism — `pendingInterrupt` on the client.

## Agent run

The unit of work between AG-UI `RUN_STARTED` and `RUN_FINISHED`. Owned by the **AgentRun** module (`services/agents/agent-run.ts`), which exposes two entry points:

- **`start`** — the user sent a fresh prompt. Resolve session, persist user message, configure `streamText`, yield AG-UI events.
- **`resume`** — the user responded to an interrupt. Look up the pending tool call by `interruptId`, merge the response into its input, invoke the tool, then re-enter `streamText` with the tool-result injected into the message history so the LLM continues reasoning. Yield AG-UI events.

Both paths share the same `onFinish` persistence, the same `streamAgUiEvents` translation, and the same toolset. The protocol-translation layer (`streamAgUiEvents`) stays pure — it never persists.

This replaces the previous split across `runOrchestrator`, `runApprovedTool`, and `buildApprovalStream`.
