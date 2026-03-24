import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { agentSessions } from "./agent-sessions.js";
import { chatMessages } from "./chat-messages.js";

export const agentRuns = pgTable("agent_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id")
    .notNull()
    .references(() => agentSessions.id),
  messageId: uuid("message_id").references(() => chatMessages.id),
  status: text("status").notNull(),
  error: text("error"),
  startedAt: timestamp("started_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export type AgentRun = typeof agentRuns.$inferSelect;
export type NewAgentRun = typeof agentRuns.$inferInsert;
