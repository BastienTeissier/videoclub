"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
} from "react";
import type {
  UpsertReviewRequest,
  UpsertReviewResponse,
  DeleteReviewResponse,
} from "@repo/contracts";
import {
  upsertReview as apiUpsert,
  deleteReview as apiDelete,
  fetchReviewRatings,
} from "@/lib/api/reviews";
import { useDomainCollection } from "@/hooks/use-domain-collection";

interface ReviewRatingItem {
  movieId: string;
  rating: number;
}

interface ReviewContextValue {
  reviewRatings: Map<string, number>;
  getReviewRating: (movieId: string) => number | undefined;
  upsertReview: (
    movieId: string,
    body: UpsertReviewRequest,
  ) => Promise<UpsertReviewResponse>;
  deleteReview: (movieId: string) => Promise<DeleteReviewResponse>;
  refetch: () => Promise<void>;
}

const ReviewContext = createContext<ReviewContextValue | null>(null);

export function ReviewProvider({ children }: { children: React.ReactNode }) {
  const { state: reviewRatings, refetch, mutate } = useDomainCollection<
    ReviewRatingItem,
    string,
    Map<string, number>
  >({
    fetch: async () => {
      const data = await fetchReviewRatings();
      return data.items;
    },
    toState: (items) => new Map(items.map((r) => [r.movieId, r.rating])),
    initialState: useMemo(() => new Map<string, number>(), []),
  });

  const getReviewRating = useCallback(
    (movieId: string) => reviewRatings.get(movieId),
    [reviewRatings],
  );

  const upsertReview = useCallback(
    (movieId: string, body: UpsertReviewRequest) => {
      const previous = reviewRatings.get(movieId);
      return mutate<UpsertReviewResponse>(movieId, {
        optimistic: (s) => new Map(s).set(movieId, body.rating),
        rollback: (s) => {
          const next = new Map(s);
          if (previous === undefined) next.delete(movieId);
          else next.set(movieId, previous);
          return next;
        },
        perform: () => apiUpsert(movieId, body),
      });
    },
    [mutate, reviewRatings],
  );

  const deleteReview = useCallback(
    (movieId: string) => {
      const previous = reviewRatings.get(movieId);
      return mutate<DeleteReviewResponse>(movieId, {
        optimistic: (s) => {
          const next = new Map(s);
          next.delete(movieId);
          return next;
        },
        rollback: (s) => {
          if (previous === undefined) return s;
          const next = new Map(s);
          next.set(movieId, previous);
          return next;
        },
        perform: () => apiDelete(movieId),
      });
    },
    [mutate, reviewRatings],
  );

  return (
    <ReviewContext.Provider
      value={{
        reviewRatings,
        getReviewRating,
        upsertReview,
        deleteReview,
        refetch,
      }}
    >
      {children}
    </ReviewContext.Provider>
  );
}

export function useReviews() {
  const context = useContext(ReviewContext);
  if (!context) {
    throw new Error("useReviews must be used within a ReviewProvider");
  }
  return context;
}
