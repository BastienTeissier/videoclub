import * as React from "react";
import { Star } from "lucide-react";
import { cn } from "../lib/utils";

type StarRatingSize = "sm" | "md";

export interface StarRatingProps {
  value: number;
  onChange?: (rating: number) => void;
  readOnly?: boolean;
  size?: StarRatingSize;
  className?: string;
}

const sizeClasses: Record<StarRatingSize, string> = {
  sm: "h-4 w-4",
  md: "h-6 w-6",
};

const STARS = [1, 2, 3, 4, 5];

const StarRating = React.forwardRef<HTMLDivElement, StarRatingProps>(
  ({ value, onChange, readOnly = false, size = "md", className }, ref) => {
    const [hover, setHover] = React.useState<number | null>(null);
    const display = hover ?? value;
    const iconClass = sizeClasses[size];

    if (readOnly) {
      return (
        <div
          ref={ref}
          className={cn("inline-flex items-center gap-0.5", className)}
          aria-label={`Rating: ${value} out of 5`}
        >
          {STARS.map((i) => {
            const filled = display >= i;
            const half = !filled && display >= i - 0.5;
            return (
              <span key={i} className="relative inline-block">
                <Star className={cn(iconClass, "text-muted")} />
                {(filled || half) && (
                  <span
                    className="absolute inset-0 overflow-hidden"
                    style={{ width: half ? "50%" : "100%" }}
                  >
                    <Star
                      className={cn(iconClass, "fill-accent text-accent")}
                    />
                  </span>
                )}
              </span>
            );
          })}
        </div>
      );
    }

    return (
      <div
        ref={ref}
        className={cn("inline-flex items-center gap-0.5", className)}
        onMouseLeave={() => setHover(null)}
      >
        {STARS.map((i) => {
          const filled = display >= i;
          const half = !filled && display >= i - 0.5;
          const halfValue = i - 0.5;
          const fullValue = i;
          return (
            <span key={i} className="relative inline-block">
              <Star className={cn(iconClass, "text-muted")} />
              {(filled || half) && (
                <span
                  className="pointer-events-none absolute inset-0 overflow-hidden"
                  style={{ width: half ? "50%" : "100%" }}
                >
                  <Star className={cn(iconClass, "fill-accent text-accent")} />
                </span>
              )}
              <button
                type="button"
                aria-label={`Rate ${halfValue} stars`}
                className="absolute inset-y-0 left-0 w-1/2 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                onMouseEnter={() => setHover(halfValue)}
                onClick={() => onChange?.(halfValue)}
              />
              <button
                type="button"
                aria-label={`Rate ${fullValue} stars`}
                className="absolute inset-y-0 right-0 w-1/2 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                onMouseEnter={() => setHover(fullValue)}
                onClick={() => onChange?.(fullValue)}
              />
            </span>
          );
        })}
      </div>
    );
  }
);
StarRating.displayName = "StarRating";

export { StarRating };