export const VIDEOCLUB_CATALOG_ID = "videoclub" as const;

// Stable surface ids shared between the agent (which emits surfaces) and the
// frontend (which subscribes to them). Renaming a value here is the only
// place a rename can happen — both ends import these constants.
export const SURFACE_IDS = {
  discovery: "discovery",
  watchlist: "watchlist",
  reviews: "reviews",
  reviewForm: "review-form",
} as const;
export type SurfaceId = (typeof SURFACE_IDS)[keyof typeof SURFACE_IDS];

export interface CatalogComponent {
  name: string;
  description: string;
  bindablePaths?: string[];
}

export const videoclubCatalog: ReadonlyArray<CatalogComponent> = [
  {
    name: "Column",
    description:
      "Vertical layout container. Composes children referenced by id (children: string[]).",
  },
  {
    name: "MovieFilterPanel",
    description:
      "Chips summarizing the parsed query filters: genres, maxRuntime, excludedGenres, moods.",
    bindablePaths: ["/filters"],
  },
  {
    name: "MovieGrid",
    description: "Poster grid of movies (MovieDto[]).",
    bindablePaths: ["/movies"],
  },
  {
    name: "WatchlistGrid",
    description: "Poster grid of the user's watchlist movies.",
    bindablePaths: ["/state"],
  },
  {
    name: "ReviewsGrid",
    description:
      "Grid of the user's reviews with star rating, excerpt, and date.",
    bindablePaths: ["/state"],
  },
  {
    name: "Skeleton",
    description:
      "Loading placeholder. Variants: 'movie-grid' (default 5 cards) or 'row'.",
  },
  {
    name: "MovieComparisonTable",
    description:
      "Comparison table over a movie shortlist (rows = movies, columns = criteria like runtime, year, director, genres). Reads /comparison (shortlistIds + criteria) and joins against /movies.",
    bindablePaths: ["/comparison", "/movies"],
  },
  {
    name: "MovieNightPlan",
    description:
      "Final movie-night recommendation: one picked movie, optional backups, free-text reason. Reads /plan (pickedMovieId + backupMovieIds + reason) and joins against /movies.",
    bindablePaths: ["/plan", "/movies"],
  },
];

export function getCatalogPromptDescription(): string {
  const lines = videoclubCatalog.map(
    (c) => `- ${c.name}: ${c.description}`,
  );
  return `Catalog "${VIDEOCLUB_CATALOG_ID}" components:\n${lines.join("\n")}`;
}
