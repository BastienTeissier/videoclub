import { tool } from "ai";
import { commitMovieNightProposedSchema } from "@repo/contracts";
import { moviesRepository, type Database } from "@repo/db";
import { movieNightService } from "../../services/movie-night.js";
import { COMMIT_RULE } from "../../services/agents/system-prompt.js";
import { movieToDto } from "./movie-to-dto.js";

export function createCommitMovieNightTool(
  db: Database,
  userId: string,
  runDbId: string,
) {
  const movies = moviesRepository(db);
  const service = movieNightService(db);

  return tool({
    description: `Commit tonight's movie pick. Call this AFTER discovery view="night-plan" has rendered the proposal surface, passing exactly the same { pickedMovieId, backupMovieIds, reason }. The run will pause for user approval. Do not narrate the pause — the UI renders the dialog.

${COMMIT_RULE}`,
    needsApproval: true,
    inputSchema: commitMovieNightProposedSchema,
    execute: async (input) => {
      const picked = await movies.findById(input.pickedMovieId);
      if (!picked) {
        return {
          kind: "error" as const,
          code: "not_found" as const,
          message: `No movie found for picked id ${input.pickedMovieId}.`,
        };
      }

      const reason =
        input.reason && input.reason.length > 0 ? input.reason : null;

      const plan = await service.commit({
        userId,
        runId: runDbId,
        pickedMovieId: input.pickedMovieId,
        backupMovieIds: input.backupMovieIds,
        reason,
      });

      return {
        kind: "success" as const,
        affected: [] as const,
        message: `Locked in ${picked.title} for tonight.`,
        plan: {
          id: plan.id,
          userId: plan.userId,
          runId: plan.runId,
          pickedMovieId: plan.pickedMovieId,
          backupMovieIds: plan.backupMovieIds,
          reason: plan.reason,
          createdAt: plan.createdAt.toISOString(),
        },
        movie: movieToDto(picked),
      };
    },
  });
}
