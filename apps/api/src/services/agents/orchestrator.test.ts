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

vi.mock("../../features/tools/watchlist-show.js", () => ({
  createWatchlistShowTool: vi.fn(() => ({ type: "watchlist_show_tool" })),
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

function mockStreamResult() {
  return {
    fullStream: (async function* () {})(),
    text: Promise.resolve(""),
    steps: Promise.resolve([]),
  };
}

// Mock streamText to capture and call onFinish
function setupStreamTextMock(
  finishEvent: { text: string; steps: unknown[] } = { text: "Hello!", steps: [] }
) {
  mockStreamText.mockImplementation((opts: Record<string, unknown>) => {
    const onFinish = opts.onFinish as
      | ((event: { text: string; steps: unknown[] }) => Promise<void>)
      | undefined;

    // Schedule onFinish callback
    if (onFinish) {
      Promise.resolve().then(() => onFinish(finishEvent));
    }

    return mockStreamResult() as unknown as ReturnType<typeof streamText>;
  });
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

  setupStreamTextMock();
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

    const call = mockStreamText.mock.calls[0]![0] as Record<string, unknown>;
    expect(call).toHaveProperty("messages");
    expect(call).not.toHaveProperty("prompt");
  });

  it("system prompt includes search_tmdb guidance", async () => {
    await runOrchestrator({
      db: fakeDb,
      userId: "user-1",
      messages: [{ role: "user", content: "test" }],
    });

    const call = mockStreamText.mock.calls[0]![0] as Record<string, unknown>;
    expect(call.system).toContain("search_tmdb");
    expect(call.system).toContain("insufficient");
  });

  it("persists tool calls via onFinish callback", async () => {
    setupStreamTextMock({
      text: "Result",
      steps: [
        {
          toolCalls: [
            { toolCallId: "tc-1", toolName: "search_movies", input: { title: "test" } },
          ],
          toolResults: [
            { toolCallId: "tc-1", output: [{ id: "m1" }] },
          ],
        },
      ],
    });

    await runOrchestrator({
      db: fakeDb,
      userId: "user-1",
      messages: [{ role: "user", content: "test" }],
    });

    // Wait for onFinish to complete
    await new Promise((r) => setTimeout(r, 10));

    expect(mockCreateToolCall).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "run-1",
        toolName: "search_movies",
      })
    );
    expect(mockCompleteToolCall).toHaveBeenCalledWith("tc-1", expect.anything());
  });

  it("persists assistant message via onFinish callback", async () => {
    setupStreamTextMock({ text: "Hello!", steps: [] });

    await runOrchestrator({
      db: fakeDb,
      userId: "user-1",
      messages: [{ role: "user", content: "hello" }],
    });

    // Wait for onFinish to complete
    await new Promise((r) => setTimeout(r, 10));

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

    const call = mockStreamText.mock.calls[0]![0] as Record<string, unknown>;
    const msgs = call.messages as ModelMessage[];
    expect(msgs.length).toBeGreaterThanOrEqual(3);
    expect(msgs[0]).toEqual({ role: "user", content: "old question" });
    expect(msgs[1]).toEqual({ role: "assistant", content: "old answer" });
  });
});
