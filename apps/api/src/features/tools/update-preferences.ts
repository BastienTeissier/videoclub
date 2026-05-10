import { tool } from "ai";
import { agentSessionsRepository, type Database } from "@repo/db";
import { viewingPreferencesPatchSchema } from "@repo/contracts";

export function createUpdatePreferencesTool(db: Database, sessionId: string) {
  return tool({
    description: `Persist viewing preferences derived from the current message. Call this BEFORE \`discovery\` whenever the user's message implies any of \`genres\`, \`maxRuntime\`, or \`moods\` — even on first mention, even when phrased as a one-shot query. Pass only the keys present: { genres?, maxRuntime?, moods?, notes? }. Notes are appended (FIFO-evicted to 8). Structured keys overwrite. The tool returns the new snapshot; the UI renders the change.`,
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
