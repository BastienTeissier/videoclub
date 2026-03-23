import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../lib/utils.js";

const badgeVariants = cva(
  "inline-flex items-center rounded-lg border border-border px-2.5 py-0.5 text-xs font-medium transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-accent",
  {
    variants: {
      variant: {
        default: "border-transparent bg-accent text-background",
        secondary: "border-transparent bg-card text-foreground",
        destructive: "border-transparent bg-destructive text-foreground",
        outline: "text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
