"use client";

import { useState, type FormEvent } from "react";
import { Input, Button } from "@repo/ui";
import type { MovieDto } from "@repo/contracts";
import { useAgentChat } from "@/hooks/use-agent-chat";
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

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    sendMessage(query.trim());
    setQuery("");
  }

  // Extract movies from tool results
  const movies: MovieDto[] = [];
  for (const tr of toolResults) {
    if (
      (tr.toolName === "search_movies" || tr.toolName === "search_tmdb") &&
      Array.isArray(tr.result)
    ) {
      movies.push(...(tr.result as MovieDto[]));
    }
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
          placeholder="what do you want to watch?"
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

        {movies.length > 0 && (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {movies.map((movie) => (
              <MovieCard key={movie.id} movie={movie} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
