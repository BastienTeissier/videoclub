import {
  pgTable,
  uuid,
  text,
  jsonb,
  integer,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { agentRuns } from "./agent-runs.js";

export const toolCalls = pgTable(
  "tool_calls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .notNull()
      .references(() => agentRuns.id),
    toolName: text("tool_name").notNull(),
    input: jsonb("input").notNull(),
    output: jsonb("output"),
    durationMs: integer("duration_ms"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("tool_calls_run_id_idx").on(table.runId)]
);

export type ToolCall = typeof toolCalls.$inferSelect;
export type NewToolCall = typeof toolCalls.$inferInsert;
