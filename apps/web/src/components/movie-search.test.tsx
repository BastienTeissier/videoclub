import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MovieSearch } from "./movie-search";

const mockSendMessage = vi.fn();
const mockApproveToolCall = vi.fn();
const mockRejectToolCall = vi.fn();

const defaultHookReturn = {
  messages: [] as { id: string; role: string; content: string }[],
  isLoading: false,
  error: null as string | null,
  pendingApproval: null as { toolCallId: string; toolName: string; args: Record<string, unknown> } | null,
  toolResults: [] as { toolName: string; toolCallId: string; result: unknown }[],
  sendMessage: mockSendMessage,
  approveToolCall: mockApproveToolCall,
  rejectToolCall: mockRejectToolCall,
};

let hookReturn = { ...defaultHookReturn };

vi.mock("@/hooks/use-agent-chat", () => ({
  useAgentChat: () => hookReturn,
}));

beforeEach(() => {
  vi.clearAllMocks();
  hookReturn = { ...defaultHookReturn };
});

describe("MovieSearch", () => {
  it("submits query on Enter", () => {
    render(<MovieSearch />);
    const input = screen.getByPlaceholderText("what do you want to watch?");

    fireEvent.change(input, { target: { value: "Spielberg movies" } });
    fireEvent.submit(input.closest("form")!);

    expect(mockSendMessage).toHaveBeenCalledWith("Spielberg movies");
  });

  it("shows streaming text response", () => {
    hookReturn = {
      ...defaultHookReturn,
      messages: [
        { id: "1", role: "user", content: "hello" },
        { id: "2", role: "assistant", content: "Here are some movies" },
      ],
    };

    render(<MovieSearch />);
    expect(screen.getByText("Here are some movies")).toBeInTheDocument();
  });

  it("renders movie cards from tool results", () => {
    hookReturn = {
      ...defaultHookReturn,
      toolResults: [
        {
          toolName: "search_movies",
          toolCallId: "tc-1",
          result: [
            {
              id: "uuid-1",
              tmdbId: 100,
              title: "Jaws",
              year: 1975,
              synopsis: null,
              genres: ["Thriller"],
              cast: ["Roy Scheider"],
              directors: ["Steven Spielberg"],
              runtime: null,
              language: null,
              posterUrl: null,
              backdropUrl: null,
              popularity: 80,
              releaseDate: null,
              createdAt: "2024-01-01T00:00:00.000Z",
              updatedAt: "2024-01-01T00:00:00.000Z",
            },
          ],
        },
      ],
    };

    render(<MovieSearch />);
    expect(screen.getByText("Jaws")).toBeInTheDocument();
  });

  it("shows TMDB confirmation button when pendingApproval", () => {
    hookReturn = {
      ...defaultHookReturn,
      pendingApproval: {
        toolCallId: "tc-1",
        toolName: "search_tmdb",
        args: { query: "Stalker" },
      },
    };

    render(<MovieSearch />);
    expect(screen.getByText("Search TMDB for more results")).toBeInTheDocument();
  });

  it("clicking confirm button calls approveToolCall", () => {
    hookReturn = {
      ...defaultHookReturn,
      pendingApproval: {
        toolCallId: "tc-1",
        toolName: "search_tmdb",
        args: { query: "Stalker" },
      },
    };

    render(<MovieSearch />);
    fireEvent.click(screen.getByText("Search TMDB for more results"));

    expect(mockApproveToolCall).toHaveBeenCalledWith("tc-1");
  });

  it("hides button after approval completes", () => {
    hookReturn = {
      ...defaultHookReturn,
      pendingApproval: null,
    };

    render(<MovieSearch />);
    expect(screen.queryByText("Search TMDB for more results")).not.toBeInTheDocument();
  });
});
