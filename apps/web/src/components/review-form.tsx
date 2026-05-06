"use client";

import { useEffect, useState } from "react";
import type { MovieDto, ReviewDto } from "@repo/contracts";
import {
  Button,
  Label,
  StarRating,
  Textarea,
  toast,
} from "@repo/ui";
import { useReviews } from "@/contexts/review-context";

interface ReviewFormProps {
  movie: MovieDto;
  initialReview: ReviewDto | null;
  initialRating?: number;
  initialText?: string;
  onDone: () => void;
}

export function ReviewForm({
  movie,
  initialReview,
  initialRating,
  initialText,
  onDone,
}: ReviewFormProps) {
  const { upsertReview, deleteReview } = useReviews();
  const [rating, setRating] = useState<number | undefined>(
    initialReview?.rating ?? initialRating
  );
  const [text, setText] = useState<string>(
    initialReview?.text ?? initialText ?? ""
  );
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (initialReview) {
      setRating(initialReview.rating);
      setText(initialReview.text ?? "");
    }
  }, [initialReview]);

  async function handleSubmit() {
    if (rating === undefined) {
      toast({
        variant: "destructive",
        description: "Rating is required",
      });
      return;
    }

    setSubmitting(true);
    try {
      await upsertReview(movie.id, {
        rating,
        text: text || undefined,
      });
      onDone();
    } catch {
      toast({
        variant: "destructive",
        description: "Failed to save review. Try again.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    setSubmitting(true);
    try {
      await deleteReview(movie.id);
      onDone();
    } catch {
      toast({
        variant: "destructive",
        description: "Failed to delete review. Try again.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-3">
        {movie.posterUrl && (
          <img
            src={`https://image.tmdb.org/t/p/w92${movie.posterUrl}`}
            alt={movie.title}
            className="h-24 w-16 rounded object-cover"
          />
        )}
        <div className="flex flex-col">
          <p className="text-base font-medium text-foreground">{movie.title}</p>
          {movie.year && <p className="text-sm text-muted">{movie.year}</p>}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="rating">Rating</Label>
        <StarRating
          value={rating ?? 0}
          onChange={setRating}
          size="md"
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="notes">Notes</Label>
        <Textarea
          id="notes"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Optional notes about this movie"
          maxLength={2000}
        />
      </div>

      <div className="flex justify-end gap-2">
        {initialReview && (
          <Button
            type="button"
            variant="destructive"
            onClick={handleDelete}
            disabled={submitting}
          >
            Delete
          </Button>
        )}
        <Button type="button" onClick={handleSubmit} disabled={submitting}>
          Submit
        </Button>
      </div>
    </div>
  );
}
