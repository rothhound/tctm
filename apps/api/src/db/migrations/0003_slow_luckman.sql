ALTER TABLE "tasks" ADD COLUMN "reported" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "reported_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "tasks_reported_idx" ON "tasks" USING btree ("reported");