"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { AddToWatchlistResponse, RemoveFromWatchlistResponse } from "@repo/contracts";
import {
  addToWatchlist as apiAdd,
  removeFromWatchlist as apiRemove,
  fetchWatchlist,
} from "@/lib/api/watchlist";

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
  const [watchlistedIds, setWatchlistedIds] = useState<Set<string>>(new Set());
  const requestCounters = useRef(new Map<string, number>());

  useEffect(() => {
    fetchWatchlist()
      .then((data) => {
        setWatchlistedIds(new Set(data.items.map((m) => m.id)));
      })
      .catch(() => {
        // silently fail on initial load
      });
  }, []);

  const isInWatchlist = useCallback(
    (movieId: string) => watchlistedIds.has(movieId),
    [watchlistedIds]
  );

  const addToWatchlist = useCallback(async (movieId: string) => {
    const counter = (requestCounters.current.get(movieId) ?? 0) + 1;
    requestCounters.current.set(movieId, counter);

    // optimistic update
    setWatchlistedIds((prev) => new Set([...prev, movieId]));

    try {
      const result = await apiAdd(movieId);
      // ignore stale response
      if (requestCounters.current.get(movieId) !== counter) return result;
      return result;
    } catch (error) {
      // revert on error
      if (requestCounters.current.get(movieId) === counter) {
        setWatchlistedIds((prev) => {
          const next = new Set(prev);
          next.delete(movieId);
          return next;
        });
      }
      throw error;
    }
  }, []);

  const removeFromWatchlist = useCallback(async (movieId: string) => {
    const counter = (requestCounters.current.get(movieId) ?? 0) + 1;
    requestCounters.current.set(movieId, counter);

    // optimistic update
    setWatchlistedIds((prev) => {
      const next = new Set(prev);
      next.delete(movieId);
      return next;
    });

    try {
      const result = await apiRemove(movieId);
      if (requestCounters.current.get(movieId) !== counter) return result;
      return result;
    } catch (error) {
      // revert on error
      if (requestCounters.current.get(movieId) === counter) {
        setWatchlistedIds((prev) => new Set([...prev, movieId]));
      }
      throw error;
    }
  }, []);

  const refetch = useCallback(async () => {
    try {
      const data = await fetchWatchlist();
      setWatchlistedIds(new Set(data.items.map((m) => m.id)));
    } catch {
      // silently fail on refetch
    }
  }, []);

  const toggleWatchlist = useCallback(
    async (movieId: string) => {
      if (watchlistedIds.has(movieId)) {
        await removeFromWatchlist(movieId);
      } else {
        await addToWatchlist(movieId);
      }
    },
    [watchlistedIds, addToWatchlist, removeFromWatchlist]
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
