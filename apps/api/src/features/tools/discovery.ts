import { tool } from "ai";
import { z } from "zod";
import { getCatalogPromptDescription, type MovieDto } from "@repo/contracts";
import type { Database } from "@repo/db";
import { searchMoviesData } from "./search-movies.js";
import { movieToDto } from "./movie-to-dto.js";
import { discoverySurfaceMessages } from "../../services/agents/a2ui-emitter.js";

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

export function createDiscoveryTool(db: Database) {
  return tool({
    description: `Movie-discovery surface. Call this whenever the user asks for movies to watch or wants the result rendered as a poster grid. Extracts filters from the natural-language query and emits an A2UI surface progressively (skeleton -> filters echo -> grid).

${getCatalogPromptDescription()}

For UF1 always pass view: "grid".`,
    inputSchema: z.object({
      filters: discoveryFiltersSchema.optional(),
      view: z.string().default("grid"),
    }),
    execute: async (input) => {
      const requestedView = input.view ?? "grid";
      const isValidView = (VALID_VIEWS as readonly string[]).includes(
        requestedView,
      );
      const view = isValidView ? requestedView : "grid";

      const filters = input.filters ?? {};
      const { moods: _moods, ...dbFilters } = filters;
      void _moods;

      const rows = await searchMoviesData(db, dbFilters);
      const movies: MovieDto[] = rows.map(movieToDto);

      const warnings = isValidView
        ? undefined
        : [{ code: "invalid-view" as const, requested: requestedView }];

      return {
        data: { movies, filters, view },
        a2uiMessages: discoverySurfaceMessages({
          surfaceId: "discovery",
          filters,
          movies,
        }),
        ...(warnings ? { warnings } : {}),
      };
    },
  });
}
