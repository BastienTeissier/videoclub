"use client";

import type { MovieDto } from "@repo/contracts";
import { useA2UISurface } from "../store.js";
import { get } from "../json-pointer.js";
import { MovieCard } from "@/components/movie-card";
import type { RendererProps } from "../renderer-types.js";

export function MovieGrid({ node, surfaceId }: RendererProps) {
  const surface = useA2UISurface(surfaceId);
  const path = node.data?.path;
  const movies =
    path && surface
      ? ((get(surface.dataModel, path) as MovieDto[] | undefined) ?? [])
      : [];

  if (movies.length === 0) {
    return <p className="text-sm text-muted">No movies found.</p>;
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {movies.map((movie) => (
        <MovieCard key={movie.id} movie={movie} />
      ))}
    </div>
  );
}