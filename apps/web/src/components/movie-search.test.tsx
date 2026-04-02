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

vi.mock("@/contexts/watchlist-context", () => ({
  useWatchlist: () => ({
    isInWatchlist: () => false,
    toggleWatchlist: vi.fn(),
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  hookReturn = { ...defaultHookReturn };
});

describe("MovieSearch", () => {
  it("submits query on Enter", () => {
    render(<MovieSearch />);
    const input = screen.getByPlaceholderText(
      "what do you want to watch? Try: check my watchlist",
    );

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

  it("shows watchlist discoverability copy in the input", () => {
    render(<MovieSearch />);
    expect(
      screen.getByPlaceholderText(
        "what do you want to watch? Try: check my watchlist",
      ),
    ).toBeInTheDocument();
  });

  it("renders A2UI surface from watchlist_show tool result", () => {
    hookReturn = {
      ...defaultHookReturn,
      toolResults: [
        {
          toolName: "watchlist_show",
          toolCallId: "tc-w1",
          result: {
            type: "watchlist-grid",
            items: [
              {
                id: "00000000-0000-4000-8000-000000000001",
                tmdbId: 1,
                title: "Inception",
                year: 2010,
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
                createdAt: "2024-01-01T00:00:00.000Z",
                updatedAt: "2024-01-01T00:00:00.000Z",
              },
            ],
            count: 1,
          },
        },
      ],
    };

    render(<MovieSearch />);
    expect(screen.getByText("My Watchlist (0)")).toBeInTheDocument();
  });

  it("renders watchlist error surface message", () => {
    hookReturn = {
      ...defaultHookReturn,
      toolResults: [
        {
          toolName: "watchlist_show",
          toolCallId: "tc-w2",
          result: {
            type: "watchlist-grid",
            items: [],
            count: 0,
            error: true,
            message:
              "Sorry, I couldn't load your watchlist right now. Please try again.",
          },
        },
      ],
    };

    render(<MovieSearch />);
    expect(
      screen.getByText(
        "Sorry, I couldn't load your watchlist right now. Please try again.",
      ),
    ).toBeInTheDocument();
  });
});
