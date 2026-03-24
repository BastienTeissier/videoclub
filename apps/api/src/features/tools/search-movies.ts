import { tool } from "ai";
import { z } from "zod";
import { moviesRepository } from "@repo/db";
import type { Database } from "@repo/db";

export function createSearchMoviesTool(db: Database) {
  const repo = moviesRepository(db);

  return tool({
    description:
      "Search movies in the local database by title, director, actor, genre, or year. Combines filters with AND logic.",
    inputSchema: z.object({
      title: z.string().optional().describe("Movie title or partial title"),
      director: z.string().optional().describe("Director name"),
      actor: z.string().optional().describe("Actor name"),
      genre: z
        .string()
        .optional()
        .describe("Genre like action, comedy, sci-fi"),
      year: z.number().optional().describe("Release year"),
    }),
    execute: async (input) => {
      return repo.searchStructured(input);
    },
  });
}
