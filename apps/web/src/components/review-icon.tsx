"use client";

import { useState } from "react";
import { Star } from "lucide-react";
import type { MovieDto } from "@repo/contracts";
import { useMovieState } from "@/hooks/use-movie-state";
import { ReviewModal } from "./review-modal";

interface ReviewIconProps {
  movie: MovieDto;
  alwaysVisible?: boolean;
}

export function ReviewIcon({ movie, alwaysVisible = false }: ReviewIconProps) {
  const { reviewRating: rating } = useMovieState(movie.id);
  const [modalOpen, setModalOpen] = useState(false);

  function handleClick(e: React.MouseEvent) {
    e.stopPropagation();
    setModalOpen(true);
  }

  const isVisible = alwaysVisible || rating !== undefined;
  const visibilityClass = isVisible ? "" : "opacity-0 group-hover:opacity-100";

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className={`absolute bottom-2 right-2 flex h-8 items-center gap-1 rounded-full bg-background/70 px-2 text-foreground transition-opacity duration-150 hover:bg-background/90 ${visibilityClass}`}
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