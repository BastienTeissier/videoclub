export const VIDEOCLUB_CATALOG_ID = "videoclub" as const;

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
];

export function getCatalogPromptDescription(): string {
  const lines = videoclubCatalog.map(
    (c) => `- ${c.name}: ${c.description}`,
  );
  return `Catalog "${VIDEOCLUB_CATALOG_ID}" components:\n${lines.join("\n")}`;
}
