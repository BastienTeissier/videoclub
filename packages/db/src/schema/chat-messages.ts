import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { agentSessions } from "./agent-sessions.js";

export const chatMessages = pgTable(
  "chat_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => agentSessions.id),
    role: text("role").notNull(),
    content: text("content"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("chat_messages_session_id_idx").on(table.sessionId)]
);

export type ChatMessage = typeof chatMessages.$inferSelect;
export type NewChatMessage = typeof chatMessages.$inferInsert;
