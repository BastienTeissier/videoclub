import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { MovieDto } from "@repo/contracts";
import { MovieSearch } from "./movie-search";
import { applyMessage, clearAllSurfaces } from "@/lib/a2ui/store";

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
    isInWatchlist: () => true,
    toggleWatchlist: vi.fn(),
    refetch: mockRefetch,
  }),
}));

const mockRefetchReviews = vi.fn();

vi.mock("@/contexts/review-context", () => ({
  useReviews: () => ({
    getReviewRating: () => undefined,
    upsertReview: vi.fn(),
    deleteReview: vi.fn(),
    refetch: mockRefetchReviews,
  }),
}));

const mockSetMovies = vi.fn();
const mockSetA2UISurface = vi.fn();
const mockSetClarification = vi.fn();

let chatResultsReturn = {
  movies: [] as MovieDto[],
  a2uiSurface: null as { type: string; [key: string]: unknown } | null,
  clarification: null as {
    action: "add" | "remove" | "review" | "review-delete";
    candidates: MovieDto[];
  } | null,
  setMovies: mockSetMovies,
  setA2UISurface: mockSetA2UISurface,
  setClarification: mockSetClarification,
};

vi.mock("@/contexts/chat-results-context", () => ({
  useChatResults: () => chatResultsReturn,
}));

vi.mock("@repo/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@repo/ui")>();
  return { ...actual, toast: vi.fn() };
});

