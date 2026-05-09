"use client";

import { useState, useEffect, useRef, type FormEvent } from "react";
import { Input, Button } from "@repo/ui";
import {
  wireMutationOutcomeSchema,
  type DomainKey,
  type MovieDto,
} from "@repo/contracts";
import { useAgentChat } from "@/hooks/use-agent-chat";
import { useWatchlist } from "@/contexts/watchlist-context";
import { useReviews } from "@/contexts/review-context";
import { useChatResults } from "@/contexts/chat-results-context";
import { A2UIRenderer } from "@/lib/a2ui/registry";
import { useA2UISurface } from "@/lib/a2ui/store";

export function MovieSearch() {
  const [query, setQuery] = useState("");
  const {
    isLoading,
    error,
    pendingApproval,
    toolResults,
    sendMessage,
    approveToolCall,
  } = useAgentChat();

  const { refetch } = useWatchlist();
  const { refetch: refetchReviews } = useReviews();
  const {
    a2uiSurface: persistedA2UISurface,
    clarification,
    setA2UISurface,
    setClarification,
  } = useChatResults();

  const discoverySurface = useA2UISurface("discovery");
  const watchlistSurface = useA2UISurface("watchlist");
  const reviewsSurface = useA2UISurface("reviews");

  // Track previous toolResults to detect new results
  const prevToolResultsRef = useRef<typeof toolResults | null>(null);

  // Project transient toolResults into persistent context for tagged-union surfaces
  // (review-form) and side effects (clarification, watchlist refetch, reviews refetch).
  // Discovery / watchlist_show / review_show now flow through the A2UI store via
  // CUSTOM events, not through this projection.
  //
  // Mutation tools (review_delete, watchlist_add, watchlist_remove) return a
  // MutationOutcome envelope: { kind: "success" | "error" | "needs-clarification", ... }.
  // review_add still uses the legacy tagged-union shape until Amendment E.
  useEffect(() => {
    if (toolResults.length === 0) return;
    if (toolResults === prevToolResultsRef.current) return;
    prevToolResultsRef.current = toolResults;

    const refetchersByDomain: Record<DomainKey, () => void> = {
      watchlist: refetch,
      reviews: refetchReviews,
    };

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
        const result = tr.result as unknown as {
          candidates: MovieDto[];
        };
        setClarification({ action: "review", candidates: result.candidates });
        return;
      }
    }

    // MutationOutcome envelope from review_delete, watchlist_add, watchlist_remove
    for (const tr of toolResults) {
      if (
        tr.toolName !== "review_delete" &&
        tr.toolName !== "watchlist_add" &&
        tr.toolName !== "watchlist_remove"
      ) {
        continue;
      }
      const parsed = wireMutationOutcomeSchema.safeParse(tr.result);
      if (parsed.success) {
        if (parsed.data.kind === "success") {
          for (const domain of parsed.data.affected) {
            refetchersByDomain[domain]?.();
          }
        }
        // errors are surfaced by the LLM's text reply; no UI state change here
        continue;
      }

      // Server-only `needs-clarification` marker leaks through until the stream
      // layer translates it into an interrupt (Amendment B). Project it into
      // the existing clarification context as an interim.
      const maybeClar = tr.result as
        | { kind?: string; candidates?: MovieDto[] }
        | null;
      if (
        maybeClar?.kind === "needs-clarification" &&
        Array.isArray(maybeClar.candidates)
      ) {
        const action: "add" | "remove" | "review-delete" =
          tr.toolName === "watchlist_add"
            ? "add"
            : tr.toolName === "watchlist_remove"
              ? "remove"
              : "review-delete";
        setClarification({ action, candidates: maybeClar.candidates });
        return;
      }
    }
  }, [
    toolResults,
    setA2UISurface,
    setClarification,
    refetch,
    refetchReviews,
  ]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    sendMessage(query.trim());
    setQuery("");
  }

  function handleClarificationPick(movie: MovieDto) {
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
          !clarification && (
            <p className="text-sm text-muted">Thinking...</p>
          )}

        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        {pendingApproval &&
          pendingApproval.toolName === "search_tmdb" && (
            <div className="mb-4">
              <Button
                onClick={() => approveToolCall(pendingApproval.toolCallId)}
                disabled={isLoading}
              >
                Search TMDB for more results
              </Button>
            </div>
          )}

        {clarification && (
          <div className="mb-4">
            <p className="text-sm text-muted mb-2">
              Which movie did you mean?
            </p>
            <div className="flex flex-wrap gap-2">
              {clarification.candidates.map((movie) => (
                <Button
                  key={movie.id}
                  variant="outline"
                  size="sm"
                  onClick={() => handleClarificationPick(movie)}
                  disabled={isLoading}
                >
                  {movie.title}{movie.year ? ` (${movie.year})` : ""}
                </Button>
              ))}
            </div>
          </div>
        )}

        {persistedA2UISurface && (
          <A2UIRenderer surface={persistedA2UISurface} />
        )}

        {discoverySurface && <A2UIRenderer surfaceId="discovery" />}
        {watchlistSurface && <A2UIRenderer surfaceId="watchlist" />}
        {reviewsSurface && <A2UIRenderer surfaceId="reviews" />}
      </div>
    </div>
  );
}
