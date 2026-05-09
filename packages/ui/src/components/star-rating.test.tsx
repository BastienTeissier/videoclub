import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { StarRating } from "./star-rating.js";

describe("StarRating", () => {
  it("renders 10 half-buttons in interactive mode", () => {
    render(<StarRating value={0} onChange={() => {}} />);
    expect(screen.getAllByRole("button")).toHaveLength(10);
  });

  it("click left half of star 4 → onChange(3.5)", () => {
    const onChange = vi.fn();
    render(<StarRating value={0} onChange={onChange} />);
    const button = screen.getByLabelText("Rate 3.5 stars");
    button.click();
    expect(onChange).toHaveBeenCalledWith(3.5);
  });

  it("click right half of star 4 → onChange(4)", () => {
    const onChange = vi.fn();
    render(<StarRating value={0} onChange={onChange} />);
    const button = screen.getByLabelText("Rate 4 stars");
    button.click();
    expect(onChange).toHaveBeenCalledWith(4);
  });

  it("readOnly=true → no interactive buttons", () => {
    const onChange = vi.fn();
    render(<StarRating value={3.5} onChange={onChange} readOnly />);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("readOnly=true → exposes aria-label with rating", () => {
    render(<StarRating value={3.5} readOnly />);
    expect(screen.getByLabelText("Rating: 3.5 out of 5")).toBeInTheDocument();
  });
});