import {
  pgTable,
  uuid,
  text,
  numeric,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { movies } from "./movies.js";

export const reviews = pgTable(
  "reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    movieId: uuid("movie_id")
      .notNull()
      .references(() => movies.id),
    rating: numeric("rating", { precision: 2, scale: 1 }).notNull(),
    text: text("text"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("reviews_user_movie_idx").on(table.userId, table.movieId),
    index("reviews_user_id_idx").on(table.userId),
  ]
);

export type Review = typeof reviews.$inferSelect;
export type NewReview = typeof reviews.$inferInsert;
