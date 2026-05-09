"use client";

import { useState, useEffect, useRef, type FormEvent } from "react";
import { Input, Button } from "@repo/ui";
import {
  wireMutationOutcomeSchema,
  clarificationProposedSchema,
  type MovieDto,
} from "@repo/contracts";
import { useAgentChat } from "@/hooks/use-agent-chat";
import { useDomainRefetchers } from "@/lib/domain-refetchers";
import { A2UIRenderer } from "@/lib/a2ui/registry";
import { useA2UISurface } from "@/lib/a2ui/store";

export function MovieSearch() {
  const [query, setQuery] = useState("");
  const {
    isLoading,
    error,
    pendingInterrupt,
    toolResults,
    sendMessage,
    respondToInterrupt,
    cancelInterrupt,
  } = useAgentChat();

  const refetchers = useDomainRefetchers();

  const discoverySurface = useA2UISurface("discovery");
  const watchlistSurface = useA2UISurface("watchlist");
  const reviewsSurface = useA2UISurface("reviews");
  const reviewFormSurface = useA2UISurface("review-form");

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

  function handleInterruptApprove() {
    if (!pendingInterrupt) return;
    void respondToInterrupt(pendingInterrupt.id, { approved: true });
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

  const showApprovalButton =
    pendingInterrupt?.reason === "approval" &&
    typeof pendingInterrupt.proposed === "object" &&
    pendingInterrupt.proposed !== null &&
    (pendingInterrupt.proposed as { toolName?: string }).toolName ===
      "search_tmdb";

  const hasProtocolSurface =
    !!discoverySurface ||
    !!watchlistSurface ||
    !!reviewsSurface ||
    !!reviewFormSurface;

  return (
    <div className="w-full max-w-2xl mx-auto">
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

      <div className="mt-6">
        {isLoading && !hasProtocolSurface && !pendingInterrupt && (
          <p className="text-sm text-muted">Thinking...</p>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        {showApprovalButton && (
          <div className="mb-4">
            <Button onClick={handleInterruptApprove} disabled={isLoading}>
              Search TMDB for more results
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="ml-2"
              onClick={cancelInterrupt}
              disabled={isLoading}
            >
              Cancel
            </Button>
          </div>
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

        {discoverySurface && <A2UIRenderer surfaceId="discovery" />}
        {watchlistSurface && <A2UIRenderer surfaceId="watchlist" />}
        {reviewsSurface && <A2UIRenderer surfaceId="reviews" />}
        {reviewFormSurface && <A2UIRenderer surfaceId="review-form" />}
      </div>
    </div>
  );
}
