"use client";

import type { ReviewFormSurface } from "@repo/contracts";
import { useChatResults } from "@/contexts/chat-results-context";
import { ReviewForm as ReviewFormComponent } from "@/components/review-form";

interface ReviewFormProps {
  data: ReviewFormSurface;
}

export function ReviewForm({ data }: ReviewFormProps) {
  const { setA2UISurface } = useChatResults();

  return (
    <ReviewFormComponent
      movie={data.movie}
      initialReview={null}
      initialRating={data.rating}
      initialText={data.text}
      onDone={() => setA2UISurface(null)}
    />
  );
}