beforeEach(() => {
  vi.clearAllMocks();
  clearAllSurfaces();
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

const fakeMovie = (overrides: Partial<MovieDto> & { id: string; title: string }): MovieDto => ({
  tmdbId: 1,
  year: 2024,
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
  ...overrides,
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

  it("My Reviews button sends 'show my reviews'", () => {
    render(<MovieSearch />);
    fireEvent.click(screen.getByRole("button", { name: "My Reviews" }));
    expect(mockSendMessage).toHaveBeenCalledWith("show my reviews");
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
    render(<MovieSearch />);
    expect(screen.queryByText("Search TMDB for more results")).not.toBeInTheDocument();
  });

  it("renders the discovery surface from the A2UI store", () => {
    applyMessage({
      createSurface: { surfaceId: "discovery", catalogId: "videoclub" },
    });
    applyMessage({
      updateComponents: {
        surfaceId: "discovery",
        components: [
          { id: "root", component: "Column", children: ["filters", "grid"] },
          { id: "filters", component: "MovieFilterPanel", data: { path: "/filters" } },
          { id: "grid", component: "MovieGrid", data: { path: "/movies" } },
        ],
      },
    });
    applyMessage({
      updateDataModel: {
        surfaceId: "discovery",
        path: "/filters",
        value: { genres: ["Comedy"] },
      },
    });
    applyMessage({
      updateDataModel: {
        surfaceId: "discovery",
        path: "/movies",
        value: [fakeMovie({ id: "uuid-1", title: "Bridesmaids" })],
      },
    });

    render(<MovieSearch />);
    expect(screen.getByText("Comedy")).toBeInTheDocument();
    expect(screen.getByText("Bridesmaids")).toBeInTheDocument();
  });

  it("renders the watchlist surface from the A2UI store", () => {
    applyMessage({
      createSurface: { surfaceId: "watchlist", catalogId: "videoclub" },
    });
    applyMessage({
      updateComponents: {
        surfaceId: "watchlist",
        components: [
          { id: "root", component: "Column", children: ["grid"] },
          { id: "grid", component: "WatchlistGrid", data: { path: "/state" } },
        ],
      },
    });
    applyMessage({
      updateDataModel: {
        surfaceId: "watchlist",
        path: "/state",
        value: {
          items: [fakeMovie({ id: "uuid-1", title: "Inception" })],
          state: "ok",
        },
      },
    });

    render(<MovieSearch />);
    expect(screen.getByText("My Watchlist (1)")).toBeInTheDocument();
  });

  it("renders the watchlist error message from the A2UI store", () => {
    applyMessage({
      createSurface: { surfaceId: "watchlist", catalogId: "videoclub" },
    });
    applyMessage({
      updateComponents: {
        surfaceId: "watchlist",
        components: [
          { id: "root", component: "Column", children: ["grid"] },
          { id: "grid", component: "WatchlistGrid", data: { path: "/state" } },
        ],
      },
    });
    applyMessage({
      updateDataModel: {
        surfaceId: "watchlist",
        path: "/state",
        value: {
          items: [],
          state: "error",
          message:
            "Sorry, I couldn't load your watchlist right now. Please try again.",
        },
      },
    });

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
          fakeMovie({ id: "uuid-1", title: "Arrival", year: 2016 }),
          fakeMovie({ id: "uuid-2", title: "Arrival 2", year: 2020 }),
        ],
      },
    };

    render(<MovieSearch />);
    expect(screen.getByText("Which movie did you mean?")).toBeInTheDocument();
    expect(screen.getByText("Arrival (2016)")).toBeInTheDocument();
    expect(screen.getByText("Arrival 2 (2020)")).toBeInTheDocument();
  });

  it("review_add result with type review-form sets A2UI surface (tagged-union path)", () => {
    hookReturn = {
      ...defaultHookReturn,
      toolResults: [
        {
          toolName: "review_add",
          toolCallId: "tc-1",
          result: {
            type: "review-form",
            movie: fakeMovie({ id: "uuid-r1", title: "Inception", year: 2010 }),
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
      fakeMovie({ id: "uuid-r1", title: "Dune", year: 1984 }),
      fakeMovie({ id: "uuid-r2", title: "Dune", year: 2021 }),
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
        candidates: [fakeMovie({ id: "uuid-r1", title: "Dune", year: 2021 })],
      },
    };

    render(<MovieSearch />);
    fireEvent.click(screen.getByText("Dune (2021)"));

    expect(mockSendMessage).toHaveBeenCalledWith(
      "review [movieId:uuid-r1] Dune (2021)",
    );
    expect(mockSetClarification).toHaveBeenCalledWith(null);
  });

  it("review_delete needs-clarification envelope sets clarification with action=review-delete", () => {
    const candidates = [
      fakeMovie({ id: "uuid-d1", title: "Dune", year: 1984 }),
      fakeMovie({ id: "uuid-d2", title: "Dune", year: 2021 }),
    ];

    hookReturn = {
      ...defaultHookReturn,
      toolResults: [
        {
          toolName: "review_delete",
          toolCallId: "tc-1",
          result: {
            kind: "needs-clarification",
            candidates,
          },
        },
      ],
    };

    render(<MovieSearch />);

    expect(mockSetClarification).toHaveBeenCalledWith({
      action: "review-delete",
      candidates,
    });
  });

  it("watchlist_add needs-clarification envelope sets clarification with action=add", () => {
    const candidates = [
      fakeMovie({ id: "uuid-a1", title: "Arrival", year: 2016 }),
      fakeMovie({ id: "uuid-a2", title: "Arrival 2", year: 2020 }),
    ];

    hookReturn = {
      ...defaultHookReturn,
      toolResults: [
        {
          toolName: "watchlist_add",
          toolCallId: "tc-1",
          result: { kind: "needs-clarification", candidates },
        },
      ],
    };

    render(<MovieSearch />);

    expect(mockSetClarification).toHaveBeenCalledWith({
      action: "add",
      candidates,
    });
  });

  it("watchlist_remove needs-clarification envelope sets clarification with action=remove", () => {
    const candidates = [
      fakeMovie({ id: "uuid-r1", title: "Arrival", year: 2016 }),
      fakeMovie({ id: "uuid-r2", title: "Arrival 2", year: 2020 }),
    ];

    hookReturn = {
      ...defaultHookReturn,
      toolResults: [
        {
          toolName: "watchlist_remove",
          toolCallId: "tc-1",
          result: { kind: "needs-clarification", candidates },
        },
      ],
    };

    render(<MovieSearch />);

    expect(mockSetClarification).toHaveBeenCalledWith({
      action: "remove",
      candidates,
    });
  });

  it("clicking review-delete clarification candidate sends delete follow-up", () => {
    chatResultsReturn = {
      ...chatResultsReturn,
      clarification: {
        action: "review-delete",
        candidates: [fakeMovie({ id: "uuid-d2", title: "Dune", year: 2021 })],
      },
    };

    render(<MovieSearch />);
    fireEvent.click(screen.getByText("Dune (2021)"));

    expect(mockSendMessage).toHaveBeenCalledWith(
      "delete my review of [movieId:uuid-d2] Dune (2021)",
    );
    expect(mockSetClarification).toHaveBeenCalledWith(null);
  });

  it("review_delete success envelope with affected=['reviews'] triggers useReviews refetch", () => {
    hookReturn = {
      ...defaultHookReturn,
      toolResults: [
        {
          toolName: "review_delete",
          toolCallId: "tc-1",
          result: {
            kind: "success",
            affected: ["reviews"],
            message: "Review deleted for Inception",
            movie: fakeMovie({
              id: "11111111-1111-4111-8111-111111111111",
              title: "Inception",
              year: 2010,
            }),
          },
        },
      ],
    };

    render(<MovieSearch />);

    expect(mockRefetchReviews).toHaveBeenCalledTimes(1);
    expect(mockRefetch).not.toHaveBeenCalled();
  });

  it("watchlist_add success envelope with affected=['watchlist'] triggers useWatchlist refetch", () => {
    hookReturn = {
      ...defaultHookReturn,
      toolResults: [
        {
          toolName: "watchlist_add",
          toolCallId: "tc-1",
          result: {
            kind: "success",
            affected: ["watchlist"],
            message: "Inception added to watchlist",
            movie: fakeMovie({
              id: "11111111-1111-4111-8111-111111111111",
              title: "Inception",
              year: 2010,
            }),
          },
        },
      ],
    };

    render(<MovieSearch />);

    expect(mockRefetch).toHaveBeenCalledTimes(1);
    expect(mockRefetchReviews).not.toHaveBeenCalled();
  });

  it("watchlist_add error envelope does not refetch", () => {
    hookReturn = {
      ...defaultHookReturn,
      toolResults: [
        {
          toolName: "watchlist_add",
          toolCallId: "tc-1",
          result: {
            kind: "error",
            code: "not_found",
            message: "I couldn't find 'Foo' in the local catalog.",
          },
        },
      ],
    };

    render(<MovieSearch />);

    expect(mockRefetch).not.toHaveBeenCalled();
    expect(mockRefetchReviews).not.toHaveBeenCalled();
  });

  it("clicking add clarification candidate sends follow-up message with embedded movieId", () => {
    chatResultsReturn = {
      ...chatResultsReturn,
      clarification: {
        action: "add",
        candidates: [fakeMovie({ id: "uuid-1", title: "Arrival", year: 2016 })],
      },
    };

    render(<MovieSearch />);
    fireEvent.click(screen.getByText("Arrival (2016)"));

    expect(mockSendMessage).toHaveBeenCalledWith(
      "add [movieId:uuid-1] Arrival (2016) to my watchlist",
    );
    expect(mockSetClarification).toHaveBeenCalledWith(null);
  });
});
