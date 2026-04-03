"use client";

import { useState, useEffect, useRef, type FormEvent } from "react";
import { Input, Button } from "@repo/ui";
import type { MovieDto } from "@repo/contracts";
import { useAgentChat } from "@/hooks/use-agent-chat";
import { useWatchlist } from "@/contexts/watchlist-context";
import { useChatResults } from "@/contexts/chat-results-context";
import { A2UIRenderer } from "@/lib/a2ui/registry";
import { MovieCard } from "./movie-card";

export function MovieSearch() {
  const [query, setQuery] = useState("");
  const {
    messages,
    isLoading,
    error,
    pendingApproval,
    toolResults,
    sendMessage,
    approveToolCall,
  } = useAgentChat();

  const { refetch } = useWatchlist();
  const {
    movies: persistedMovies,
    watchlistSurface: persistedWatchlistSurface,
    clarification,
    setMovies,
    setWatchlistSurface,
    setClarification,
  } = useChatResults();

  // Track previous toolResults length to detect new results
  const prevToolResultsRef = useRef(toolResults);

  // Project transient toolResults into persistent context
  useEffect(() => {
    if (toolResults.length === 0) return;
    if (toolResults === prevToolResultsRef.current) return;
    prevToolResultsRef.current = toolResults;

    // Check for search results
    const searchMovies: MovieDto[] = [];
    for (const tr of toolResults) {
      if (
        (tr.toolName === "search_movies" || tr.toolName === "search_tmdb") &&
        Array.isArray(tr.result)
      ) {
        searchMovies.push(...(tr.result as MovieDto[]));
      }
    }
    if (searchMovies.length > 0) {
      setMovies(searchMovies);
      return;
    }

    // Check for watchlist surface
    const watchlistResult = toolResults.find(
      (tr) =>
        tr.toolName === "watchlist_show" &&
        tr.result &&
        typeof tr.result === "object" &&
        "type" in tr.result,
    );
    if (watchlistResult) {
      setWatchlistSurface(
        watchlistResult.result as { type: string; [key: string]: unknown },
      );
      return;
    }

    // Check for clarification results
    for (const tr of toolResults) {
      if (
        (tr.toolName === "watchlist_add" || tr.toolName === "watchlist_remove") &&
        tr.result &&
        typeof tr.result === "object" &&
        "clarification_needed" in tr.result
      ) {
        const result = tr.result as {
          action: "add" | "remove";
          candidates: MovieDto[];
        };
        setClarification({ action: result.action, candidates: result.candidates });
        return;
      }
    }

    // Check for successful add/remove → trigger refetch
    for (const tr of toolResults) {
      if (
        (tr.toolName === "watchlist_add" || tr.toolName === "watchlist_remove") &&
        tr.result &&
        typeof tr.result === "object" &&
        ("added" in tr.result || "removed" in tr.result)
      ) {
        refetch();
        return;
      }
    }
  }, [toolResults, setMovies, setWatchlistSurface, setClarification, refetch]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    sendMessage(query.trim());
    setQuery("");
  }

  function handleClarificationPick(movie: MovieDto) {
    const action = clarification!.action;
    const msg = `${action === "add" ? "add" : "remove"} [movieId:${movie.id}] ${movie.title}${movie.year ? ` (${movie.year})` : ""} ${action === "add" ? "to" : "from"} my watchlist`;
    setClarification(null);
    sendMessage(msg);
  }

  // Get the latest assistant message text
  const assistantMessages = messages.filter((m) => m.role === "assistant");
  const lastAssistantText =
    assistantMessages[assistantMessages.length - 1]?.content ?? null;

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

      <div className="mt-6">
        {isLoading && (
          <p className="text-sm text-muted">Thinking...</p>
        )}

        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        {lastAssistantText && (
          <p className="text-sm text-muted mb-4">{lastAssistantText}</p>
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

        {persistedWatchlistSurface && (
          <A2UIRenderer surface={persistedWatchlistSurface} />
        )}

        {persistedMovies.length > 0 && (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {persistedMovies.map((movie) => (
              <MovieCard key={movie.id} movie={movie} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
