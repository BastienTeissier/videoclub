import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@repo/db", () => ({
  agentSessionsRepository: vi.fn(),
}));

import { agentSessionsRepository } from "@repo/db";
import { createUpdatePreferencesTool } from "./update-preferences.js";

const mockApplyPreferencesPatch = vi.fn();
const mockAgentSessionsRepository = vi.mocked(agentSessionsRepository);

beforeEach(() => {
  vi.clearAllMocks();
  mockAgentSessionsRepository.mockReturnValue({
    applyPreferencesPatch: mockApplyPreferencesPatch,
  } as unknown as ReturnType<typeof agentSessionsRepository>);
});

const toolContext = {
  toolCallId: "tc1",
  messages: [],
  abortSignal: undefined as unknown as AbortSignal,
};

function makeTool(sessionId = "session-1") {
  return createUpdatePreferencesTool(
    {} as Parameters<typeof createUpdatePreferencesTool>[0],
    sessionId,
  );
}

describe("createUpdatePreferencesTool", () => {
  it("happy path: returns { data, jsonPatchOps } from the repo result", async () => {
    mockApplyPreferencesPatch.mockResolvedValue({
      next: { genres: ["Comedy"], notes: ["likes feel-good"] },
      jsonPatchOps: [
        { op: "add", path: "/genres", value: ["Comedy"] },
        { op: "add", path: "/notes", value: ["likes feel-good"] },
      ],
    });

    const tool = makeTool();
    const result = await tool.execute!(
      { genres: ["Comedy"], notes: ["likes feel-good"] },
      toolContext,
    );

    expect(mockApplyPreferencesPatch).toHaveBeenCalledWith("session-1", {
      genres: ["Comedy"],
      notes: ["likes feel-good"],
    });
    expect(result).toEqual({
      data: { genres: ["Comedy"], notes: ["likes feel-good"] },
      jsonPatchOps: [
        { op: "add", path: "/genres", value: ["Comedy"] },
        { op: "add", path: "/notes", value: ["likes feel-good"] },
      ],
    });
  });

  it("forwards repo result for sequential note appends", async () => {
    mockApplyPreferencesPatch.mockResolvedValue({
      next: { notes: ["a", "b", "c"] },
      jsonPatchOps: [{ op: "add", path: "/notes/-", value: "c" }],
    });

    const tool = makeTool();
    const result = await tool.execute!({ notes: ["c"] }, toolContext);

    expect(result).toEqual({
      data: { notes: ["a", "b", "c"] },
      jsonPatchOps: [{ op: "add", path: "/notes/-", value: "c" }],
    });
  });

  it("forwards FIFO-trimmed notes from the repo", async () => {
    mockApplyPreferencesPatch.mockResolvedValue({
      next: {
        notes: ["b", "c", "d", "e", "f", "g", "h", "i"],
      },
      jsonPatchOps: [
        { op: "remove", path: "/notes/0" },
        { op: "add", path: "/notes/-", value: "i" },
      ],
    });

    const tool = makeTool();
    const result = await tool.execute!({ notes: ["i"] }, toolContext);

    const r = result as {
      data: { notes: string[] };
      jsonPatchOps: Array<{ op: string }>;
    };
    expect(r.data.notes).toHaveLength(8);
    expect(r.jsonPatchOps.some((op) => op.op === "remove")).toBe(true);
  });

  it("structured key overwrite returns replace op when previously set", async () => {
    mockApplyPreferencesPatch.mockResolvedValue({
      next: { maxRuntime: 90 },
      jsonPatchOps: [{ op: "replace", path: "/maxRuntime", value: 90 }],
    });

    const tool = makeTool();
    const result = await tool.execute!({ maxRuntime: 90 }, toolContext);

    expect(result).toEqual({
      data: { maxRuntime: 90 },
      jsonPatchOps: [{ op: "replace", path: "/maxRuntime", value: 90 }],
    });
  });

  it("throws when the session is not found", async () => {
    mockApplyPreferencesPatch.mockResolvedValue(null);

    const tool = makeTool("missing-session");
    await expect(
      tool.execute!({ genres: ["Comedy"] }, toolContext),
    ).rejects.toThrow(/Session not found: missing-session/);
  });
});
