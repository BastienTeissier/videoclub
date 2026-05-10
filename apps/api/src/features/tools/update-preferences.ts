import { tool } from "ai";
import { agentSessionsRepository, type Database } from "@repo/db";
import { viewingPreferencesPatchSchema } from "@repo/contracts";

export function createUpdatePreferencesTool(db: Database, sessionId: string) {
  return tool({
    description: `Persist a partial diff of the user's durable viewing preferences. Call this whenever the user states a stable taste signal you should remember (genres they like, runtime ceilings they prefer, moods, free-text notes about who they watch with or what they avoid). Do NOT call this for one-off, transient context. Pass only the keys that changed: { genres?, maxRuntime?, moods?, notes? }. Notes are appended (FIFO-evicted to 8). Structured keys overwrite. The tool returns the new snapshot; the UI renders the change.`,
    inputSchema: viewingPreferencesPatchSchema,
    execute: async (input) => {
      const repo = agentSessionsRepository(db);
      const result = await repo.applyPreferencesPatch(sessionId, input);
      if (!result) {
        throw new Error(`Session not found: ${sessionId}`);
      }
      return {
        data: result.next,
        jsonPatchOps: result.jsonPatchOps,
      };
    },
  });
}
