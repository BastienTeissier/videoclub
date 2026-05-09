import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAgentChat } from "./use-agent-chat.js";

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
    addMessage: vi.fn(),
  })),
}));

let subscriberCallbacks: Record<string, (...args: unknown[]) => void> = {};

beforeEach(() => {
  vi.clearAllMocks();
  subscriberCallbacks = {};
  mockSubscribe.mockImplementation(
    (subscriber: Record<string, (...args: unknown[]) => void>) => {
      subscriberCallbacks = subscriber;
      return { unsubscribe: vi.fn() };
    },
  );
  mockRunAgent.mockResolvedValue({});
});

describe("useAgentChat", () => {
  it("sends message and accumulates streaming text", async () => {
    const { result } = renderHook(() => useAgentChat());

    await act(async () => {
      await result.current.sendMessage("find movies");
    });

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

    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[1]!.role).toBe("assistant");
    expect(result.current.messages[1]!.content).toBe("Here are some movies");
  });

  it("sets pendingInterrupt when run finishes with an interrupt result", async () => {
    const { result } = renderHook(() => useAgentChat());

    await act(async () => {
      await result.current.sendMessage("delete review of Dune");
    });

    act(() => {
      subscriberCallbacks.onRunFinishedEvent?.({
        event: {
          result: {
            type: "interrupt",
            interrupts: [
              {
                id: "call_abc",
                reason: "clarification",
                message: "Which movie did you mean?",
                proposed: {
                  candidates: [
                    {
                      id: "11111111-1111-4111-8111-111111111111",
                      tmdbId: 1,
                      title: "Dune",
                      year: 1984,
                      synopsis: null,
                      genres: null,
                      cast: null,
                      directors: null,
                      runtime: null,
                      language: null,
                      posterUrl: null,
                      backdropUrl: null,
                      popularity: null,
                      releaseDate: null,
                      createdAt: "2020-01-01T00:00:00.000Z",
                      updatedAt: "2020-01-01T00:00:00.000Z",
                    },
                    {
                      id: "22222222-2222-4222-8222-222222222222",
                      tmdbId: 2,
                      title: "Dune",
                      year: 2021,
                      synopsis: null,
                      genres: null,
                      cast: null,
                      directors: null,
                      runtime: null,
                      language: null,
                      posterUrl: null,
                      backdropUrl: null,
                      popularity: null,
                      releaseDate: null,
                      createdAt: "2020-01-01T00:00:00.000Z",
                      updatedAt: "2020-01-01T00:00:00.000Z",
                    },
                  ],
                },
                responseSchema: { type: "object" },
              },
            ],
          },
        },
        messages: [],
        state: {},
        agent: {},
        input: {},
      });
    });

    expect(result.current.pendingInterrupt?.id).toBe("call_abc");
    expect(result.current.pendingInterrupt?.reason).toBe("clarification");
  });

  it("does not set pendingInterrupt when run finishes without an interrupt", async () => {
    const { result } = renderHook(() => useAgentChat());

    await act(async () => {
      await result.current.sendMessage("hi");
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

    expect(result.current.pendingInterrupt).toBeNull();
  });

  it("respondToInterrupt re-runs the agent with forwardedProps.interruptResponse", async () => {
    const { result } = renderHook(() => useAgentChat());

    await act(async () => {
      await result.current.sendMessage("delete review of Dune");
    });

    act(() => {
      subscriberCallbacks.onRunFinishedEvent?.({
        event: {
          result: {
            type: "interrupt",
            interrupts: [
              {
                id: "call_abc",
                reason: "clarification",
                message: "Which?",
                proposed: { candidates: [] },
                responseSchema: { type: "object" },
              },
            ],
          },
        },
        messages: [],
        state: {},
        agent: {},
        input: {},
      });
    });

    expect(result.current.pendingInterrupt?.id).toBe("call_abc");
    mockRunAgent.mockClear();

    await act(async () => {
      await result.current.respondToInterrupt("call_abc", {
        pickedMovieId: "movie-42",
      });
    });

    expect(mockRunAgent).toHaveBeenCalledTimes(1);
    expect(mockRunAgent).toHaveBeenCalledWith({
      forwardedProps: {
        interruptResponse: {
          interruptId: "call_abc",
          response: { pickedMovieId: "movie-42" },
        },
      },
    });
    expect(result.current.pendingInterrupt).toBeNull();
  });

  it("resets pendingInterrupt on a new sendMessage", async () => {
    const { result } = renderHook(() => useAgentChat());

    await act(async () => {
      await result.current.sendMessage("first");
    });
    act(() => {
      subscriberCallbacks.onRunFinishedEvent?.({
        event: {
          result: {
            type: "interrupt",
            interrupts: [
              {
                id: "call_abc",
                reason: "clarification",
                message: "x",
                proposed: { candidates: [] },
                responseSchema: { type: "object" },
              },
            ],
          },
        },
        messages: [],
        state: {},
        agent: {},
        input: {},
      });
    });

    expect(result.current.pendingInterrupt).not.toBeNull();

    await act(async () => {
      await result.current.sendMessage("new query");
    });

    expect(result.current.pendingInterrupt).toBeNull();
  });
});