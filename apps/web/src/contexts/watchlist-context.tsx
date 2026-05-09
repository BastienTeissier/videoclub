"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
} from "react";
import type {
  AddToWatchlistResponse,
  RemoveFromWatchlistResponse,
} from "@repo/contracts";
import {
  addToWatchlist as apiAdd,
  removeFromWatchlist as apiRemove,
  fetchWatchlist,
} from "@/lib/api/watchlist";
import { useDomainCollection } from "@/hooks/use-domain-collection";

interface WatchlistMovie {
  id: string;
}

interface WatchlistContextValue {
  watchlistedIds: Set<string>;
  isInWatchlist: (movieId: string) => boolean;
  addToWatchlist: (movieId: string) => Promise<AddToWatchlistResponse>;
  removeFromWatchlist: (movieId: string) => Promise<RemoveFromWatchlistResponse>;
  toggleWatchlist: (movieId: string) => Promise<void>;
  refetch: () => Promise<void>;
}

const WatchlistContext = createContext<WatchlistContextValue | null>(null);

export function WatchlistProvider({ children }: { children: React.ReactNode }) {
  const { state: watchlistedIds, refetch, mutate } = useDomainCollection<
    WatchlistMovie,
    string,
    Set<string>
  >({
    fetch: async () => {
      const data = await fetchWatchlist();
      return data.items.map((m) => ({ id: m.id }));
    },
    toState: (items) => new Set(items.map((i) => i.id)),
    initialState: useMemo(() => new Set<string>(), []),
  });

  const isInWatchlist = useCallback(
    (movieId: string) => watchlistedIds.has(movieId),
    [watchlistedIds],
  );

  const addToWatchlist = useCallback(
    (movieId: string) =>
      mutate<AddToWatchlistResponse>(movieId, {
        optimistic: (s) => new Set([...s, movieId]),
        rollback: (s) => {
          const next = new Set(s);
          next.delete(movieId);
          return next;
        },
        perform: () => apiAdd(movieId),
      }),
    [mutate],
  );

  const removeFromWatchlist = useCallback(
    (movieId: string) =>
      mutate<RemoveFromWatchlistResponse>(movieId, {
        optimistic: (s) => {
          const next = new Set(s);
          next.delete(movieId);
          return next;
        },
        rollback: (s) => new Set([...s, movieId]),
        perform: () => apiRemove(movieId),
      }),
    [mutate],
  );

  const toggleWatchlist = useCallback(
    async (movieId: string) => {
      if (watchlistedIds.has(movieId)) {
        await removeFromWatchlist(movieId);
      } else {
        await addToWatchlist(movieId);
      }
    },
    [watchlistedIds, addToWatchlist, removeFromWatchlist],
  );

  return (
    <WatchlistContext.Provider
      value={{
        watchlistedIds,
        isInWatchlist,
        addToWatchlist,
        removeFromWatchlist,
        toggleWatchlist,
        refetch,
      }}
    >
      {children}
    </WatchlistContext.Provider>
  );
}

export function useWatchlist() {
  const context = useContext(WatchlistContext);
  if (!context) {
    throw new Error("useWatchlist must be used within a WatchlistProvider");
  }
  return context;
}
