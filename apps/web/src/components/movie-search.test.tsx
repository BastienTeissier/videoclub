import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { MovieDto } from "@repo/contracts";
import { MovieSearch } from "./movie-search.js";
import { applyMessage, clearAllSurfaces } from "@/lib/a2ui/store";

const mockSendMessage = vi.fn();
const mockRespondToInterrupt = vi.fn();
const mockCancelInterrupt = vi.fn();

interface PendingInterrupt {
  id: string;
  reason: string;
  message: string;
  proposed: unknown;
  responseSchema: unknown;
}

const defaultHookReturn = {
  messages: [] as { id: string; role: string; content: string }[],
  isLoading: false,
  error: null as string | null,
  pendingInterrupt: null as PendingInterrupt | null,
  toolResults: [] as { toolName: string; toolCallId: string; result: unknown }[],
  sendMessage: mockSendMessage,
  respondToInterrupt: mockRespondToInterrupt,
  cancelInterrupt: mockCancelInterrupt,
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

vi.mock("@repo/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@repo/ui")>();
  return { ...actual, toast: vi.fn() };
});

beforeEach(() => {
  vi.clearAllMocks();
  clearAllSurfaces();
  hookReturn = { ...defaultHookReturn };
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

  it("shows TMDB confirmation button when pendingInterrupt is a search_tmdb approval", () => {
    hookReturn = {
      ...defaultHookReturn,
      pendingInterrupt: {
        id: "tc-1",
        reason: "approval",
        message: "Approve calling search_tmdb?",
        proposed: { toolName: "search_tmdb", input: { query: "Stalker" } },
        responseSchema: { type: "object" },
      },
    };

    render(<MovieSearch />);
    expect(screen.getByText("Search TMDB for more results")).toBeInTheDocument();
  });

  it("clicking confirm button calls respondToInterrupt with { approved: true }", () => {
    hookReturn = {
      ...defaultHookReturn,
      pendingInterrupt: {
        id: "tc-1",
        reason: "approval",
        message: "Approve calling search_tmdb?",
        proposed: { toolName: "search_tmdb", input: { query: "Stalker" } },
        responseSchema: { type: "object" },
      },
    };

    render(<MovieSearch />);
    fireEvent.click(screen.getByText("Search TMDB for more results"));

    expect(mockRespondToInterrupt).toHaveBeenCalledWith("tc-1", {
      approved: true,
    });
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

  it("clarification interrupt renders candidate buttons", () => {
    const candidates = [
      fakeMovie({
        id: "11111111-1111-4111-8111-111111111111",
        title: "Dune",
        year: 1984,
      }),
      fakeMovie({
        id: "22222222-2222-4222-8222-222222222222",
        title: "Dune",
        year: 2021,
      }),
    ];

    hookReturn = {
      ...defaultHookReturn,
      pendingInterrupt: {
        id: "call_clar",
        reason: "clarification",
        message: "Which movie did you mean?",
        proposed: { candidates },
        responseSchema: { type: "object" },
      },
    };

    render(<MovieSearch />);
    expect(screen.getByText("Which movie did you mean?")).toBeInTheDocument();
    expect(screen.getByText("Dune (1984)")).toBeInTheDocument();
    expect(screen.getByText("Dune (2021)")).toBeInTheDocument();
  });

  it("clicking a clarification candidate calls respondToInterrupt with pickedMovieId", () => {
    const candidates = [
      fakeMovie({
        id: "11111111-1111-4111-8111-111111111111",
        title: "Dune",
        year: 1984,
      }),
      fakeMovie({
        id: "22222222-2222-4222-8222-222222222222",
        title: "Dune",
        year: 2021,
      }),
    ];

    hookReturn = {
      ...defaultHookReturn,
      pendingInterrupt: {
        id: "call_clar",
        reason: "clarification",
        message: "Which movie did you mean?",
        proposed: { candidates },
        responseSchema: { type: "object" },
      },
    };

    render(<MovieSearch />);
    fireEvent.click(screen.getByText("Dune (2021)"));

    expect(mockRespondToInterrupt).toHaveBeenCalledWith("call_clar", {
      pickedMovieId: "22222222-2222-4222-8222-222222222222",
    });
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

});