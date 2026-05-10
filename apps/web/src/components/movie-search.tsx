"use client";

import { useState, useEffect, useRef, type FormEvent } from "react";
import { Input, Button } from "@repo/ui";
import {
  wireMutationOutcomeSchema,
  clarificationProposedSchema,
  commitMovieNightProposedSchema,
  SURFACE_IDS,
  type MovieDto,
  type SurfaceId,
} from "@repo/contracts";
import { useAgentChat } from "@/hooks/use-agent-chat";
import { useDomainRefetchers } from "@/lib/domain-refetchers";
import { A2UIRenderer } from "@/lib/a2ui/registry";
import { useA2UISurface } from "@/lib/a2ui/store";
import { ApprovalDialog } from "./approval-dialog";
import { MovieNightSummary } from "./movie-night-summary";

export function MovieSearch() {
  const [query, setQuery] = useState("");
  const {
    isLoading,
    error,
    pendingInterrupt,
    interruptIssues,
    toolResults,
    messages,
    sendMessage,
    respondToInterrupt,
    cancelInterrupt,
  } = useAgentChat();

  const refetchers = useDomainRefetchers();

  const discoverySurface = useA2UISurface(SURFACE_IDS.discovery);
  const watchlistSurface = useA2UISurface(SURFACE_IDS.watchlist);
  const reviewsSurface = useA2UISurface(SURFACE_IDS.reviews);
  const reviewFormSurface = useA2UISurface(SURFACE_IDS.reviewForm);

  const prevToolResultsRef = useRef<typeof toolResults | null>(null);

  // Mutation tools (review_delete, watchlist_add, watchlist_remove) return
  // `MutationOutcome` envelopes. On `kind: "success"`, refetch the affected
  // domains via the registry. Errors surface in the LLM's reply.
  // Clarification doesn't reach this hook — it's an interrupt now.
  useEffect(() => {
    if (toolResults.length === 0) return;
    if (toolResults === prevToolResultsRef.current) return;
    prevToolResultsRef.current = toolResults;

    for (const tr of toolResults) {
      if (
        tr.toolName !== "review_delete" &&
        tr.toolName !== "watchlist_add" &&
        tr.toolName !== "watchlist_remove"
      ) {
        continue;
      }
      const parsed = wireMutationOutcomeSchema.safeParse(tr.result);
      if (parsed.success && parsed.data.kind === "success") {
        for (const domain of parsed.data.affected) {
          void refetchers[domain]?.();
        }
      }
    }
  }, [toolResults, refetchers]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    sendMessage(query.trim());
    setQuery("");
  }

  function handleInterruptClarificationPick(movie: MovieDto) {
    if (!pendingInterrupt) return;
    void respondToInterrupt(pendingInterrupt.id, { pickedMovieId: movie.id });
  }

  const interruptCandidates: MovieDto[] | null = (() => {
    if (!pendingInterrupt || pendingInterrupt.reason !== "clarification") {
      return null;
    }
    const parsed = clarificationProposedSchema.safeParse(
      pendingInterrupt.proposed,
    );
    return parsed.success ? parsed.data.candidates : null;
  })();

  const approvalSummary = (() => {
    if (!pendingInterrupt || pendingInterrupt.reason !== "approval") return null;
    const parsed = commitMovieNightProposedSchema.safeParse(
      pendingInterrupt.proposed,
    );
    if (!parsed.success) return null;
    return (
      <MovieNightSummary
        pickedMovieId={parsed.data.pickedMovieId}
        backupMovieIds={parsed.data.backupMovieIds}
      />
    );
  })();

  const isApproval = pendingInterrupt?.reason === "approval";

  const hasProtocolSurface =
    !!discoverySurface ||
    !!watchlistSurface ||
    !!reviewsSurface ||
    !!reviewFormSurface;

  const shouldRenderText = !hasProtocolSurface && !pendingInterrupt;
  const lastAssistantText = shouldRenderText
    ? (() => {
        for (let i = messages.length - 1; i >= 0; i--) {
          const m = messages[i]!;
          if (m.role === "assistant" && m.content.trim().length > 0) return m.content;
        }
        return null;
      })()
    : null;

  const surfaceIds: SurfaceId[] = [
    ...(discoverySurface ? [SURFACE_IDS.discovery] : []),
    ...(watchlistSurface ? [SURFACE_IDS.watchlist] : []),
    ...(reviewsSurface ? [SURFACE_IDS.reviews] : []),
  ];
  const isMulti = surfaceIds.length > 1;

  return (
    <div className={`w-full mx-auto ${isMulti ? "max-w-6xl" : "max-w-2xl"}`}>
      <div className="max-w-2xl mx-auto">
        <form onSubmit={handleSubmit}>
          <Input
            type="text"
            placeholder="what do you want to watch? Try: check my watchlist"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full"
          />
        </form>

        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => sendMessage("show my reviews")}
            disabled={isLoading}
          >
            My Reviews
          </Button>
        </div>
      </div>

      <div className="mt-6">
        {isLoading && !hasProtocolSurface && !pendingInterrupt && (
          <p className="text-sm text-muted">Thinking...</p>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        {isApproval && pendingInterrupt && (
          <ApprovalDialog
            interrupt={pendingInterrupt}
            open
            isSubmitting={isLoading}
            issues={interruptIssues}
            summary={approvalSummary}
            onSubmit={(response) =>
              respondToInterrupt(pendingInterrupt.id, response)
            }
            onCancel={cancelInterrupt}
          />
        )}

        {interruptCandidates && (
          <div className="mb-4">
            <p className="text-sm text-muted mb-2">Which movie did you mean?</p>
            <div className="flex flex-wrap gap-2">
              {interruptCandidates.map((movie) => (
                <Button
                  key={movie.id}
                  variant="outline"
                  size="sm"
                  onClick={() => handleInterruptClarificationPick(movie)}
                  disabled={isLoading}
                >
                  {movie.title}
                  {movie.year ? ` (${movie.year})` : ""}
                </Button>
              ))}
            </div>
          </div>
        )}

        {isMulti ? (
          <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-4">
            {surfaceIds.map((id) => (
              <A2UIRenderer key={id} surfaceId={id} />
            ))}
          </div>
        ) : (
          surfaceIds.map((id) => <A2UIRenderer key={id} surfaceId={id} />)
        )}
        {reviewFormSurface && <A2UIRenderer surfaceId={SURFACE_IDS.reviewForm} />}

        {lastAssistantText && (
          <p className="mt-2 text-sm text-foreground whitespace-pre-wrap">
            {lastAssistantText}
          </p>
        )}
      </div>
    </div>
  );
}
