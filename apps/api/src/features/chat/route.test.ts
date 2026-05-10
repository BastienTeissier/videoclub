import { describe, it, expect, vi, beforeEach } from "vitest";
import { app } from "../../app.js";

vi.mock("../../services/agents/agent-run.js", () => ({
  agentRun: vi.fn(),
}));

vi.mock("../../services/agents/message-translator.js", () => ({
  agUiToAiSdk: vi.fn(() => [{ role: "user", content: "test" }]),
  extractInterruptResponse: vi.fn(() => null),
}));

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
      response: { pickedMovieId: "movie-42" },
    });

    const res = await app.request("/api/v1/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        makeValidBody({
          forwardedProps: {
            interruptResponse: {
              interruptId: "call_abc",
              response: { pickedMovieId: "movie-42" },
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
        response: { pickedMovieId: "movie-42" },
      }),
    );
    expect(mockStart).not.toHaveBeenCalled();
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
