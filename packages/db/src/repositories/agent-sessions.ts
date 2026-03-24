import { eq, desc } from "drizzle-orm";
import { agentSessions } from "../schema/agent-sessions.js";
import type { Database } from "../client/index.js";

export function agentSessionsRepository(db: Database) {
  return {
    async create(userId: string) {
      const [session] = await db
        .insert(agentSessions)
        .values({ userId })
        .returning();
      return session!;
    },

    async findById(id: string) {
      const [session] = await db
        .select()
        .from(agentSessions)
        .where(eq(agentSessions.id, id));
      return session ?? null;
    },

    async findLatestByUserId(userId: string) {
      const [session] = await db
        .select()
        .from(agentSessions)
        .where(eq(agentSessions.userId, userId))
        .orderBy(desc(agentSessions.createdAt))
        .limit(1);
      return session ?? null;
    },

    async updateContext(id: string, context: Record<string, unknown>) {
      const [session] = await db
        .update(agentSessions)
        .set({ context })
        .where(eq(agentSessions.id, id))
        .returning();
      return session ?? null;
    },
  };
}
