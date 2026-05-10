"use client";

import { SURFACE_IDS, type MovieDto } from "@repo/contracts";
import { useA2UISurface } from "@/lib/a2ui/store";
import { get } from "@/lib/a2ui/json-pointer";

export interface MovieNightSummaryProps {
  pickedMovieId: string;
  backupMovieIds: string[];
}

function formatTitle(movie: MovieDto): string {
  return movie.year ? `${movie.title} (${movie.year})` : movie.title;
}

export function MovieNightSummary({
  pickedMovieId,
  backupMovieIds,
}: MovieNightSummaryProps) {
  const surface = useA2UISurface(SURFACE_IDS.discovery);
  const movies = (get(surface?.dataModel, "/movies") as MovieDto[] | undefined) ?? [];
  const picked = movies.find((m) => m.id === pickedMovieId);
  const backups = backupMovieIds
    .map((id) => movies.find((m) => m.id === id))
    .filter((m): m is MovieDto => Boolean(m));

  return (
    <div className="space-y-2 text-sm">
      <p>
        <span className="text-muted">Picked:</span>{" "}
        {picked ? formatTitle(picked) : pickedMovieId}
      </p>
      {backupMovieIds.length > 0 && (
        <p>
          <span className="text-muted">
            Backup{backupMovieIds.length > 1 ? "s" : ""}:
          </span>{" "}
          {backups.length > 0
            ? backups.map(formatTitle).join(", ")
            : backupMovieIds.join(", ")}
        </p>
      )}
    </div>
  );
}
