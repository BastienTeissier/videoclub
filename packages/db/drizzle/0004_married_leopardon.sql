CREATE TABLE "movie_night_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"run_id" uuid NOT NULL,
	"picked_movie_id" uuid NOT NULL,
	"backup_movie_ids" uuid[] DEFAULT '{}' NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_sessions" ADD COLUMN "viewing_preferences" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "movie_night_plans" ADD CONSTRAINT "movie_night_plans_run_id_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movie_night_plans" ADD CONSTRAINT "movie_night_plans_picked_movie_id_movies_id_fk" FOREIGN KEY ("picked_movie_id") REFERENCES "public"."movies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "movie_night_plans_user_id_idx" ON "movie_night_plans" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "movie_night_plans_run_id_idx" ON "movie_night_plans" USING btree ("run_id");