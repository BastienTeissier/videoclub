"use client";

import { useMemo } from "react";
import type { DomainKey } from "@repo/contracts";
import { useWatchlist } from "@/contexts/watchlist-context";
import { useReviews } from "@/contexts/review-context";

export type DomainRefetchers = Record<DomainKey, () => Promise<void>>;

/**
 * Maps `DomainKey` values to their refetch functions. The agent-mutation
 * dispatcher reads `outcome.affected: DomainKey[]` and calls each.
 *
 * Adding a new domain = one entry here + one member in `domainKeySchema` +
 * one extension in `useMovieState`.
 */
export function useDomainRefetchers(): DomainRefetchers {
  const { refetch: refetchWatchlist } = useWatchlist();
  const { refetch: refetchReviews } = useReviews();

  return useMemo(
    () => ({
      watchlist: refetchWatchlist,
      reviews: refetchReviews,
    }),
    [refetchWatchlist, refetchReviews],
  );
}
