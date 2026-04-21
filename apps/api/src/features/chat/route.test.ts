import { describe, it, expect, vi, beforeEach } from "vitest";
import { app } from "../../app.js";

async function* emptyStream() {
  // empty async generator
}

vi.mock("../../services/agents/orchestrator.js", () => ({
  runOrchestrator: vi.fn(),
}));

vi.mock("../../services/agents/message-translator.js", () => ({
  agUiToAiSdk: vi.fn(() => [{ role: "user", content: "test" }]),
  extractApprovalResponses: vi.fn(() => []),
}));

vi.mock("../../services/agents/ag-ui-stream.js", () => ({
  streamAgUiEvents: vi.fn(),
}));

import { runOrchestrator } from "../../services/agents/orchestrator.js";
import { streamAgUiEvents } from "../../services/agents/ag-ui-stream.js";

const mockOrchestrator = vi.mocked(runOrchestrator);
const mockStreamAgUi = vi.mocked(streamAgUiEvents);

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

  mockOrchestrator.mockResolvedValue({
    sessionId: "session-1",
    runId: "run-1",
    stream: { fullStream: emptyStream() } as unknown as Awaited<ReturnType<typeof runOrchestrator>>["stream"],
  });

  mockStreamAgUi.mockReturnValue(
    (async function* () {
      yield 'data: {"type":"RUN_STARTED"}\n\n';
      yield 'data: {"type":"RUN_FINISHED"}\n\n';
    })()
  );
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

  it("streams AG-UI events for text response", async () => {
    mockStreamAgUi.mockReturnValue(
      (async function* () {
        yield 'data: {"type":"RUN_STARTED"}\n\n';
        yield 'data: {"type":"TEXT_MESSAGE_CONTENT","delta":"Hello"}\n\n';
        yield 'data: {"type":"RUN_FINISHED"}\n\n';
      })()
    );

    const res = await app.request("/api/v1/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(makeValidBody()),
    });

    const text = await res.text();
    expect(text).toContain("TEXT_MESSAGE_CONTENT");
  });

  it("returns 400 for invalid RunAgentInput", async () => {
    const res = await app.request("/api/v1/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [] }), // missing threadId, runId
    });

    expect(res.status).toBe(400);
  });

  it("includes dev-user-001 userId in orchestrator call", async () => {
    await app.request("/api/v1/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(makeValidBody()),
    });

    expect(mockOrchestrator).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "dev-user-001" })
    );
  });
});
