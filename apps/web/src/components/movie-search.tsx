"use client";

import { useState, useEffect } from "react";
import { Input } from "@repo/ui";
import type { MovieDto } from "@repo/contracts";
import { searchMovies } from "@/lib/api/movies.js";
import { useDebounce } from "@/hooks/use-debounce.js";
import { MovieCard } from "./movie-card.js";

export function MovieSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MovieDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const debouncedQuery = useDebounce(query, 300);

  useEffect(() => {
    if (!debouncedQuery.trim()) {
      setResults([]);
      setError(null);
      return;
    }

    let cancelled = false;

    async function fetchResults() {
      setLoading(true);
      setError(null);
      try {
        const data = await searchMovies(debouncedQuery);
        if (!cancelled) {
          setResults(data.results);
        }
      } catch (_err) {
        if (!cancelled) {
          setError("Failed to search movies");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchResults();
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery]);

  return (
    <div className="w-full max-w-2xl mx-auto">
      <Input
        type="text"
        placeholder="what do you want to watch?"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full"
      />

      <div className="mt-6">
        {loading && (
          <p className="text-sm text-muted">Searching...</p>
        )}

        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        {!loading && !error && debouncedQuery && results.length === 0 && (
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
