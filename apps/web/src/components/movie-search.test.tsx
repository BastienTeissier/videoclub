import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MovieSearch } from "./movie-search";

describe("MovieSearch", () => {
  it("renders the search input", () => {
    render(<MovieSearch />);
    const input = screen.getByPlaceholderText("what do you want to watch?");
    expect(input).toBeInTheDocument();
  });
});
