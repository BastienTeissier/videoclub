import { eq, desc } from "drizzle-orm";
import { movieNightPlans } from "../schema/movie-night-plans.js";
import type { Database } from "../client/index.js";

export function movieNightPlansRepository(db: Database) {
  return {
    async create(data: {
      userId: string;
      runId: string;
      pickedMovieId: string;
      backupMovieIds: string[];
      reason: string | null;
    }) {
      const [plan] = await db
        .insert(movieNightPlans)
        .values({
          userId: data.userId,
          runId: data.runId,
          pickedMovieId: data.pickedMovieId,
          backupMovieIds: data.backupMovieIds,
          reason: data.reason,
        })
        .returning();
      return plan!;
    },

    async findByUser(userId: string) {
      return db
        .select()
        .from(movieNightPlans)
        .where(eq(movieNightPlans.userId, userId))
        .orderBy(desc(movieNightPlans.createdAt));
    },
  };
}
