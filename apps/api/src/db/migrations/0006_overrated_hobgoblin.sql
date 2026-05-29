CREATE TABLE "task_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "task_notes" ADD CONSTRAINT "task_notes_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "task_notes_task_id_idx" ON "task_notes" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "task_notes_created_at_idx" ON "task_notes" USING btree ("created_at");--> statement-breakpoint
INSERT INTO "task_notes" ("task_id", "content", "created_at")
SELECT "id", "notes", COALESCE("updated_at", "created_at")
FROM "tasks"
WHERE "notes" IS NOT NULL AND "notes" != '';