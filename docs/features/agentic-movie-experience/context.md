# Handoff — Agentic Movie Experience

This is connective tissue for a fresh agent. It does not re-explain the work — it points to the artifacts that do, plus the few things that exist only in conversation history.

## 1. Why this work exists

The human is delivering a presentation roughly two weeks after **2026-05-08** about agentic UIs. The videoclub app is the demo. Everything in this feature folder was scoped to serve a single ~25-minute talk segment that builds the narrative:

> MCP gives the model arms → MCP Apps gives it a window → A2UI gives it a grammar of interface → AG-UI gives it a protocol of collaboration with the front.

The 4 scripted demo prompts and the user-mode → inspector-mode pivot that drives the layout are documented in [`prd.md`](./prd.md) under **Visual** and **Use cases / edge cases**. Build outlives the talk: A2UI/AG-UI scope (minus replay) is intended as durable architecture for future features.

## 2. Artifacts (canonical content)

| Path | Role |
|------|------|
| [`prd.md`](./prd.md) | Why, acceptance criteria, locked design decisions, out-of-scope, technical spec |
| [`agentic-movie-experience-plan.md`](./agentic-movie-experience-plan.md) | Macro plan: data model, architecture, tests, phased to-do (B-risk), context, references, resolved questions |
| [`uf1-progressive-movie-discovery.md`](./uf1-progressive-movie-discovery.md) | A2UI v0.9 + P3 staging + grids migration |
| [`uf2-adaptive-view-layout.md`](./uf2-adaptive-view-layout.md) | LLM-chosen `view` + structure-vs-data swap |
| [`uf3-persistent-viewing-preferences.md`](./uf3-persistent-viewing-preferences.md) | Memory + STATE_DELTA + silent use |
| [`uf4-approve-movie-night-plan.md`](./uf4-approve-movie-night-plan.md) | HITL interrupt + commit_movie_night |
| [`uf5-developer-inspector-mode.md`](./uf5-developer-inspector-mode.md) | LY3 toggle, inspector, activity, frontend tools, fixtures |

Don't re-derive these. If something feels missing, check the plan's §3 (Architecture) and §5 (To Do) before authoring new design.

## 3. In-flight code state (not in any artifact)

During this session the human edited four files mid-conversation. The plan accounts for them, but a fresh agent reading only the artifacts won't know these are *current state*, not pre-existing:

- `apps/api/src/services/agents/orchestrator.ts` — `review_show` registered (import + `tools` entry).
- `apps/web/src/lib/a2ui/registry.tsx` — `reviews-grid` renderer added to the tagged-union dispatch map.
- `apps/web/src/contexts/chat-results-context.tsx` — `ClarificationState.action` extended with `"review-delete"`.
- `apps/web/src/components/movie-search.tsx` — "My Reviews" quick-action button added above the chat input.

None of these conflict with the plan. They confirm the starting point: `review_show` already drives a tagged-union `reviews-grid`. Phase 1 of the plan migrates that surface to A2UI v0.9 protocol.

## 4. Decisions

All design decisions are locked. See:

- [`prd.md` § "Locked design decisions"](./prd.md) — 14 bullet-point decisions covering scope, transport, catalog, staging, AG-UI scope, memory, HITL, frontend tools, layout, activity timeline, demo mode, demo flow.
- [`agentic-movie-experience-plan.md` § "Resolved questions"](./agentic-movie-experience-plan.md) — 8 implementation-level resolutions (interrupt-mapping spike, wire-format extension point, search_movies hidden, region removed, JSON Patch adapter added, manual replay button, MovieCard overlays OK, catalog snapshot at createSurface).

If a decision feels unclear, it's resolved in one of those two lists. Don't re-open without explicit human prompt.

## 5. Cross-phase fallbacks (pre-agreed)

Listed in [`agentic-movie-experience-plan.md` § "Cross-phase fallbacks"](./agentic-movie-experience-plan.md). Triggered by failures in Phase 1 (drop reviews-grid migration), Phase 3 (keep H1 missing-result trick), Phase 4 (pre-inject memory client-side). The human approved these in advance — invoke without asking if the trigger condition fires during execution.

## 6. Out of scope

See [`prd.md` § "Out of Scope"](./prd.md). Notable exclusions a fresh agent might be tempted to add: replay/time-travel UI, capability-discovery endpoint, `review-form` migration to A2UI v0.9 (intentionally kept tagged-union as the "JSON maison" baseline), multi-user features, region filtering, memory rollback UI, approval-history view, card-level A2UI primitives, W3 round-trip frontend tools.

## 7. Where to start

Entry point: **Phase 0 of [`agentic-movie-experience-plan.md` §5](./agentic-movie-experience-plan.md)** — schema + repo + contracts + deps + migration. ~½ day. Verify gate: typecheck + `pnpm --filter @repo/db test` green.

Critical-path watch: **day 1 of Phase 3 must spike AI SDK's `tool-approval-request` behavior** before committing to H2. If the AI SDK doesn't surface approval requests reliably, fall back to H1 per §"Cross-phase fallbacks". This is the single highest-risk technical unknown in the build.

## 8. Operational notes

Local dev workflow per [`CLAUDE.md`](../../../CLAUDE.md): `pnpm db:up` → `pnpm db:migrate` → `pnpm dev`. Standard commands (`pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm depcruise`) gate phase verification.

**Validation loop**: see [`agentic-movie-experience-plan.md` §4 "Validation Loop"](./agentic-movie-experience-plan.md). Bootstraps in Phase 5 (~½ day), but golden traces get recorded incrementally during Phases 1, 2, 3, 4 as the protocol stabilizes. Use `pnpm validate` from Phase 5 onward as the phase verify gate. Re-record goldens (with `--record`) only when a code change *intentionally* alters event order/payload, and commit the new golden in the same patch.

Two new env flags introduced by this work, both documented in plan §3 E1, default off:

- `DEMO_MODE_SLEEP` — milliseconds between A2UI frames; recommended `700` during rehearsal, unset in production.
- `DEMO_MODE_FIXTURES` — set `true` to short-circuit tool execution to canned responses for the 4 scripted prompts (used by the "Replay last" inspector button and as a stage fallback).

Both must be off when the talk starts; only the dress-rehearsal pass with intentional sabotage uses them.

## 9. Deferred / implicit defaults

The human reviewed five validation questions when the PRD was first generated. Three were locked into the plan (search_tmdb HITL migration, `notes` cap of 8, approval-reject = no DB write). Two remain as implicit defaults the fresh agent may revisit if needed:

- **Memory keying.** Stored on `agent_sessions.viewing_preferences` (per-session); hydrated for a returning user by `findLatestByUserId`. Effectively per-user but coupled to session lifecycle. If this proves leaky, migrate to a separate `user_preferences` table.
- **Inspector event cap.** ~200 most recent events kept in the ring buffer. Tune if the demo runs longer than expected.

Neither is a blocker. Note them only.

## 10. What this file is not

- Not a re-summary of the design — read the PRD.
- Not an implementation guide — follow the plan.
- Not a substitute for [`CLAUDE.md`](../../../CLAUDE.md) — that has the project conventions and commands.

Update this file when (a) a session-only decision becomes durable, (b) artifacts diverge from on-disk state, (c) a fallback is invoked.
