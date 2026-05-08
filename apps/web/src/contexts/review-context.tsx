"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
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

interface ReviewContextValue {
  reviewRatings: Map<string, number>;
  getReviewRating: (movieId: string) => number | undefined;
  upsertReview: (
    movieId: string,
    body: UpsertReviewRequest
  ) => Promise<UpsertReviewResponse>;
  deleteReview: (movieId: string) => Promise<DeleteReviewResponse>;
  refetch: () => Promise<void>;
}

const ReviewContext = createContext<ReviewContextValue | null>(null);

export function ReviewProvider({ children }: { children: React.ReactNode }) {
  const [reviewRatings, setReviewRatings] = useState<Map<string, number>>(
    new Map()
  );
  const requestCounters = useRef(new Map<string, number>());

  useEffect(() => {
    fetchReviewRatings()
      .then((data) => {
        setReviewRatings(new Map(data.items.map((r) => [r.movieId, r.rating])));
      })
      .catch(() => {
        // silently fail on initial load
      });
  }, []);

  const getReviewRating = useCallback(
    (movieId: string) => reviewRatings.get(movieId),
    [reviewRatings]
  );

  const upsertReview = useCallback(
    async (movieId: string, body: UpsertReviewRequest) => {
      const counter = (requestCounters.current.get(movieId) ?? 0) + 1;
      requestCounters.current.set(movieId, counter);

      const previous = reviewRatings.get(movieId);

      setReviewRatings((prev) => {
        const next = new Map(prev);
        next.set(movieId, body.rating);
        return next;
      });

      try {
        const result = await apiUpsert(movieId, body);
        return result;
      } catch (error) {
        if (requestCounters.current.get(movieId) === counter) {
          setReviewRatings((prev) => {
            const next = new Map(prev);
            if (previous === undefined) next.delete(movieId);
            else next.set(movieId, previous);
            return next;
          });
        }
        throw error;
      }
    },
    [reviewRatings]
  );

  const deleteReview = useCallback(
    async (movieId: string) => {
      const counter = (requestCounters.current.get(movieId) ?? 0) + 1;
      requestCounters.current.set(movieId, counter);

      const previous = reviewRatings.get(movieId);

      setReviewRatings((prev) => {
        const next = new Map(prev);
        next.delete(movieId);
        return next;
      });

      try {
        const result = await apiDelete(movieId);
        return result;
      } catch (error) {
        if (requestCounters.current.get(movieId) === counter) {
          if (previous !== undefined) {
            setReviewRatings((prev) => {
              const next = new Map(prev);
              next.set(movieId, previous);
              return next;
            });
          }
        }
        throw error;
      }
    },
    [reviewRatings]
  );

  const refetch = useCallback(async () => {
    try {
      const data = await fetchReviewRatings();
      setReviewRatings(new Map(data.items.map((r) => [r.movieId, r.rating])));
    } catch {
      // silently fail on refetch
    }
  }, []);

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
