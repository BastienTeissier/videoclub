import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ModelMessage } from "ai";

vi.mock("ai", () => ({
  streamText: vi.fn(),
  stepCountIs: vi.fn(() => () => false),
}));

vi.mock("../../lib/ai-provider.js", () => ({
  getModel: vi.fn(() => "mock-model"),
}));

vi.mock("../../features/tools/search-movies.js", () => ({
  createSearchMoviesTool: vi.fn(() => ({ type: "search_movies_tool" })),
}));

vi.mock("../../features/tools/search-tmdb.js", () => ({
  createSearchTmdbTool: vi.fn(() => ({ type: "search_tmdb_tool" })),
}));

const mockCreate = vi.fn();
const mockFindBySessionId = vi.fn();
const mockSessionCreate = vi.fn();
const mockSessionFindById = vi.fn();
const mockCreateRun = vi.fn();
const mockCreateToolCall = vi.fn();
const mockCompleteToolCall = vi.fn();
const mockCompleteRun = vi.fn();
const mockFailRun = vi.fn();

vi.mock("@repo/db", () => ({
  chatMessagesRepository: vi.fn(() => ({
    create: mockCreate,
    findBySessionId: mockFindBySessionId,
  })),
  agentSessionsRepository: vi.fn(() => ({
    create: mockSessionCreate,
    findById: mockSessionFindById,
  })),
  agentRunsRepository: vi.fn(() => ({
    createRun: mockCreateRun,
    createToolCall: mockCreateToolCall,
    completeToolCall: mockCompleteToolCall,
    completeRun: mockCompleteRun,
    failRun: mockFailRun,
  })),
}));

import { streamText } from "ai";
import { runOrchestrator } from "./orchestrator.js";

const mockStreamText = vi.mocked(streamText);

function mockStreamResult(text: string, steps: unknown[] = []) {
  return {
    text: Promise.resolve(text),
    steps: Promise.resolve(steps),
    fullStream: (async function* () {})(),
  };
}

const fakeDb = {} as Parameters<typeof runOrchestrator>[0]["db"];

beforeEach(() => {
  vi.clearAllMocks();

  mockSessionCreate.mockResolvedValue({ id: "session-1" });
  mockSessionFindById.mockResolvedValue({ id: "session-1" });
  mockCreate.mockResolvedValue({ id: "msg-1" });
  mockFindBySessionId.mockResolvedValue([
    { id: "msg-1", role: "user", content: "test", createdAt: new Date() },
  ]);
  mockCreateRun.mockResolvedValue({ id: "run-1" });
  mockCreateToolCall.mockResolvedValue({ id: "tc-1" });

  mockStreamText.mockReturnValue(
    mockStreamResult("Hello!") as unknown as ReturnType<typeof streamText>
  );
});

describe("orchestrator", () => {
  it("registers both search_movies and search_tmdb tools", async () => {
    await runOrchestrator({
      db: fakeDb,
      userId: "user-1",
      messages: [{ role: "user", content: "test" }],
    });

    expect(mockStreamText).toHaveBeenCalledWith(
      expect.objectContaining({
        tools: expect.objectContaining({
          search_movies: expect.anything(),
          search_tmdb: expect.anything(),
        }),
      })
    );
  });

  it("passes messages array to streamText", async () => {
    const messages: ModelMessage[] = [{ role: "user", content: "find movies" }];

    await runOrchestrator({
      db: fakeDb,
      userId: "user-1",
      messages,
    });

    const call = mockStreamText.mock.calls[0]![0];
    expect(call).toHaveProperty("messages");
    expect(call).not.toHaveProperty("prompt");
  });

  it("system prompt includes search_tmdb guidance", async () => {
    await runOrchestrator({
      db: fakeDb,
      userId: "user-1",
      messages: [{ role: "user", content: "test" }],
    });

    const call = mockStreamText.mock.calls[0]![0];
    expect(call.system).toContain("search_tmdb");
    expect(call.system).toContain("insufficient");
  });

  it("persists tool calls and results from steps", async () => {
    mockStreamText.mockReturnValue(
      mockStreamResult("Result", [
        {
          toolCalls: [
            { toolCallId: "tc-1", toolName: "search_movies", input: { title: "test" } },
          ],
          toolResults: [
            { toolCallId: "tc-1", output: [{ id: "m1" }] },
          ],
        },
      ]) as unknown as ReturnType<typeof streamText>
    );

    const result = await runOrchestrator({
      db: fakeDb,
      userId: "user-1",
      messages: [{ role: "user", content: "test" }],
    });

    expect(mockCreateToolCall).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "run-1",
        toolName: "search_movies",
      })
    );
    expect(mockCompleteToolCall).toHaveBeenCalledWith("tc-1", expect.anything());
    expect(result.toolResults).toHaveLength(1);
    expect(result.toolResults[0]!.toolName).toBe("search_movies");
  });

  it("persists assistant message with response text", async () => {
    await runOrchestrator({
      db: fakeDb,
      userId: "user-1",
      messages: [{ role: "user", content: "hello" }],
    });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        role: "assistant",
        content: "Hello!",
      })
    );
  });

  it("loads previous session messages and prepends to ModelMessage[]", async () => {
    mockSessionFindById.mockResolvedValue({ id: "session-existing" });
    mockFindBySessionId.mockResolvedValue([
      { id: "prev-1", role: "user", content: "old question", createdAt: new Date("2024-01-01") },
      { id: "prev-2", role: "assistant", content: "old answer", createdAt: new Date("2024-01-02") },
      { id: "prev-3", role: "user", content: "new question", createdAt: new Date("2024-01-03") },
    ]);

    await runOrchestrator({
      db: fakeDb,
      sessionId: "session-existing",
      userId: "user-1",
      messages: [{ role: "user", content: "new question" }],
    });

    const call = mockStreamText.mock.calls[0]![0];
    const msgs = call.messages as ModelMessage[];
    // Previous messages (excluding the last one which was just inserted) + incoming
    expect(msgs.length).toBeGreaterThanOrEqual(3);
    expect(msgs[0]).toEqual({ role: "user", content: "old question" });
    expect(msgs[1]).toEqual({ role: "assistant", content: "old answer" });
  });
});
