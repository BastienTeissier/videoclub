"use client";

import { useEffect, useRef } from "react";
import type { MovieDto } from "@repo/contracts";
import { useA2UISurface } from "../store";
import { get } from "../json-pointer";
import { registerHighlighter } from "../highlight-registry";
import type { RendererProps } from "../renderer-types";

interface ComparisonState {
  shortlistIds?: string[];
  criteria?: string[];
}

const CELL_GETTERS: Record<string, (m: MovieDto) => string> = {
  runtime: (m) => (m.runtime ? `${m.runtime} min` : "—"),
  year: (m) => (m.year ? String(m.year) : "—"),
  director: (m) => m.directors?.[0] ?? "—",
  genres: (m) => (m.genres ?? []).join(", ") || "—",
};

export function MovieComparisonTable({ node, surfaceId }: RendererProps) {
  const surface = useA2UISurface(surfaceId);
  const path = node.data?.path ?? "/comparison";
  const state =
    (get(surface?.dataModel, path) as ComparisonState | undefined) ?? {};
  const movies = (get(surface?.dataModel, "/movies") as MovieDto[] | undefined) ?? [];
  const ids = state.shortlistIds ?? [];
  const criteria = state.criteria ?? [];
  const rows = ids
    .map((id) => movies.find((m) => m.id === id))
    .filter((m): m is MovieDto => Boolean(m));

  const colRefs = useRef<Record<string, HTMLTableColElement | null>>({});
  useEffect(() => {
    return registerHighlighter(surfaceId, (which) => {
      for (const c of which) {
        const el = colRefs.current[c];
        if (!el) continue;
        el.classList.remove("a2ui-flash");
        // Force reflow so the animation restarts when re-adding the class.
        void el.offsetWidth;
        el.classList.add("a2ui-flash");
      }
    });
  }, [surfaceId]);

  if (rows.length === 0) {
    return <p className="text-sm text-muted">No movies to compare.</p>;
  }

  return (
    <table className="w-full text-sm">
      <colgroup>
        <col />
        {criteria.map((c) => (
          <col
            key={c}
            ref={(el) => {
              colRefs.current[c] = el;
            }}
          />
        ))}
      </colgroup>
      <thead>
        <tr>
          <th className="text-left">Movie</th>
          {criteria.map((c) => (
            <th key={c} className="text-left capitalize">
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((m) => (
          <tr key={m.id}>
            <td className="font-medium">
              {m.title}
              {m.year ? ` (${m.year})` : ""}
            </td>
            {criteria.map((c) => (
              <td key={c}>{(CELL_GETTERS[c] ?? (() => "—"))(m)}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
