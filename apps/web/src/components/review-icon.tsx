"use client";

import { useState } from "react";
import { Star } from "lucide-react";
import type { MovieDto } from "@repo/contracts";
import { useReviews } from "@/contexts/review-context";
import { ReviewModal } from "./review-modal";

interface ReviewIconProps {
  movie: MovieDto;
  className?: string;
}

export function ReviewIcon({ movie, className }: ReviewIconProps) {
  const { getReviewRating } = useReviews();
  const rating = getReviewRating(movie.id);
  const [modalOpen, setModalOpen] = useState(false);

  function handleClick(e: React.MouseEvent) {
    e.stopPropagation();
    setModalOpen(true);
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className={`absolute bottom-2 right-2 flex h-8 items-center gap-1 rounded-full bg-background/70 px-2 text-foreground transition-opacity duration-150 hover:bg-background/90 ${className ?? ""}`}
        aria-label={rating ? `Edit review (${rating})` : "Add review"}
      >
        <Star
          className="h-4 w-4"
          fill={rating ? "currentColor" : "none"}
        />
        {rating !== undefined && (
          <span className="text-xs font-medium">{rating}</span>
        )}
      </button>
      <ReviewModal
        movie={movie}
        open={modalOpen}
        onOpenChange={setModalOpen}
      />
    </>
  );
}
