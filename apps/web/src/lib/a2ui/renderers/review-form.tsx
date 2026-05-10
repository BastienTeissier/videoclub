"use client";

import type { MovieDto } from "@repo/contracts";
import { ReviewForm as ReviewFormComponent } from "@/components/review-form";
import { useA2UISurface, clearSurface } from "../store";
import { get } from "../json-pointer";
import type { RendererProps } from "../renderer-types";

interface ReviewFormState {
  movie: MovieDto;
  rating: number;
  text?: string;
}

export function ReviewForm({ node, surfaceId }: RendererProps) {
  const surface = useA2UISurface(surfaceId);
  const path = node.data?.path;
  const state = path
    ? (get(surface?.dataModel, path) as ReviewFormState | undefined)
    : undefined;

  if (!state) return null;

  return (
    <ReviewFormComponent
      movie={state.movie}
      initialReview={null}
      initialRating={state.rating}
      initialText={state.text}
      onDone={() => clearSurface(surfaceId)}
    />
  );
}