"use client";

import type { ReviewsGridSurface, ReviewWithMovieDto } from "@repo/contracts";
import { StarRating } from "@repo/ui";
import { MovieCard } from "@/components/movie-card";

interface ReviewsGridProps {
  data: ReviewsGridSurface;
}

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

function formatDate(iso: string) {
  return dateFormatter.format(new Date(iso));
}

export function ReviewsGrid({ data }: ReviewsGridProps) {
  if (data.error) {
    return <p className="text-sm text-destructive">{data.message}</p>;
  }

  if (data.items.length === 0) {
    return <p className="text-sm text-muted">{data.message}</p>;
  }

  return (
    <div>
      <h2 className="mb-4 text-lg font-semibold text-foreground">
        My Reviews ({data.count})
      </h2>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {data.items.map((item: ReviewWithMovieDto) => (
          <div key={item.id} className="flex flex-col gap-1.5">
            <MovieCard movie={item.movie} alwaysShowOverlays />
            <div className="flex items-center gap-1.5">
              <StarRating value={item.rating} readOnly size="sm" />
              <span className="text-xs text-muted">{item.rating}</span>
            </div>
            {item.text && (
              <p className="line-clamp-2 text-xs text-muted">{item.text}</p>
            )}
            <p className="text-xs text-muted">{formatDate(item.updatedAt)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
