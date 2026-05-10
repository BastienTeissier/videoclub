import type { MovieDto } from "@repo/contracts";

// Server-side resolution of comparison-table cell values. The renderer is
// kept dumb: it reads `/comparison/cells/{movieId}/{criterion}` directly
// instead of carrying its own per-criterion getters. Unknown criteria
// resolve to "—" here so the same placeholder appears regardless of the
// criterion the LLM supplied — and the server can be extended in one
// place when new derived fields are needed.
export const PLACEHOLDER = "—";

const KNOWN_GETTERS: Record<string, (m: MovieDto) => string> = {
  runtime: (m) => (m.runtime ? `${m.runtime} min` : PLACEHOLDER),
  year: (m) => (m.year ? String(m.year) : PLACEHOLDER),
  director: (m) => m.directors?.[0] ?? PLACEHOLDER,
  genres: (m) => (m.genres?.length ? m.genres.join(", ") : PLACEHOLDER),
};

export type ComparisonCells = Record<string, Record<string, string>>;

export function resolveComparisonCells(
  movies: MovieDto[],
  criteria: readonly string[],
): ComparisonCells {
  const cells: ComparisonCells = {};
  for (const movie of movies) {
    const row: Record<string, string> = {};
    for (const criterion of criteria) {
      const getter = KNOWN_GETTERS[criterion];
      row[criterion] = getter ? getter(movie) : PLACEHOLDER;
    }
    cells[movie.id] = row;
  }
  return cells;
}
