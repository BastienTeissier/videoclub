import { describe, it, expect, vi, beforeEach } from "vitest";
import { app } from "../../app.js";

vi.mock("../../services/agents/agent-run.js", () => ({
  agentRun: vi.fn(),
}));

vi.mock("../../services/agents/message-translator.js", () => ({
  agUiToAiSdk: vi.fn(() => [{ role: "user", content: "test" }]),
  extractInterruptResponse: vi.fn(() => null),
}));

const mockFindToolCallByAiSdkCallId = vi.fn();

vi.mock("@repo/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@repo/db")>();
  return {
    ...actual,
    agentRunsRepository: vi.fn(() => ({
      findToolCallByAiSdkCallId: mockFindToolCallByAiSdkCallId,
    })),
  };
});

import { agentRun } from "../../services/agents/agent-run.js";
import { extractInterruptResponse } from "../../services/agents/message-translator.js";

const mockAgentRun = vi.mocked(agentRun);
const mockExtractInterrupt = vi.mocked(extractInterruptResponse);

const mockStart = vi.fn();
const mockResume = vi.fn();

function makeValidBody(overrides: Record<string, unknown> = {}) {
  return {
    threadId: "thread-1",
    runId: "run-1",
    messages: [{ role: "user", id: "m1", content: "find movies" }],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockExtractInterrupt.mockReturnValue(null);
  mockFindToolCallByAiSdkCallId.mockResolvedValue(null);
  mockStart.mockImplementation(async function* () {
    yield 'data: {"type":"RUN_STARTED"}\n\n';
    yield 'data: {"type":"RUN_FINISHED"}\n\n';
  });
  mockResume.mockImplementation(async function* () {
    yield 'data: {"type":"RUN_STARTED"}\n\n';
    yield 'data: {"type":"TOOL_CALL_RESULT"}\n\n';
    yield 'data: {"type":"RUN_FINISHED"}\n\n';
  });
  mockAgentRun.mockReturnValue({
    start: mockStart,
    resume: mockResume,
  } as unknown as ReturnType<typeof agentRun>);
});

describe("POST /api/v1/chat", () => {
  it("returns SSE stream", async () => {
    const res = await app.request("/api/v1/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(makeValidBody()),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
  });

  it("calls agentRun.start when no interrupt response is present", async () => {
    mockStart.mockImplementation(async function* () {
      yield 'data: {"type":"RUN_STARTED"}\n\n';
      yield 'data: {"type":"TEXT_MESSAGE_CONTENT","delta":"Hello"}\n\n';
      yield 'data: {"type":"RUN_FINISHED"}\n\n';
    });

    const res = await app.request("/api/v1/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(makeValidBody()),
    });

    expect(res.status).toBe(200);
    expect(mockStart).toHaveBeenCalledTimes(1);
    expect(mockResume).not.toHaveBeenCalled();

    const text = await res.text();
    expect(text).toContain("TEXT_MESSAGE_CONTENT");
  });

  it("calls agentRun.resume when forwardedProps.interruptResponse is present", async () => {
    mockExtractInterrupt.mockReturnValue({
      interruptId: "call_abc",
      response: { pickedMovieId: "11111111-1111-4111-8111-111111111111" },
    });
    mockFindToolCallByAiSdkCallId.mockResolvedValue({
      id: "tc-1",
      toolName: "review_delete",
      input: {},
      output: null,
      runId: "run-orig",
    });

    const res = await app.request("/api/v1/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        makeValidBody({
          forwardedProps: {
            interruptResponse: {
              interruptId: "call_abc",
              response: {
                pickedMovieId: "11111111-1111-4111-8111-111111111111",
              },
            },
          },
        }),
      ),
    });

    expect(res.status).toBe(200);
    expect(mockResume).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "dev-user-001",
        threadId: "thread-1",
        runId: "run-1",
        interruptId: "call_abc",
        response: { pickedMovieId: "11111111-1111-4111-8111-111111111111" },
      }),
    );
    expect(mockStart).not.toHaveBeenCalled();
  });

  it("returns 404 when interruptId resolves to no pending tool call", async () => {
    mockExtractInterrupt.mockReturnValue({
      interruptId: "call_missing",
      response: { approved: true },
    });
    mockFindToolCallByAiSdkCallId.mockResolvedValue(null);

    const res = await app.request("/api/v1/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        makeValidBody({
          forwardedProps: {
            interruptResponse: {
              interruptId: "call_missing",
              response: { approved: true },
            },
          },
        }),
      ),
    });

    expect(res.status).toBe(404);
    expect(mockResume).not.toHaveBeenCalled();
  });

  it("returns 409 when the pending tool call already has an output", async () => {
    mockExtractInterrupt.mockReturnValue({
      interruptId: "call_done",
      response: { approved: true },
    });
    mockFindToolCallByAiSdkCallId.mockResolvedValue({
      id: "tc-1",
      toolName: "commit_movie_night",
      input: {},
      output: { kind: "success" },
      runId: "run-orig",
    });

    const res = await app.request("/api/v1/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        makeValidBody({
          forwardedProps: {
            interruptResponse: {
              interruptId: "call_done",
              response: { approved: true },
            },
          },
        }),
      ),
    });

    expect(res.status).toBe(409);
    expect(mockResume).not.toHaveBeenCalled();
  });

  it("returns 422 with issues when commit_movie_night editedReason exceeds maxLength", async () => {
    const tooLong = "x".repeat(1001);
    mockExtractInterrupt.mockReturnValue({
      interruptId: "call_commit",
      response: { approved: true, editedReason: tooLong },
    });
    mockFindToolCallByAiSdkCallId.mockResolvedValue({
      id: "tc-1",
      toolName: "commit_movie_night",
      input: {},
      output: null,
      runId: "run-orig",
    });

    const res = await app.request("/api/v1/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        makeValidBody({
          forwardedProps: {
            interruptResponse: {
              interruptId: "call_commit",
              response: { approved: true, editedReason: tooLong },
            },
          },
        }),
      ),
    });

    expect(res.status).toBe(422);
    const body = (await res.json()) as { issues: Array<{ path: unknown[] }> };
    expect(body.issues[0]!.path).toContain("editedReason");
    expect(mockResume).not.toHaveBeenCalled();
  });

  it("returns 200 SSE on a valid commit_movie_night reject response", async () => {
    mockExtractInterrupt.mockReturnValue({
      interruptId: "call_reject",
      response: { approved: false },
    });
    mockFindToolCallByAiSdkCallId.mockResolvedValue({
      id: "tc-1",
      toolName: "commit_movie_night",
      input: {},
      output: null,
      runId: "run-orig",
    });

    const res = await app.request("/api/v1/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        makeValidBody({
          forwardedProps: {
            interruptResponse: {
              interruptId: "call_reject",
              response: { approved: false },
            },
          },
        }),
      ),
    });

    expect(res.status).toBe(200);
    expect(mockResume).toHaveBeenCalledWith(
      expect.objectContaining({ response: { approved: false } }),
    );
  });

  it("returns 400 for invalid RunAgentInput", async () => {
    const res = await app.request("/api/v1/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [] }),
    });

    expect(res.status).toBe(400);
  });

  it("includes dev-user-001 userId on the agentRun call", async () => {
    await app.request("/api/v1/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(makeValidBody()),
    });

    expect(mockStart).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "dev-user-001" }),
    );
  });
});
