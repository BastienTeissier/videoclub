import { movieNightPlansRepository } from "@repo/db";
import type { Database } from "@repo/db";

export function movieNightService(db: Database) {
  const repo = movieNightPlansRepository(db);

  return {
    async commit(input: {
      userId: string;
      runId: string;
      pickedMovieId: string;
      backupMovieIds: string[];
      reason: string | null;
    }) {
      return repo.create(input);
    },
  };
}
