"use client";

import { cn } from "@repo/ui";
import { useMemoryContext } from "@/contexts/memory-context";

const NOTES_DISPLAY_CAP = 8;

export function MemoryPanel() {
  const { snapshot, flashingKeys } = useMemoryContext();
  const isEmpty =
    !snapshot.genres?.length &&
    !snapshot.maxRuntime &&
    !snapshot.moods?.length &&
    !snapshot.notes?.length;

  return (
    <aside
      className="fixed right-4 top-4 z-30 max-h-[calc(100vh-2rem)] w-72 overflow-y-auto rounded-lg border bg-card p-4 text-sm shadow-sm"
      aria-label="Viewing preferences memory"
    >
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Memory
      </h2>
      {isEmpty ? (
        <p className="text-muted-foreground">No preferences captured yet.</p>
      ) : (
        <dl className="space-y-2">
          <Row label="Genres" keyName="genres" flashing={flashingKeys}>
            {snapshot.genres?.length ? snapshot.genres.join(", ") : "—"}
          </Row>
          <Row
            label="Max runtime"
            keyName="maxRuntime"
            flashing={flashingKeys}
          >
            {snapshot.maxRuntime ? `${snapshot.maxRuntime} min` : "—"}
          </Row>
          <Row label="Moods" keyName="moods" flashing={flashingKeys}>
            {snapshot.moods?.length ? snapshot.moods.join(", ") : "—"}
          </Row>
          <div
            className={cn(
              "rounded px-2 py-1 transition-colors",
              flashingKeys.has("notes") && "bg-amber-100",
            )}
          >
            <dt className="text-xs font-medium text-muted-foreground">Notes</dt>
            <dd>
              {snapshot.notes?.length ? (
                <ul className="mt-1 list-disc space-y-0.5 pl-4">
                  {snapshot.notes
                    .slice(-NOTES_DISPLAY_CAP)
                    .reverse()
                    .map((n, i) => (
                      <li key={i}>{n}</li>
                    ))}
                </ul>
              ) : (
                "—"
              )}
            </dd>
          </div>
        </dl>
      )}
    </aside>
  );
}

function Row({
  label,
  keyName,
  flashing,
  children,
}: {
  label: string;
  keyName: string;
  flashing: ReadonlySet<string>;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded px-2 py-1 transition-colors",
        flashing.has(keyName) && "bg-amber-100",
      )}
    >
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
