import { eq, and, desc } from "drizzle-orm";
import {
  applyPatch,
  type ViewingPreferences,
  type ViewingPreferencesPatch,
} from "@repo/contracts";
import { agentSessions } from "../schema/agent-sessions.js";
import type { Database } from "../client/index.js";

export function agentSessionsRepository(db: Database) {
  return {
    async create(
      userId: string,
      initialViewingPreferences?: ViewingPreferences,
    ) {
      const [session] = await db
        .insert(agentSessions)
        .values({
          userId,
          ...(initialViewingPreferences !== undefined
            ? { viewingPreferences: initialViewingPreferences }
            : {}),
        })
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

    // Ownership-scoped lookup. Use this instead of `findById` for any code
    // path that accepts a `threadId` from a request, so that user A cannot
    // read or write user B's session by guessing the id.
    async findByIdForUser(id: string, userId: string) {
      const [session] = await db
        .select()
        .from(agentSessions)
        .where(and(eq(agentSessions.id, id), eq(agentSessions.userId, userId)));
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

    async findLatestViewingPreferencesByUserId(
      userId: string,
    ): Promise<ViewingPreferences | null> {
      const [row] = await db
        .select({ viewingPreferences: agentSessions.viewingPreferences })
        .from(agentSessions)
        .where(eq(agentSessions.userId, userId))
        .orderBy(desc(agentSessions.createdAt))
        .limit(1);
      return row?.viewingPreferences ?? null;
    },

    async updateContext(id: string, context: Record<string, unknown>) {
      const [session] = await db
        .update(agentSessions)
        .set({ context })
        .where(eq(agentSessions.id, id))
        .returning();
      return session ?? null;
    },

    async getViewingPreferences(
      sessionId: string,
    ): Promise<ViewingPreferences | null> {
      const [row] = await db
        .select({ viewingPreferences: agentSessions.viewingPreferences })
        .from(agentSessions)
        .where(eq(agentSessions.id, sessionId));
      return row?.viewingPreferences ?? null;
    },

    async setViewingPreferences(
      sessionId: string,
      prefs: ViewingPreferences,
    ): Promise<ViewingPreferences | null> {
      const [session] = await db
        .update(agentSessions)
        .set({ viewingPreferences: prefs })
        .where(eq(agentSessions.id, sessionId))
        .returning();
      return session?.viewingPreferences ?? null;
    },

    async applyPreferencesPatch(
      sessionId: string,
      patch: ViewingPreferencesPatch,
    ) {
      const current = await this.getViewingPreferences(sessionId);
      if (current === null) return null;
      const { next, jsonPatchOps } = applyPatch(current, patch);
      await this.setViewingPreferences(sessionId, next);
      return { next, jsonPatchOps };
    },
  };
}
