import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MovieSearch } from "./movie-search";

vi.mock("@/lib/api/chat", () => ({
  chatSearch: vi.fn(),
}));

import { chatSearch } from "@/lib/api/chat";

const mockChatSearch = vi.mocked(chatSearch);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("MovieSearch", () => {
  it("renders the search input", () => {
    render(<MovieSearch />);
    const input = screen.getByPlaceholderText("what do you want to watch?");
    expect(input).toBeInTheDocument();
  });

  it("calls chat endpoint on Enter submit", async () => {
    mockChatSearch.mockResolvedValue({
      sessionId: "00000000-0000-0000-0000-000000000001",
      response: "Results found",
      toolResults: [],
    });

    render(<MovieSearch />);
    const input = screen.getByPlaceholderText("what do you want to watch?");

    fireEvent.change(input, { target: { value: "Spielberg movies" } });
    fireEvent.submit(input.closest("form")!);

    await waitFor(() => {
      expect(mockChatSearch).toHaveBeenCalledWith("Spielberg movies");
    });
  });

  it("displays agent response text", async () => {
    mockChatSearch.mockResolvedValue({
      sessionId: "00000000-0000-0000-0000-000000000001",
      response: "Here are Spielberg movies",
      toolResults: [],
    });

    render(<MovieSearch />);
    const input = screen.getByPlaceholderText("what do you want to watch?");

    fireEvent.change(input, { target: { value: "Spielberg" } });
    fireEvent.submit(input.closest("form")!);

    await waitFor(() => {
      expect(
        screen.getByText("Here are Spielberg movies")
      ).toBeInTheDocument();
    });
  });

  it("renders movie cards from tool results", async () => {
    mockChatSearch.mockResolvedValue({
      sessionId: "00000000-0000-0000-0000-000000000001",
      response: "Found movies",
      toolResults: [
        {
          toolName: "search_movies",
          input: { director: "Spielberg" },
          output: [
            {
              id: "00000000-0000-0000-0000-000000000002",
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
    });

    render(<MovieSearch />);
    const input = screen.getByPlaceholderText("what do you want to watch?");

    fireEvent.change(input, { target: { value: "Spielberg" } });
    fireEvent.submit(input.closest("form")!);

    await waitFor(() => {
      expect(screen.getByText("Jaws")).toBeInTheDocument();
    });
  });
});
