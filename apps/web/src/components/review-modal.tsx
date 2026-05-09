"use client";

import { useEffect, useState } from "react";
import type { MovieDto, ReviewDto } from "@repo/contracts";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@repo/ui";
import { fetchReview } from "@/lib/api/reviews";
import { ReviewForm } from "./review-form.js";

interface ReviewModalProps {
  movie: MovieDto;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ReviewModal({ movie, open, onOpenChange }: ReviewModalProps) {
  const [initialReview, setInitialReview] = useState<ReviewDto | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) {
      setInitialReview(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchReview(movie.id)
      .then((data) => {
        if (!cancelled) setInitialReview(data.review);
      })
      .catch(() => {
        if (!cancelled) setInitialReview(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, movie.id]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Review {movie.title}</DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="h-48 animate-pulse rounded bg-card" />
        ) : (
          <ReviewForm
            movie={movie}
            initialReview={initialReview}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}