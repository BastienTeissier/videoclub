import { moviesRepository } from "@repo/db";
import type { Database } from "@repo/db";

export function movieSearchService(db: Database) {
  const repo = moviesRepository(db);

  return {
    async search(query: string) {
      return repo.searchByTitle(query);
    },
  };
}
