import { Hono } from "hono";
import {
  commitMovieNightInterrupt,
  commitMovieNightProposedSchema,
  type Interrupt,
  type PendingInterruptResponse,
} from "@repo/contracts";
import { agentRunsRepository, moviesRepository } from "@repo/db";
import { db } from "../../lib/db.js";
import { discoveryNightPlanMessages } from "../../services/agents/a2ui-emitter.js";
import { movieToDto } from "../tools/movie-to-dto.js";

const pendingInterrupt = new Hono<{ Variables: { userId: string } }>();

function genericApprovalInterrupt(
  toolCallId: string,
  toolName: string,
  input: unknown,
): Interrupt {
  return {
    id: toolCallId,
    reason: "approval",
    message: `Approve calling ${toolName}?`,
    proposed: { toolName, input },
    responseSchema: {
      type: "object",
      properties: { approved: { type: "boolean" } },
      required: ["approved"],
    },
  };
}

pendingInterrupt.get("/", async (c) => {
  const userId = c.get("userId");
  const runs = agentRunsRepository(db);
  const movies = moviesRepository(db);

  const row = await runs.findLatestPendingApprovalToolCall(userId);
  if (!row) {
    return c.json({ data: null } satisfies { data: PendingInterruptResponse });
  }

  // Resume looks up the pending row by aiSdkCallId — re-using `row.id` here
  // would break the resume POST. Skip rows that lack one (defensive: the
  // recordStepToolCalls path always sets it for SDK-emitted approvals).
  const interruptId = row.aiSdkCallId;
  if (!interruptId) {
    return c.json({ data: null } satisfies { data: PendingInterruptResponse });
  }

  if (row.toolName === "commit_movie_night") {
    const proposed = commitMovieNightProposedSchema.safeParse(row.input);
    if (!proposed.success) {
      return c.json({
        data: null,
      } satisfies { data: PendingInterruptResponse });
    }
    const ids = [proposed.data.pickedMovieId, ...proposed.data.backupMovieIds];
    const rows = await movies.findByIds(ids);
    const a2uiMessages = discoveryNightPlanMessages({
      movies: rows.map(movieToDto),
      pickedMovieId: proposed.data.pickedMovieId,
      backupMovieIds: proposed.data.backupMovieIds,
      reason: proposed.data.reason,
    });
    return c.json({
      data: {
        interrupt: commitMovieNightInterrupt(interruptId, proposed.data),
        threadId: row.sessionId,
        a2uiMessages,
      },
    } satisfies { data: PendingInterruptResponse });
  }

  return c.json({
    data: {
      interrupt: genericApprovalInterrupt(interruptId, row.toolName, row.input),
      threadId: row.sessionId,
      a2uiMessages: [],
    },
  } satisfies { data: PendingInterruptResponse });
});

export { pendingInterrupt };
