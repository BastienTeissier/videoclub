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
    a2uiSurface: persistedA2UISurface,
    clarification,
    setMovies,
    setA2UISurface,
    setClarification,
  } = useChatResults();

  // Track previous toolResults to detect new results
  const prevToolResultsRef = useRef<typeof toolResults | null>(null);

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

    // Check for A2UI surfaces (watchlist_show, review_add)
    const surfaceResult = toolResults.find(
      (tr) =>
        (tr.toolName === "watchlist_show" || tr.toolName === "review_add") &&
        tr.result &&
        typeof tr.result === "object" &&
        "type" in tr.result,
    );
    if (surfaceResult) {
      setA2UISurface(
        surfaceResult.result as { type: string; [key: string]: unknown },
      );
      return;
    }

    // Check for clarification results
    for (const tr of toolResults) {
      if (
        (tr.toolName === "watchlist_add" ||
          tr.toolName === "watchlist_remove" ||
          tr.toolName === "review_add") &&
        tr.result &&
        typeof tr.result === "object" &&
        "clarification_needed" in tr.result
      ) {
        const result = tr.result as unknown as {
          action: "add" | "remove" | "review";
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
  }, [toolResults, setMovies, setA2UISurface, setClarification, refetch]);

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
    } else {
      msg = `${action} [movieId:${movie.id}] ${titleAndYear} ${action === "add" ? "to" : "from"} my watchlist`;
    }
    setClarification(null);
    sendMessage(msg);
  }

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
        {isLoading &&
          persistedMovies.length === 0 &&
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
