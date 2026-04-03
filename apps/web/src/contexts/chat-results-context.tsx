"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
} from "react";
import type { MovieDto } from "@repo/contracts";

interface ClarificationState {
  action: "add" | "remove";
  candidates: MovieDto[];
}

interface ChatResultsContextValue {
  movies: MovieDto[];
  watchlistSurface: { type: string; [key: string]: unknown } | null;
  clarification: ClarificationState | null;
  setMovies: (movies: MovieDto[]) => void;
  setWatchlistSurface: (surface: { type: string; [key: string]: unknown } | null) => void;
  setClarification: (clarification: ClarificationState | null) => void;
}

const ChatResultsContext = createContext<ChatResultsContextValue | null>(null);

export function ChatResultsProvider({ children }: { children: React.ReactNode }) {
  const [movies, setMoviesState] = useState<MovieDto[]>([]);
  const [watchlistSurface, setWatchlistSurfaceState] = useState<{
    type: string;
    [key: string]: unknown;
  } | null>(null);
  const [clarification, setClarificationState] = useState<ClarificationState | null>(null);

  const setMovies = useCallback((newMovies: MovieDto[]) => {
    setMoviesState(newMovies);
    setWatchlistSurfaceState(null);
    setClarificationState(null);
  }, []);

  const setWatchlistSurface = useCallback(
    (surface: { type: string; [key: string]: unknown } | null) => {
      setWatchlistSurfaceState(surface);
      setMoviesState([]);
      setClarificationState(null);
    },
    []
  );

  const setClarification = useCallback(
    (c: ClarificationState | null) => {
      setClarificationState(c);
    },
    []
  );

  return (
    <ChatResultsContext.Provider
      value={{
        movies,
        watchlistSurface,
        clarification,
        setMovies,
        setWatchlistSurface,
        setClarification,
      }}
    >
      {children}
    </ChatResultsContext.Provider>
  );
}

export function useChatResults() {
  const context = useContext(ChatResultsContext);
  if (!context) {
    throw new Error("useChatResults must be used within a ChatResultsProvider");
  }
  return context;
}
