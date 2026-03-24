import { pgTable, uuid, text, jsonb, timestamp, index } from "drizzle-orm/pg-core";

export const agentSessions = pgTable(
  "agent_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    context: jsonb("context").default({}).$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [index("agent_sessions_user_id_idx").on(table.userId)]
);

export type AgentSession = typeof agentSessions.$inferSelect;
export type NewAgentSession = typeof agentSessions.$inferInsert;
