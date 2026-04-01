import { watchlistRepository, moviesRepository } from "@repo/db";
import type { Database } from "@repo/db";

export function watchlistService(db: Database) {
  const watchlistRepo = watchlistRepository(db);
  const moviesRepo = moviesRepository(db);

  return {
    async add(userId: string, movieId: string) {
      const item = await watchlistRepo.add(userId, movieId);
      const movie = await moviesRepo.findById(movieId);
      const title = movie?.title ?? "Movie";

      if (!item) {
        return { added: false, message: `${title} is already in your watchlist` };
      }

      return { added: true, message: `${title} added to watchlist` };
    },

    async remove(userId: string, movieId: string) {
      const count = await watchlistRepo.remove(userId, movieId);

      if (count === 0) {
        return { removed: false, message: "Movie is not in your watchlist" };
      }

      return { removed: true, message: "Movie removed from watchlist" };
    },

    async list(userId: string) {
      const items = await watchlistRepo.listByUser(userId);
      return { items, count: items.length };
    },

    async getWatchlistedIds(userId: string, movieIds: string[]) {
      return watchlistRepo.getWatchlistedMovieIds(userId, movieIds);
    },
  };
}
