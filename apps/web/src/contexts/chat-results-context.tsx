"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
} from "react";
import type { MovieDto } from "@repo/contracts";

interface ClarificationState {
  action: "add" | "remove" | "review" | "review-delete";
  candidates: MovieDto[];
}

interface ChatResultsContextValue {
  movies: MovieDto[];
  a2uiSurface: { type: string; [key: string]: unknown } | null;
  clarification: ClarificationState | null;
  setMovies: (movies: MovieDto[]) => void;
  setA2UISurface: (surface: { type: string; [key: string]: unknown } | null) => void;
  setClarification: (clarification: ClarificationState | null) => void;
}

const ChatResultsContext = createContext<ChatResultsContextValue | null>(null);

export function ChatResultsProvider({ children }: { children: React.ReactNode }) {
  const [movies, setMoviesState] = useState<MovieDto[]>([]);
  const [a2uiSurface, setA2UISurfaceState] = useState<{
    type: string;
    [key: string]: unknown;
  } | null>(null);
  const [clarification, setClarificationState] = useState<ClarificationState | null>(null);

  const setMovies = useCallback((newMovies: MovieDto[]) => {
    setMoviesState(newMovies);
    setA2UISurfaceState(null);
    setClarificationState(null);
  }, []);

  const setA2UISurface = useCallback(
    (surface: { type: string; [key: string]: unknown } | null) => {
      setA2UISurfaceState(surface);
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
        a2uiSurface,
        clarification,
        setMovies,
        setA2UISurface,
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
