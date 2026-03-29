"use client";

import { useState, type FormEvent } from "react";
import { Input } from "@repo/ui";
import type { MovieDto } from "@repo/contracts";
import { chatSearch } from "@/lib/api/chat";
import { MovieCard } from "./movie-card";

export function MovieSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MovieDto[]>([]);
  const [response, setResponse] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    const trimmed = query.trim();
    if (!trimmed) return;

    setLoading(true);
    setError(null);
    setResponse(null);
    setResults([]);

    try {
      const data = await chatSearch(trimmed);
      setResponse(data.response);

      const movies: MovieDto[] = [];
      for (const tr of data.toolResults ?? []) {
        if (tr.toolName === "search_movies" && Array.isArray(tr.output)) {
          movies.push(...(tr.output as MovieDto[]));
        }
      }
      setResults(movies);
    } catch {
      setError("Failed to search movies");
    } finally {
      setLoading(false);
    }
  }

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
        {loading && (
          <p className="text-sm text-muted">Thinking...</p>
        )}

        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        {response && !loading && (
          <p className="text-sm text-muted mb-4">{response}</p>
        )}

        {!loading && !error && !response && query && results.length === 0 && (
          <p className="text-sm text-muted">No movies found</p>
        )}

        {results.length > 0 && (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {results.map((movie) => (
              <MovieCard key={movie.id} movie={movie} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
