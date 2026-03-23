import type { MovieDto } from "@repo/contracts";

interface MovieCardProps {
  movie: MovieDto;
}

export function MovieCard({ movie }: MovieCardProps) {
  return (
    <div className="group relative overflow-hidden rounded-lg">
      {movie.posterUrl ? (
        <img
          src={`https://image.tmdb.org/t/p/w300${movie.posterUrl}`}
          alt={movie.title}
          className="aspect-[2/3] w-full object-cover transition-transform duration-150 group-hover:-translate-y-0.5"
        />
      ) : (
        <div className="flex aspect-[2/3] w-full items-center justify-center bg-card text-sm text-muted">
          No poster
        </div>
      )}
      <div className="mt-1.5">
        <p className="truncate text-sm font-medium text-foreground">
          {movie.title}
        </p>
        {movie.year && (
          <p className="text-xs text-muted">{movie.year}</p>
        )}
      </div>
    </div>
  );
}
