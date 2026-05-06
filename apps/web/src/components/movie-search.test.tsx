import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { MovieDto } from "@repo/contracts";
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

const mockRefetch = vi.fn();

vi.mock("@/contexts/watchlist-context", () => ({
  useWatchlist: () => ({
    isInWatchlist: () => false,
    toggleWatchlist: vi.fn(),
    refetch: mockRefetch,
  }),
}));

vi.mock("@/contexts/review-context", () => ({
  useReviews: () => ({
    getReviewRating: () => undefined,
    upsertReview: vi.fn(),
    deleteReview: vi.fn(),
    refetch: vi.fn(),
  }),
}));

const mockSetMovies = vi.fn();
const mockSetA2UISurface = vi.fn();
const mockSetClarification = vi.fn();

let chatResultsReturn = {
  movies: [] as MovieDto[],
  a2uiSurface: null as { type: string; [key: string]: unknown } | null,
  clarification: null as { action: "add" | "remove" | "review"; candidates: MovieDto[] } | null,
  setMovies: mockSetMovies,
  setA2UISurface: mockSetA2UISurface,
  setClarification: mockSetClarification,
};

vi.mock("@/contexts/chat-results-context", () => ({
  useChatResults: () => chatResultsReturn,
}));

beforeEach(() => {
  vi.clearAllMocks();
  hookReturn = { ...defaultHookReturn };
  chatResultsReturn = {
    movies: [],
    a2uiSurface: null,
    clarification: null,
    setMovies: mockSetMovies,
    setA2UISurface: mockSetA2UISurface,
    setClarification: mockSetClarification,
  };
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

  it("renders movie cards from persisted context", () => {
    chatResultsReturn = {
      ...chatResultsReturn,
      movies: [
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

  it("renders A2UI surface from persisted watchlist context", () => {
    chatResultsReturn = {
      ...chatResultsReturn,
      a2uiSurface: {
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
    };

    render(<MovieSearch />);
    expect(screen.getByText("My Watchlist (0)")).toBeInTheDocument();
  });

  it("renders watchlist error surface message from persisted context", () => {
    chatResultsReturn = {
      ...chatResultsReturn,
      a2uiSurface: {
        type: "watchlist-grid",
        items: [],
        count: 0,
        error: true,
        message:
          "Sorry, I couldn't load your watchlist right now. Please try again.",
      },
    };

    render(<MovieSearch />);
    expect(
      screen.getByText(
        "Sorry, I couldn't load your watchlist right now. Please try again.",
      ),
    ).toBeInTheDocument();
  });

  it("clarification result renders candidate buttons", () => {
    chatResultsReturn = {
      ...chatResultsReturn,
      clarification: {
        action: "add",
        candidates: [
          {
            id: "uuid-1",
            tmdbId: 1,
            title: "Arrival",
            year: 2016,
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
          {
            id: "uuid-2",
            tmdbId: 2,
            title: "Arrival 2",
            year: 2020,
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
      },
    };

    render(<MovieSearch />);
    expect(screen.getByText("Which movie did you mean?")).toBeInTheDocument();
    expect(screen.getByText("Arrival (2016)")).toBeInTheDocument();
    expect(screen.getByText("Arrival 2 (2020)")).toBeInTheDocument();
  });

  it("review_add result with type review-form sets A2UI surface", () => {
    hookReturn = {
      ...defaultHookReturn,
      toolResults: [
        {
          toolName: "review_add",
          toolCallId: "tc-1",
          result: {
            type: "review-form",
            movie: {
              id: "uuid-r1",
              tmdbId: 9,
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
            rating: 4.5,
            text: "loved",
          },
        },
      ],
    };

    render(<MovieSearch />);

    expect(mockSetA2UISurface).toHaveBeenCalledWith(
      expect.objectContaining({ type: "review-form", rating: 4.5, text: "loved" }),
    );
  });

  it("review_add clarification_needed sets clarification with action=review", () => {
    const candidates = [
      {
        id: "uuid-r1",
        tmdbId: 9,
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
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z",
      },
      {
        id: "uuid-r2",
        tmdbId: 10,
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
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z",
      },
    ];

    hookReturn = {
      ...defaultHookReturn,
      toolResults: [
        {
          toolName: "review_add",
          toolCallId: "tc-1",
          result: {
            clarification_needed: true,
            action: "review",
            candidates,
          },
        },
      ],
    };

    render(<MovieSearch />);

    expect(mockSetClarification).toHaveBeenCalledWith({
      action: "review",
      candidates,
    });
  });

  it("clicking review-action clarification candidate sends review follow-up", () => {
    chatResultsReturn = {
      ...chatResultsReturn,
      clarification: {
        action: "review",
        candidates: [
          {
            id: "uuid-r1",
            tmdbId: 9,
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
            createdAt: "2024-01-01T00:00:00.000Z",
            updatedAt: "2024-01-01T00:00:00.000Z",
          },
        ],
      },
    };

    render(<MovieSearch />);
    fireEvent.click(screen.getByText("Dune (2021)"));

    expect(mockSendMessage).toHaveBeenCalledWith(
      "review [movieId:uuid-r1] Dune (2021)",
    );
    expect(mockSetClarification).toHaveBeenCalledWith(null);
  });

  it("My Reviews quick-action sends 'show my reviews'", () => {
    render(<MovieSearch />);
    fireEvent.click(screen.getByRole("button", { name: "My Reviews" }));
    expect(mockSendMessage).toHaveBeenCalledWith("show my reviews");
  });

  it("review_show result with reviews-grid sets A2UI surface", () => {
    hookReturn = {
      ...defaultHookReturn,
      toolResults: [
        {
          toolName: "review_show",
          toolCallId: "tc-1",
          result: {
            type: "reviews-grid",
            items: [],
            count: 0,
            message: "You haven't reviewed any movies yet.",
          },
        },
      ],
    };

    render(<MovieSearch />);

    expect(mockSetA2UISurface).toHaveBeenCalledWith(
      expect.objectContaining({ type: "reviews-grid", count: 0 }),
    );
  });

  it("clicking clarification candidate sends follow-up message with embedded movieId", () => {
    chatResultsReturn = {
      ...chatResultsReturn,
      clarification: {
        action: "add",
        candidates: [
          {
            id: "uuid-1",
            tmdbId: 1,
            title: "Arrival",
            year: 2016,
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
      },
    };

    render(<MovieSearch />);
    fireEvent.click(screen.getByText("Arrival (2016)"));

    expect(mockSendMessage).toHaveBeenCalledWith(
      "add [movieId:uuid-1] Arrival (2016) to my watchlist"
    );
    expect(mockSetClarification).toHaveBeenCalledWith(null);
  });
});
