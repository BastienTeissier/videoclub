import { useEffect } from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ViewingPreferences } from "@repo/contracts";
import { MemoryPanel } from "./memory-panel";
import {
  MemoryProvider,
  useMemoryContext,
} from "@/contexts/memory-context";

function Harness({
  initial,
  flash,
}: {
  initial?: ViewingPreferences;
  flash?: string[];
}) {
  const { applySnapshot, markApplied } = useMemoryContext();
  useEffect(() => {
    if (initial) applySnapshot(initial);
    if (flash) markApplied(flash);
  }, []);
  return null;
}

function renderPanel(initial?: ViewingPreferences, flash?: string[]) {
  return render(
    <MemoryProvider>
      <Harness initial={initial} flash={flash} />
      <MemoryPanel />
    </MemoryProvider>,
  );
}

describe("MemoryPanel", () => {
  it("renders the empty state when the snapshot is empty", () => {
    render(
      <MemoryProvider>
        <MemoryPanel />
      </MemoryProvider>,
    );
    expect(
      screen.getByText("No preferences captured yet."),
    ).toBeInTheDocument();
  });

  it("renders all four rows when the snapshot has every field", () => {
    renderPanel({
      genres: ["Comedy", "Drama"],
      maxRuntime: 120,
      moods: ["feel-good"],
      notes: ["one", "two"],
    });

    expect(screen.getByText("Comedy, Drama")).toBeInTheDocument();
    expect(screen.getByText("120 min")).toBeInTheDocument();
    expect(screen.getByText("feel-good")).toBeInTheDocument();
    const notes = screen.getAllByRole("listitem");
    expect(notes).toHaveLength(2);
    expect(notes[0]!).toHaveTextContent("two");
    expect(notes[1]!).toHaveTextContent("one");
  });

  it("flashes the row whose key is in flashingKeys", () => {
    renderPanel({ genres: ["Comedy"] }, ["genres"]);
    const rowDt = screen.getByText("Genres");
    const rowDiv = rowDt.parentElement!;
    expect(rowDiv.className).toContain("bg-amber-100");
  });

  it("caps the rendered notes list at 8 even if more come in", () => {
    const tenNotes = Array.from({ length: 10 }, (_, i) => `note-${i}`);
    renderPanel({ notes: tenNotes });
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(8);
  });

  it("does not flash when only applySnapshot is called", () => {
    renderPanel({ genres: ["Comedy"] });
    const rowDt = screen.getByText("Genres");
    const rowDiv = rowDt.parentElement!;
    expect(rowDiv.className).not.toContain("bg-amber-100");
  });
});
