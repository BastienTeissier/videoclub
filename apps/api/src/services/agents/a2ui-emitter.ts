import {
  VIDEOCLUB_CATALOG_ID,
  SURFACE_IDS,
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

export type DiscoveryView = "grid" | "comparison" | "night-plan";

// Discriminated by `view` so the type system enforces the per-variant required
// fields (e.g. night-plan requires pickedMovieId, comparison requires shortlistIds).
// Defaults to "grid" when view is omitted.
type DiscoverySurfaceArgs =
  | {
      surfaceId?: string;
      view?: "grid";
      filters?: DiscoveryFilters;
      movies: MovieDto[];
    }
  | {
      surfaceId?: string;
      view: "comparison";
      movies: MovieDto[];
      shortlistIds: string[];
      criteria?: string[];
    }
  | {
      surfaceId?: string;
      view: "night-plan";
      movies: MovieDto[];
      pickedMovieId: string;
      backupMovieIds?: string[];
      reason?: string | null;
    };

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

interface ReviewFormSurfaceArgs {
  surfaceId?: string;
  movie: MovieDto;
  rating: number;
  text?: string;
}

const ROOT_ID = "root";

function rootColumn(childIds: string[]): ComponentNode {
  return { id: ROOT_ID, component: "Column", children: childIds };
}

export function discoveryGridMessages({
  surfaceId = SURFACE_IDS.discovery,
  filters,
  movies,
}: {
  surfaceId?: string;
  filters?: DiscoveryFilters;
  movies: MovieDto[];
}): A2UIMessage[] {
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

export function discoveryComparisonMessages({
  surfaceId = SURFACE_IDS.discovery,
  movies,
  shortlistIds,
  criteria,
}: {
  surfaceId?: string;
  movies: MovieDto[];
  shortlistIds: string[];
  criteria?: string[];
}): A2UIMessage[] {
  return [
    createSurface(surfaceId, VIDEOCLUB_CATALOG_ID),
    updateComponents(surfaceId, [
      rootColumn(["comparison"]),
      {
        id: "comparison",
        component: "MovieComparisonTable",
        data: { path: "/comparison" },
      },
    ]),
    updateDataModel(surfaceId, "/movies", movies),
    updateDataModel(surfaceId, "/comparison", {
      shortlistIds,
      criteria: criteria ?? [],
    }),
  ];
}

export function discoveryNightPlanMessages({
  surfaceId = SURFACE_IDS.discovery,
  movies,
  pickedMovieId,
  backupMovieIds,
  reason,
}: {
  surfaceId?: string;
  movies: MovieDto[];
  pickedMovieId: string;
  backupMovieIds?: string[];
  reason?: string | null;
}): A2UIMessage[] {
  return [
    createSurface(surfaceId, VIDEOCLUB_CATALOG_ID),
    updateComponents(surfaceId, [
      rootColumn(["plan"]),
      {
        id: "plan",
        component: "MovieNightPlan",
        data: { path: "/plan" },
      },
    ]),
    updateDataModel(surfaceId, "/movies", movies),
    updateDataModel(surfaceId, "/plan", {
      pickedMovieId,
      backupMovieIds: backupMovieIds ?? [],
      reason: reason ?? null,
    }),
  ];
}

export function discoverySurfaceMessages(
  args: DiscoverySurfaceArgs,
): A2UIMessage[] {
  if (args.view === "comparison") {
    return discoveryComparisonMessages({
      surfaceId: args.surfaceId,
      movies: args.movies,
      shortlistIds: args.shortlistIds,
      criteria: args.criteria,
    });
  }
  if (args.view === "night-plan") {
    return discoveryNightPlanMessages({
      surfaceId: args.surfaceId,
      movies: args.movies,
      pickedMovieId: args.pickedMovieId,
      backupMovieIds: args.backupMovieIds,
      reason: args.reason,
    });
  }
  return discoveryGridMessages({
    surfaceId: args.surfaceId,
    filters: args.filters,
    movies: args.movies,
  });
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
  surfaceId = SURFACE_IDS.watchlist,
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

export function reviewFormSurfaceMessages({
  surfaceId = SURFACE_IDS.reviewForm,
  movie,
  rating,
  text,
}: ReviewFormSurfaceArgs): A2UIMessage[] {
  return [
    createSurface(surfaceId, VIDEOCLUB_CATALOG_ID),
    updateComponents(surfaceId, [
      rootColumn(["form"]),
      { id: "form", component: "ReviewForm", data: { path: "/state" } },
    ]),
    updateDataModel(surfaceId, "/state", { movie, rating, text }),
  ];
}

export function reviewsGridMessages({
  surfaceId = SURFACE_IDS.reviews,
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
