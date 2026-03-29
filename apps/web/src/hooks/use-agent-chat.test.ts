import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAgentChat } from "./use-agent-chat";

// Mock the AG-UI client
const mockRunAgent = vi.fn();
const mockAbortRun = vi.fn();
const mockSubscribe = vi.fn();

vi.mock("@/lib/ag-ui/client", () => ({
  createAgentClient: vi.fn(() => ({
    threadId: "thread-1",
    messages: [],
    subscribe: mockSubscribe,
    runAgent: mockRunAgent,
    abortRun: mockAbortRun,
  })),
}));

let subscriberCallbacks: Record<string, (...args: unknown[]) => void> = {};

beforeEach(() => {
  vi.clearAllMocks();
  subscriberCallbacks = {};

  mockSubscribe.mockImplementation((subscriber: Record<string, (...args: unknown[]) => void>) => {
    subscriberCallbacks = subscriber;
    return { unsubscribe: vi.fn() };
  });

  mockRunAgent.mockResolvedValue({});
});

describe("useAgentChat", () => {
  it("sends message and accumulates streaming text", async () => {
    const { result } = renderHook(() => useAgentChat());

    await act(async () => {
      await result.current.sendMessage("find movies");
    });

    // Simulate text streaming events
    act(() => {
      subscriberCallbacks.onTextMessageContentEvent?.({
        textMessageBuffer: "Here are some movies",
        event: {},
        messages: [],
        state: {},
        agent: {},
        input: {},
      });
    });

    expect(result.current.messages).toHaveLength(2); // user + assistant
    expect(result.current.messages[1]!.role).toBe("assistant");
    expect(result.current.messages[1]!.content).toBe("Here are some movies");
  });

  it("sets pendingApproval when tool call has no result", async () => {
    const { result } = renderHook(() => useAgentChat());

    await act(async () => {
      await result.current.sendMessage("search movies");
    });

    // Tool call ends without result
    act(() => {
      subscriberCallbacks.onToolCallEndEvent?.({
        event: { toolCallId: "tc-1" },
        toolCallName: "search_tmdb",
        toolCallArgs: { query: "Stalker" },
        messages: [],
        state: {},
        agent: {},
        input: {},
      });
    });

    // Run finishes
    act(() => {
      subscriberCallbacks.onRunFinishedEvent?.({
        event: {},
        messages: [],
        state: {},
        agent: {},
        input: {},
      });
    });

    expect(result.current.pendingApproval).toEqual({
      toolCallId: "tc-1",
      toolName: "search_tmdb",
      args: { query: "Stalker" },
    });
  });

  it("approveToolCall triggers new run", async () => {
    const { result } = renderHook(() => useAgentChat());

    await act(async () => {
      await result.current.sendMessage("search");
    });

    act(() => {
      subscriberCallbacks.onToolCallEndEvent?.({
        event: { toolCallId: "tc-1" },
        toolCallName: "search_tmdb",
        toolCallArgs: { query: "test" },
        messages: [],
        state: {},
        agent: {},
        input: {},
      });
    });

    act(() => {
      subscriberCallbacks.onRunFinishedEvent?.({
        event: {},
        messages: [],
        state: {},
        agent: {},
        input: {},
      });
    });

    mockRunAgent.mockClear();

    await act(async () => {
      await result.current.approveToolCall("tc-1");
    });

    expect(mockRunAgent).toHaveBeenCalledTimes(1);
    expect(result.current.pendingApproval).toBeNull();
  });

  it("resets pendingApproval on new message", async () => {
    const { result } = renderHook(() => useAgentChat());

    await act(async () => {
      await result.current.sendMessage("search");
    });

    act(() => {
      subscriberCallbacks.onToolCallEndEvent?.({
        event: { toolCallId: "tc-1" },
        toolCallName: "search_tmdb",
        toolCallArgs: { query: "test" },
        messages: [],
        state: {},
        agent: {},
        input: {},
      });
    });

    act(() => {
      subscriberCallbacks.onRunFinishedEvent?.({
        event: {},
        messages: [],
        state: {},
        agent: {},
        input: {},
      });
    });

    expect(result.current.pendingApproval).not.toBeNull();

    await act(async () => {
      await result.current.sendMessage("new query");
    });

    expect(result.current.pendingApproval).toBeNull();
  });
});
