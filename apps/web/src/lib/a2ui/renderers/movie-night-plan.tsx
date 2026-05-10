"use client";

import type { MovieDto } from "@repo/contracts";
import { MovieCard } from "@/components/movie-card";
import { useA2UISurface } from "../store";
import { get } from "../json-pointer";
import type { RendererProps } from "../renderer-types";

interface PlanState {
  pickedMovieId?: string;
  backupMovieIds?: string[];
  reason?: string | null;
}

export function MovieNightPlan({ node, surfaceId }: RendererProps) {
  const surface = useA2UISurface(surfaceId);
  const path = node.data?.path ?? "/plan";
  const plan = (get(surface?.dataModel, path) as PlanState | undefined) ?? {};
  const movies = (get(surface?.dataModel, "/movies") as MovieDto[] | undefined) ?? [];
  const picked = movies.find((m) => m.id === plan.pickedMovieId);
  const backups = (plan.backupMovieIds ?? [])
    .map((id) => movies.find((m) => m.id === id))
    .filter((m): m is MovieDto => Boolean(m));

  if (!picked) return <p className="text-sm text-muted">No pick yet.</p>;

  return (
    <section className="space-y-4">
      <div>
        <p className="mb-2 text-xs uppercase tracking-wide text-muted">
          Tonight
        </p>
        <div className="max-w-xs">
          <MovieCard movie={picked} alwaysShowOverlays />
        </div>
      </div>
      {backups.length > 0 && (
        <div>
          <p className="mb-2 text-xs uppercase tracking-wide text-muted">
            Backups
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {backups.map((m) => (
              <MovieCard key={m.id} movie={m} />
            ))}
          </div>
        </div>
      )}
      {plan.reason && <p className="text-sm italic text-muted">{plan.reason}</p>}
    </section>
  );
}
