import { eq, asc } from "drizzle-orm";
import { chatMessages } from "../schema/chat-messages.js";
import type { Database } from "../client/index.js";

export function chatMessagesRepository(db: Database) {
  return {
    async create(data: {
      sessionId: string;
      role: string;
      content: string | null;
    }) {
      const [message] = await db
        .insert(chatMessages)
        .values(data)
        .returning();
      return message!;
    },

    async findBySessionId(sessionId: string) {
      return db
        .select()
        .from(chatMessages)
        .where(eq(chatMessages.sessionId, sessionId))
        .orderBy(asc(chatMessages.createdAt));
    },
  };
}
