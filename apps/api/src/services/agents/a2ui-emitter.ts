import {
  VIDEOCLUB_CATALOG_ID,
  createSurface,
  updateComponents,
  updateDataModel,
  type A2UIMessage,
  type ComponentNode,
  type MovieDto,
  type ReviewWithMovieDto,
} from "@repo/contracts";

interface DiscoveryFilters {
  title?: string;
  director?: string;
  actor?: string;
  genres?: string[];
  excludedGenres?: string[];
  year?: number;
  maxRuntime?: number;
  moods?: string[];
}

interface DiscoverySurfaceArgs {
  surfaceId?: string;
  filters?: DiscoveryFilters;
  movies: MovieDto[];
}

interface GridStateValue<T> {
  items: T[];
  state: "ok" | "empty" | "error";
  message?: string;
}

interface WatchlistGridArgs {
  surfaceId?: string;
  items: MovieDto[];
  message?: string;
  error?: boolean;
}

interface ReviewsGridArgs {
  surfaceId?: string;
  items: ReviewWithMovieDto[];
  message?: string;
  error?: boolean;
}

const ROOT_ID = "root";

function rootColumn(childIds: string[]): ComponentNode {
  return { id: ROOT_ID, component: "Column", children: childIds };
}

export function discoverySurfaceMessages({
  surfaceId = "discovery",
  filters,
  movies,
}: DiscoverySurfaceArgs): A2UIMessage[] {
  const messages: A2UIMessage[] = [
    createSurface(surfaceId, VIDEOCLUB_CATALOG_ID),
    updateComponents(surfaceId, [
      rootColumn(["filters", "grid"]),
      {
        id: "filters",
        component: "MovieFilterPanel",
        data: { path: "/filters" },
      },
      { id: "grid", component: "Skeleton", variant: "movie-grid" },
    ]),
  ];

  if (filters) {
    messages.push(updateDataModel(surfaceId, "/filters", filters));
  }

  messages.push(
    updateComponents(surfaceId, [
      {
        id: "grid",
        component: "MovieGrid",
        data: { path: "/movies" },
      },
    ]),
  );
  messages.push(updateDataModel(surfaceId, "/movies", movies));

  return messages;
}

function gridStateValue<T>(
  items: T[],
  message?: string,
  error?: boolean,
): GridStateValue<T> {
  if (error) return { items, state: "error", message };
  if (items.length === 0) return { items: [], state: "empty", message };
  return { items, state: "ok", message };
}

export function watchlistGridMessages({
  surfaceId = "watchlist",
  items,
  message,
  error,
}: WatchlistGridArgs): A2UIMessage[] {
  return [
    createSurface(surfaceId, VIDEOCLUB_CATALOG_ID),
    updateComponents(surfaceId, [
      rootColumn(["grid"]),
      { id: "grid", component: "WatchlistGrid", data: { path: "/state" } },
    ]),
    updateDataModel(
      surfaceId,
      "/state",
      gridStateValue(items, message, error),
    ),
  ];
}

export function reviewsGridMessages({
  surfaceId = "reviews",
  items,
  message,
  error,
}: ReviewsGridArgs): A2UIMessage[] {
  return [
    createSurface(surfaceId, VIDEOCLUB_CATALOG_ID),
    updateComponents(surfaceId, [
      rootColumn(["grid"]),
      { id: "grid", component: "ReviewsGrid", data: { path: "/state" } },
    ]),
    updateDataModel(
      surfaceId,
      "/state",
      gridStateValue(items, message, error),
    ),
  ];
}
