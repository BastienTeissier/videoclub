import { TmdbClient } from "@repo/tmdb-client";

let instance: TmdbClient | null = null;

export function getTmdbClient(): TmdbClient {
  if (!instance) {
    const apiKey = process.env.TMDB_API_KEY;
    if (!apiKey) {
      throw new Error("TMDB_API_KEY environment variable is not set");
    }
    instance = new TmdbClient(apiKey);
  }
  return instance;
}
