import { tool } from "ai";
import { z } from "zod";
import { getCatalogPromptDescription, type MovieDto } from "@repo/contracts";
import { moviesRepository, type Database } from "@repo/db";
import { searchMoviesData } from "./search-movies.js";
import { movieToDto } from "./movie-to-dto.js";
import {
  discoveryGridMessages,
  discoveryComparisonMessages,
  discoveryNightPlanMessages,
  type DiscoveryView,
} from "../../services/agents/a2ui-emitter.js";

const discoveryFiltersSchema = z.object({
  title: z.string().optional(),
  director: z.string().optional(),
  actor: z.string().optional(),
  genres: z.array(z.string()).optional(),
  year: z.number().optional(),
  maxRuntime: z.number().optional(),
  excludedGenres: z.array(z.string()).optional(),
  moods: z.array(z.string()).optional(),
});

const VALID_VIEWS = ["grid", "comparison", "night-plan"] as const;
const SURFACE_ID = "discovery";

type WarningCode =
  | "invalid-view"
  | "comparison-too-few"
  | "comparison-resolution-failed"
  | "night-plan-incomplete"
  | "night-plan-unknown-pick";

interface ToolWarning {
  code: WarningCode;
  [key: string]: unknown;
}

export function createDiscoveryTool(db: Database) {
  return tool({
    description: `Movie-discovery surface. Call this whenever the user asks for movies to watch, wants to compare a shortlist, or wants to finalize a movie-night pick. Extracts filters from the natural-language query and emits an A2UI surface progressively.

Before calling, classify the user's referent. If they refer to movies already shown in this thread (e.g. "the top 3 in my watchlist", "compare those", "pick one"), pass view="comparison" or view="night-plan" with IDs from the most recent prior tool result that listed movies — \`discovery\`, \`watchlist_show\`, or \`review_show\`. Do NOT call view="grid" first.

${getCatalogPromptDescription()}

Pick \`view: "comparison"\` when the user wants a side-by-side compare across a shortlist (>=2 movie ids) of already-discussed movies; pass \`shortlistMovieIds\` (the ids the user asked about) and optional \`comparisonCriteria\` (e.g., ["runtime", "mood", "group-safety"]). Pick \`view: "night-plan"\` when the user asks to pick one for tonight; pass \`pickedMovieId\`, optional \`backupMovieIds\`, and a short \`reason\`. Default to \`view: "grid"\` for fresh discovery queries.

Movie id format: shortlistMovieIds, pickedMovieId, and backupMovieIds MUST be values from the \`id\` field (UUIDs like "550e8400-e29b-41d4-a716-446655440000") of movies returned by a prior \`discovery\`, \`watchlist_show\`, or \`review_show\` call. NEVER pass the \`tmdbId\` field (a small integer) — that identifier will not resolve. Never invent ids.`,
    inputSchema: z.object({
      filters: discoveryFiltersSchema.optional(),
      view: z.string().default("grid"),
      shortlistMovieIds: z.array(z.string()).optional(),
      comparisonCriteria: z.array(z.string()).optional(),
      pickedMovieId: z.string().optional(),
      backupMovieIds: z.array(z.string()).optional(),
      reason: z.string().optional(),
    }),
    execute: async (input) => {
      const requestedView = input.view ?? "grid";
      const isValidView = (VALID_VIEWS as readonly string[]).includes(
        requestedView,
      );
      const warnings: ToolWarning[] = [];
      let effectiveView: DiscoveryView = isValidView
        ? (requestedView as DiscoveryView)
        : "grid";
      if (!isValidView) {
        warnings.push({ code: "invalid-view", requested: requestedView });
      }

      const repo = moviesRepository(db);

      // view-specific failure: return a no-surface response so the LLM
      // narrates the failure to the user via the text fallback in
      // movie-search.tsx, instead of rendering a misleading popularity grid.
      function viewFailure(reason: ToolWarning) {
        warnings.push(reason);
        return {
          data: {
            movies: [] as MovieDto[],
            view: "none" as const,
            requestedView,
            fallbackReason: reason,
          },
          a2uiMessages: [],
          warnings,
        };
      }

      if (effectiveView === "comparison") {
        const ids = input.shortlistMovieIds ?? [];
        if (ids.length < 2) {
          return viewFailure({ code: "comparison-too-few", count: ids.length });
        }
        const rows = await repo.findByIds(ids);
        const resolvedIds = new Set(rows.map((r) => r.id));
        const unresolved = ids.filter((id) => !resolvedIds.has(id));
        if (rows.length < 2) {
          // Common cause: LLM passed tmdbId values instead of `id` UUIDs.
          return viewFailure({
            code: "comparison-resolution-failed",
            requestedCount: ids.length,
            resolvedCount: rows.length,
            unresolvedIds: unresolved,
          });
        }
        const movies: MovieDto[] = rows.map(movieToDto);
        return {
          data: {
            movies,
            view: "comparison" as const,
            requestedView,
            shortlistMovieIds: ids,
            comparisonCriteria: input.comparisonCriteria ?? [],
            ...(unresolved.length ? { unresolvedIds: unresolved } : {}),
          },
          a2uiMessages: discoveryComparisonMessages({
            surfaceId: SURFACE_ID,
            movies,
            shortlistIds: rows.map((r) => r.id),
            criteria: input.comparisonCriteria,
          }),
          ...(warnings.length ? { warnings } : {}),
        };
      }

      if (effectiveView === "night-plan") {
        const pickedId = input.pickedMovieId;
        if (!pickedId) {
          return viewFailure({ code: "night-plan-incomplete" });
        }
        const ids = [pickedId, ...(input.backupMovieIds ?? [])];
        const rows = await repo.findByIds(ids);
        const picked = rows.find((r) => r.id === pickedId);
        if (!picked) {
          return viewFailure({
            code: "night-plan-unknown-pick",
            pickedMovieId: pickedId,
          });
        }
        const movies: MovieDto[] = rows.map(movieToDto);
        return {
          data: {
            movies,
            view: "night-plan" as const,
            requestedView,
            pickedMovieId: pickedId,
            backupMovieIds: input.backupMovieIds ?? [],
            reason: input.reason ?? null,
          },
          a2uiMessages: discoveryNightPlanMessages({
            surfaceId: SURFACE_ID,
            movies,
            pickedMovieId: pickedId,
            backupMovieIds: input.backupMovieIds,
            reason: input.reason,
          }),
          ...(warnings.length ? { warnings } : {}),
        };
      }

      // Default / invalid-view fallback: actual grid search with user's filters.
      const filters = input.filters ?? {};
      const { moods: _moods, ...dbFilters } = filters;
      const rows = await searchMoviesData(db, dbFilters);
      const movies: MovieDto[] = rows.map(movieToDto);
      return {
        data: {
          movies,
          filters,
          view: "grid" as const,
          requestedView,
        },
        a2uiMessages: discoveryGridMessages({
          surfaceId: SURFACE_ID,
          filters,
          movies,
        }),
        ...(warnings.length ? { warnings } : {}),
      };
    },
  });
}
