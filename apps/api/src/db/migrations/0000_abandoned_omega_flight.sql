CREATE TYPE "public"."entity_type" AS ENUM('person', 'company', 'fund', 'deal');--> statement-breakpoint
CREATE TYPE "public"."feedback_action" AS ENUM('accepted', 'edited', 'dismissed', 'snoozed_indefinitely', 'auto_resolved');--> statement-breakpoint
CREATE TYPE "public"."prompt_purpose" AS ENUM('extract', 'judge', 'snooze', 'resolve');--> statement-breakpoint
CREATE TYPE "public"."signal_status" AS ENUM('pending', 'extracted', 'no_task', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."source" AS ENUM('gmail', 'slack', 'notion', 'granola');--> statement-breakpoint
CREATE TYPE "public"."task_bucket" AS ENUM('inbox', 'review');--> statement-breakpoint
CREATE TYPE "public"."task_priority" AS ENUM('high', 'mid', 'low', 'none');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('pending', 'done');--> statement-breakpoint
CREATE TABLE "entities" (
	"id" varchar(8) PRIMARY KEY NOT NULL,
	"type" "entity_type" NOT NULL,
	"canonical_name" text NOT NULL,
	"aliases" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"context" text,
	"emails" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"slack_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notion_id" text,
	"last_interaction_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "extraction_feedback" (
	"id" varchar(8) PRIMARY KEY NOT NULL,
	"task_id" varchar(8) NOT NULL,
	"signal_id" varchar(8),
	"action" "feedback_action" NOT NULL,
	"reason" text,
	"extraction_snapshot" jsonb NOT NULL,
	"was_auto_created" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gmail_watch_state" (
	"id" text PRIMARY KEY DEFAULT 'singleton' NOT NULL,
	"history_id" text NOT NULL,
	"watch_expires_at" timestamp with time zone NOT NULL,
	"last_synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "granola_poll_state" (
	"id" text PRIMARY KEY DEFAULT 'singleton' NOT NULL,
	"last_polled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_note_id" text
);
--> statement-breakpoint
CREATE TABLE "llm_audit_log" (
	"id" varchar(8) PRIMARY KEY NOT NULL,
	"signal_id" varchar(8),
	"task_id" varchar(8),
	"purpose" text NOT NULL,
	"prompt_version_id" varchar(8),
	"model" text NOT NULL,
	"input_tokens" integer,
	"output_tokens" integer,
	"cache_read_tokens" integer,
	"cache_creation_tokens" integer,
	"prompt_hash" text,
	"input_snapshot" jsonb,
	"output_snapshot" jsonb,
	"latency_ms" integer,
	"cost_usd" real,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_tokens" (
	"provider" text PRIMARY KEY NOT NULL,
	"encrypted_refresh_token" text NOT NULL,
	"encrypted_access_token" text,
	"expires_at" timestamp with time zone,
	"scope" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prompt_versions" (
	"id" varchar(8) PRIMARY KEY NOT NULL,
	"purpose" "prompt_purpose" NOT NULL,
	"version" integer NOT NULL,
	"content" text NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"performance" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" varchar(8) PRIMARY KEY NOT NULL,
	"endpoint" text NOT NULL,
	"keys_p256dh" text NOT NULL,
	"keys_auth" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signals" (
	"id" varchar(8) PRIMARY KEY NOT NULL,
	"source" "source" NOT NULL,
	"sub_source" text,
	"external_id" text NOT NULL,
	"dedup_key" text NOT NULL,
	"status" "signal_status" DEFAULT 'pending' NOT NULL,
	"payload" jsonb NOT NULL,
	"extraction_attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "source_config" (
	"source" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"thresholds" jsonb NOT NULL,
	"filters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_notes" (
	"id" varchar(8) PRIMARY KEY NOT NULL,
	"task_id" varchar(8) NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" varchar(8) PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" "task_status" DEFAULT 'pending' NOT NULL,
	"bucket" "task_bucket" DEFAULT 'inbox' NOT NULL,
	"priority" "task_priority" DEFAULT 'none' NOT NULL,
	"source" text,
	"due_at" timestamp with time zone,
	"reminder_at" timestamp with time zone,
	"parent_task_id" varchar(8),
	"recurrence" jsonb,
	"entity_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source_signal_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"waiting_on_entity_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"extraction" jsonb,
	"auto_created" boolean DEFAULT false NOT NULL,
	"dedup_hash" text,
	"archived" boolean DEFAULT false NOT NULL,
	"archived_at" timestamp with time zone,
	"reported" boolean DEFAULT false NOT NULL,
	"reported_at" timestamp with time zone,
	"report_reason" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "extraction_feedback" ADD CONSTRAINT "extraction_feedback_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extraction_feedback" ADD CONSTRAINT "extraction_feedback_signal_id_signals_id_fk" FOREIGN KEY ("signal_id") REFERENCES "public"."signals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llm_audit_log" ADD CONSTRAINT "llm_audit_log_signal_id_signals_id_fk" FOREIGN KEY ("signal_id") REFERENCES "public"."signals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llm_audit_log" ADD CONSTRAINT "llm_audit_log_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llm_audit_log" ADD CONSTRAINT "llm_audit_log_prompt_version_id_prompt_versions_id_fk" FOREIGN KEY ("prompt_version_id") REFERENCES "public"."prompt_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_notes" ADD CONSTRAINT "task_notes_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_parent_task_id_tasks_id_fk" FOREIGN KEY ("parent_task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "entities_type_idx" ON "entities" USING btree ("type");--> statement-breakpoint
CREATE INDEX "entities_canonical_name_idx" ON "entities" USING btree ("canonical_name");--> statement-breakpoint
CREATE INDEX "feedback_task_id_idx" ON "extraction_feedback" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "feedback_action_created_at_idx" ON "extraction_feedback" USING btree ("action","created_at");--> statement-breakpoint
CREATE INDEX "llm_audit_signal_id_idx" ON "llm_audit_log" USING btree ("signal_id");--> statement-breakpoint
CREATE INDEX "llm_audit_purpose_created_at_idx" ON "llm_audit_log" USING btree ("purpose","created_at");--> statement-breakpoint
CREATE INDEX "prompt_versions_purpose_active_idx" ON "prompt_versions" USING btree ("purpose","active");--> statement-breakpoint
CREATE UNIQUE INDEX "prompt_versions_purpose_version_idx" ON "prompt_versions" USING btree ("purpose","version");--> statement-breakpoint
CREATE UNIQUE INDEX "push_subscriptions_endpoint_idx" ON "push_subscriptions" USING btree ("endpoint");--> statement-breakpoint
CREATE UNIQUE INDEX "signals_dedup_key_unique" ON "signals" USING btree ("dedup_key");--> statement-breakpoint
CREATE INDEX "signals_source_status_idx" ON "signals" USING btree ("source","status");--> statement-breakpoint
CREATE INDEX "signals_created_at_idx" ON "signals" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "task_notes_task_id_idx" ON "task_notes" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "task_notes_created_at_idx" ON "task_notes" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "tasks_status_idx" ON "tasks" USING btree ("status");--> statement-breakpoint
CREATE INDEX "tasks_bucket_idx" ON "tasks" USING btree ("bucket");--> statement-breakpoint
CREATE INDEX "tasks_priority_idx" ON "tasks" USING btree ("priority");--> statement-breakpoint
CREATE INDEX "tasks_due_at_idx" ON "tasks" USING btree ("due_at");--> statement-breakpoint
CREATE INDEX "tasks_dedup_hash_idx" ON "tasks" USING btree ("dedup_hash");--> statement-breakpoint
CREATE INDEX "tasks_parent_task_id_idx" ON "tasks" USING btree ("parent_task_id");--> statement-breakpoint
CREATE INDEX "tasks_archived_idx" ON "tasks" USING btree ("archived");--> statement-breakpoint
CREATE INDEX "tasks_reported_idx" ON "tasks" USING btree ("reported");