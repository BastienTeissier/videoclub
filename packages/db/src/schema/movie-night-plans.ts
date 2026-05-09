import {
  pgTable,
  uuid,
  text,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { agentRuns } from "./agent-runs.js";
import { movies } from "./movies.js";

export const movieNightPlans = pgTable(
  "movie_night_plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    runId: uuid("run_id")
      .notNull()
      .references(() => agentRuns.id),
    pickedMovieId: uuid("picked_movie_id")
      .notNull()
      .references(() => movies.id),
    backupMovieIds: uuid("backup_movie_ids").array().notNull().default([]),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("movie_night_plans_user_id_idx").on(table.userId),
    index("movie_night_plans_run_id_idx").on(table.runId),
  ],
);

export type MovieNightPlan = typeof movieNightPlans.$inferSelect;
export type NewMovieNightPlan = typeof movieNightPlans.$inferInsert;
