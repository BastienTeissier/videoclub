# UF4: Approve a movie-night plan with edits

## Context

Some agent actions deserve a human gate. In this app the gate is "commit tonight's movie pick" — once committed, the plan is persisted to a `movie_night_plans` table and there's no UI to undo. This UF wires the AG-UI human-in-the-loop pattern correctly: the run finishes with an `interrupt` outcome that declares a `responseSchema`, the frontend renders an approval dialog *from* that schema, and the user can approve, approve-with-edits, or reject. The flagship "approve with edits" branch lets the user refine the agent's free-text `reason` before commit, which is the part that makes the demo memorable. Replaces the existing "missing TOOL_CALL_RESULT" trick that today signals the `search_tmdb` approval.

## Specification

AAU (authenticated), when I ask the agent to pick a movie for tonight ("OK pick one for tonight, plus a backup"):
- The agent renders a `MovieNightPlan` A2UI surface (per UF2) with a primary pick, one or more backups, and a free-text `reason` the agent wrote (e.g., "fits your runtime constraint and matches the feel-good notes")
- The run finishes with `RUN_FINISHED { outcome: { type: "interrupt", interrupts: [...] } }`
- An approval dialog appears, populated from the interrupt's `responseSchema`:
  - The proposed plan summary (movie titles + reason)
  - An editable `reason` text field, prefilled with the agent's value
  - "Approve" and "Reject" buttons

AAU (authenticated), when I review the proposed plan:
- I can edit the `reason` field freely
- I can click "Approve" — a new run starts carrying my (possibly edited) response; the plan is persisted; a confirmation toast appears
- I can click "Reject" — a new run starts carrying `{ approved: false }`; no DB write; the agent acknowledges in chat ("Got it, I won't commit this plan")

AAU (authenticated), in inspector mode:
- I see the `RUN_FINISHED` event with the full `interrupt` payload
- I see the new `RUN_STARTED` event after I click approve or reject, carrying the approval response
- I see the `TOOL_CALL_RESULT` for `commit_movie_night` with the persisted row
- The Activity timeline shows steps: "Preparing tonight's plan" → "Awaiting approval" (paused) → "Committing tonight's plan"

## Success Scenario

- AAU, when I edit the reason from "fits your runtime constraint" to "because Alice is tired and Dune fits the runtime" and click Approve, a new row in `movie_night_plans` is created with my edited reason
- AAU, when I click Reject, no row is created; the chat shows the agent acknowledging
- AAU, if I'd already issued multiple discovery queries before asking for a plan, the agent's pick is grounded in the most recent shortlist and the reason references it

## Error Scenario

- AAU, if the persistence step fails after I approve, the next run emits `RUN_ERROR` with a clear message; the chat surfaces "Couldn't save tonight's plan, please try again"; my edited reason is preserved in the dialog so I can retry without re-typing
- AAU, if I submit an approval response that violates the `responseSchema` (e.g., `editedReason` exceeds a length cap), the server returns 422 with the schema diff; the dialog shows the field-level error inline
- AAU, if the run is interrupted by network failure before persistence, the interrupt remains pending in the database; on page reload, the dialog re-renders from the stored interrupt state

## Edge Cases

- AAU, if I dismiss the approval dialog without clicking either button (e.g., pressing Escape or closing the tab), the interrupt stays pending; reopening the conversation shows the dialog again
- AAU, if I approve twice rapidly (double-click), only the first approval persists; the second is rejected as "no pending interrupt for this run"
- AAU, if the agent proposes a plan with a single movie and no backups, the dialog still allows approval; the `backup_movie_ids` column stores an empty array
- AAU, if the user is not authenticated when approval round-trips, the run fails with an auth error; no plan is persisted

## Acceptance Criteria

- [ ] A new tool `commit_movie_night` exists with `needsApproval: true`, accepting `{ pickedMovieId, backupMovieIds, reason }`
- [ ] When `commit_movie_night` is called, the orchestrator emits `RUN_FINISHED { outcome: { type: "interrupt", interrupts: [{ id, reason, message, proposed, responseSchema }] } }` instead of finishing normally
- [ ] The `responseSchema` declares `{ approved: boolean, editedReason?: string }` with `approved` required
- [ ] The frontend approval dialog renders from the schema (form fields are derived, not hardcoded for this case alone)
- [ ] On Approve: a new run is started carrying the user's response as a tool message; `commit_movie_night` resumes with the user-supplied response; a row is inserted into `movie_night_plans` with the (possibly edited) `reason`
- [ ] On Reject: a new run is started; no row is inserted; the agent acknowledges in chat
- [ ] A new table `movie_night_plans` exists with columns: `id`, `user_id`, `picked_movie_id`, `backup_movie_ids[]`, `reason`, `created_at`
- [ ] Inspector shows the full lifecycle: `RUN_FINISHED { outcome: interrupt }` → user response → `RUN_STARTED` → `TOOL_CALL_START commit_movie_night` → `TOOL_CALL_RESULT` → `RUN_FINISHED`
- [ ] The Activity timeline shows the "Awaiting approval" step in a paused state until the user resolves the dialog
- [ ] The existing `search_tmdb` HITL flow is migrated to the same interrupt pattern (no behavior regression)
- [ ] Schema-violating responses are rejected with a 422; the dialog shows field-level errors and preserves user input
