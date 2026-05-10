"use client";

import { useCallback } from "react";
import type {
  UpsertReviewRequest,
  UpsertReviewResponse,
  DeleteReviewResponse,
} from "@repo/contracts";
import { useWatchlist } from "@/contexts/watchlist-context";
import { useReviews } from "@/contexts/review-context";

export interface MovieStateApi {
  inWatchlist: boolean;
  reviewRating: number | undefined;
  toggleWatchlist: () => Promise<void>;
  upsertReview: (body: UpsertReviewRequest) => Promise<UpsertReviewResponse>;
  deleteReview: () => Promise<DeleteReviewResponse>;
}

/**
 * Unified read/write surface for "everything we know about one movie":
 * watchlist membership, review rating, plus the actions that change them.
 *
 * Composes watchlist-context + review-context so consumers stop joining
 * them by hand. New movie-scoped domains extend this hook in one place.
 */
export function useMovieState(movieId: string): MovieStateApi {
  const watchlist = useWatchlist();
  const reviews = useReviews();

  const toggleWatchlist = useCallback(
    () => watchlist.toggleWatchlist(movieId),
    [watchlist, movieId],
  );

  const upsertReview = useCallback(
    (body: UpsertReviewRequest) => reviews.upsertReview(movieId, body),
    [reviews, movieId],
  );

  const deleteReview = useCallback(
    () => reviews.deleteReview(movieId),
    [reviews, movieId],
  );

  return {
    inWatchlist: watchlist.isInWatchlist(movieId),
    reviewRating: reviews.getReviewRating(movieId),
    toggleWatchlist,
    upsertReview,
    deleteReview,
  };
}
