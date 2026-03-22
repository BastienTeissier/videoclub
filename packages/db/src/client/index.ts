import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

export function createDb(connectionString: string) {
  const client = postgres(connectionString);
  const db = drizzle(client);
  return { db, client };
}

export type Database = ReturnType<typeof createDb>["db"];
