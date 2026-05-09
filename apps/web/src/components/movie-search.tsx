"use client";

import { useState, useEffect, useRef, type FormEvent } from "react";
import { Input, Button } from "@repo/ui";
import {
  wireMutationOutcomeSchema,
  clarificationProposedSchema,
  type MovieDto,
} from "@repo/contracts";
import { useAgentChat } from "@/hooks/use-agent-chat";
import { useChatResults } from "@/contexts/chat-results-context";
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
  const {
    a2uiSurface: persistedA2UISurface,
    clarification,
    setA2UISurface,
    setClarification,
  } = useChatResults();

  const discoverySurface = useA2UISurface("discovery");
  const watchlistSurface = useA2UISurface("watchlist");
  const reviewsSurface = useA2UISurface("reviews");

  const prevToolResultsRef = useRef<typeof toolResults | null>(null);

  // Project transient toolResults into context for tagged-union surfaces and
  // refetch dispatch. After Amendment B, mutating tools no longer surface
  // `needs-clarification` here — that's an interrupt now (handled below via
  // `pendingInterrupt`). review_add still uses the legacy tagged-union shape
  // until Amendment E.
  useEffect(() => {
    if (toolResults.length === 0) return;
    if (toolResults === prevToolResultsRef.current) return;
    prevToolResultsRef.current = toolResults;

    // review_add still emits a tagged-union review-form surface (Amendment E pending)
    const reviewFormResult = toolResults.find(
      (tr) =>
        tr.toolName === "review_add" &&
        tr.result &&
        typeof tr.result === "object" &&
        "type" in tr.result &&
        (tr.result as { type: string }).type === "review-form",
    );
    if (reviewFormResult) {
      setA2UISurface(
        reviewFormResult.result as { type: string; [key: string]: unknown },
      );
      return;
    }

    // review_add still uses legacy clarification_needed shape (Amendment E pending)
    for (const tr of toolResults) {
      if (
        tr.toolName === "review_add" &&
        tr.result &&
        typeof tr.result === "object" &&
        "clarification_needed" in tr.result
      ) {
        const result = tr.result as unknown as { candidates: MovieDto[] };
        setClarification({ action: "review", candidates: result.candidates });
        return;
      }
    }

    // MutationOutcome envelope (success/error). Refetch on success.
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
  }, [toolResults, setA2UISurface, setClarification, refetchers]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    sendMessage(query.trim());
    setQuery("");
  }

  // Legacy clarification handler for review_add (drops when Amendment E lands).
  function handleLegacyClarificationPick(movie: MovieDto) {
    const action = clarification!.action;
    const titleAndYear = `${movie.title}${movie.year ? ` (${movie.year})` : ""}`;
    let msg: string;
    if (action === "review") {
      msg = `review [movieId:${movie.id}] ${titleAndYear}`;
    } else if (action === "review-delete") {
      msg = `delete my review of [movieId:${movie.id}] ${titleAndYear}`;
    } else {
      msg = `${action} [movieId:${movie.id}] ${titleAndYear} ${action === "add" ? "to" : "from"} my watchlist`;
    }
    setClarification(null);
    sendMessage(msg);
  }

  function handleInterruptClarificationPick(movie: MovieDto) {
    if (!pendingInterrupt) return;
    void respondToInterrupt(pendingInterrupt.id, { pickedMovieId: movie.id });
  }

  function handleInterruptApprove() {
    if (!pendingInterrupt) return;
    void respondToInterrupt(pendingInterrupt.id, { approved: true });
  }

  // Decode the clarification interrupt's `proposed` field into MovieDto[].
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
    !!discoverySurface || !!watchlistSurface || !!reviewsSurface;

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
        {isLoading &&
          !hasProtocolSurface &&
          !persistedA2UISurface &&
          !clarification &&
          !pendingInterrupt && (
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

        {clarification && (
          <div className="mb-4">
            <p className="text-sm text-muted mb-2">Which movie did you mean?</p>
            <div className="flex flex-wrap gap-2">
              {clarification.candidates.map((movie) => (
                <Button
                  key={movie.id}
                  variant="outline"
                  size="sm"
                  onClick={() => handleLegacyClarificationPick(movie)}
                  disabled={isLoading}
                >
                  {movie.title}
                  {movie.year ? ` (${movie.year})` : ""}
                </Button>
              ))}
            </div>
          </div>
        )}

        {persistedA2UISurface && <A2UIRenderer surface={persistedA2UISurface} />}

        {discoverySurface && <A2UIRenderer surfaceId="discovery" />}
        {watchlistSurface && <A2UIRenderer surfaceId="watchlist" />}
        {reviewsSurface && <A2UIRenderer surfaceId="reviews" />}
      </div>
    </div>
  );
}
