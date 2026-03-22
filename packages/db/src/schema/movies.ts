import {
  pgTable,
  uuid,
  integer,
  text,
  timestamp,
  real,
  date,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const movies = pgTable(
  "movies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tmdbId: integer("tmdb_id").notNull(),
    title: text("title").notNull(),
    year: integer("year"),
    synopsis: text("synopsis"),
    genres: text("genres").array(),
    cast: text("cast").array(),
    directors: text("directors").array(),
    runtime: integer("runtime"),
    language: text("language"),
    posterUrl: text("poster_url"),
    backdropUrl: text("backdrop_url"),
    popularity: real("popularity"),
    releaseDate: date("release_date"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [uniqueIndex("movies_tmdb_id_idx").on(table.tmdbId)]
);

export type Movie = typeof movies.$inferSelect;
export type NewMovie = typeof movies.$inferInsert;
