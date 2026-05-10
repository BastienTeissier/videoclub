ALTER TABLE "tool_calls" ADD COLUMN "ai_sdk_call_id" text;--> statement-breakpoint
CREATE INDEX "tool_calls_ai_sdk_call_id_idx" ON "tool_calls" USING btree ("ai_sdk_call_id");