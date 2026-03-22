CREATE TABLE "movies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tmdb_id" integer NOT NULL,
	"title" text NOT NULL,
	"year" integer,
	"synopsis" text,
	"genres" text[],
	"cast" text[],
	"directors" text[],
	"runtime" integer,
	"language" text,
	"poster_url" text,
	"backdrop_url" text,
	"popularity" real,
	"release_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "movies_tmdb_id_idx" ON "movies" USING btree ("tmdb_id");