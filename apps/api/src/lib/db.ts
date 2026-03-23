import { createDb } from "@repo/db";

const connectionString =
  process.env.DATABASE_URL ??
  "postgresql://videoclub:videoclub@localhost:5432/videoclub";

export const { db, client: dbClient } = createDb(connectionString);
