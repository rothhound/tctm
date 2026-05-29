CREATE TYPE "public"."entity_type" AS ENUM('person', 'company', 'fund', 'deal');--> statement-breakpoint
CREATE TYPE "public"."feedback_action" AS ENUM('accepted', 'edited', 'dismissed', 'snoozed_indefinitely', 'auto_resolved');--> statement-breakpoint
CREATE TYPE "public"."prompt_purpose" AS ENUM('extract', 'judge', 'snooze', 'resolve');--> statement-breakpoint
CREATE TYPE "public"."signal_status" AS ENUM('pending', 'extracted', 'no_task', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."source" AS ENUM('gmail', 'slack', 'notion', 'granola');--> statement-breakpoint
CREATE TYPE "public"."task_bucket" AS ENUM('inbox', 'review', 'today', 'this_week', 'waiting_on', 'snoozed');--> statement-breakpoint
CREATE TYPE "public"."task_priority" AS ENUM('high', 'mid', 'low', 'none');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('pending', 'done');--> statement-breakpoint
CREATE TYPE "public"."task_type" AS ENUM('do', 'reply', 'review', 'decide', 'intro', 'waiting_on');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "entities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "entity_type" NOT NULL,
	"canonical_name" text NOT NULL,
	"aliases" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"context" text,
	"emails" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"slack_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notion_id" text,
	"related_entity_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_interaction_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "extraction_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"signal_id" uuid,
	"action" "feedback_action" NOT NULL,
	"reason" text,
	"extraction_snapshot" jsonb NOT NULL,
	"was_auto_created" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "gmail_watch_state" (
	"id" text PRIMARY KEY DEFAULT 'singleton' NOT NULL,
	"history_id" text NOT NULL,
	"watch_expires_at" timestamp with time zone NOT NULL,
	"last_synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "granola_poll_state" (
	"id" text PRIMARY KEY DEFAULT 'singleton' NOT NULL,
	"last_polled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_note_id" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "llm_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"signal_id" uuid,
	"task_id" uuid,
	"purpose" text NOT NULL,
	"prompt_version_id" uuid,
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
CREATE TABLE IF NOT EXISTS "oauth_tokens" (
	"provider" text PRIMARY KEY NOT NULL,
	"encrypted_refresh_token" text NOT NULL,
	"encrypted_access_token" text,
	"expires_at" timestamp with time zone,
	"scope" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "prompt_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"purpose" "prompt_purpose" NOT NULL,
	"version" integer NOT NULL,
	"content" text NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"performance" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"endpoint" text NOT NULL,
	"keys_p256dh" text NOT NULL,
	"keys_auth" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "signals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" "source" NOT NULL,
	"sub_source" text,
	"external_id" text NOT NULL,
	"dedup_key" text NOT NULL,
	"status" "signal_status" DEFAULT 'pending' NOT NULL,
	"payload" jsonb NOT NULL,
	"resolved_entity_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"extraction_attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "source_config" (
	"source" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"thresholds" jsonb NOT NULL,
	"filters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"type" "task_type" DEFAULT 'do' NOT NULL,
	"status" "task_status" DEFAULT 'pending' NOT NULL,
	"bucket" "task_bucket" DEFAULT 'inbox' NOT NULL,
	"priority" "task_priority" DEFAULT 'none' NOT NULL,
	"due_at" timestamp with time zone,
	"snooze_until" timestamp with time zone,
	"reminder_at" timestamp with time zone,
	"parent_task_id" uuid,
	"recurrence" jsonb,
	"entity_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source_signal_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"waiting_on_entity_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"extraction" jsonb,
	"review_required" boolean DEFAULT false NOT NULL,
	"auto_created" boolean DEFAULT false NOT NULL,
	"dedup_hash" text,
	"archived" boolean DEFAULT false NOT NULL,
	"archived_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "extraction_feedback" ADD CONSTRAINT "extraction_feedback_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "extraction_feedback" ADD CONSTRAINT "extraction_feedback_signal_id_signals_id_fk" FOREIGN KEY ("signal_id") REFERENCES "public"."signals"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "llm_audit_log" ADD CONSTRAINT "llm_audit_log_signal_id_signals_id_fk" FOREIGN KEY ("signal_id") REFERENCES "public"."signals"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "llm_audit_log" ADD CONSTRAINT "llm_audit_log_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "llm_audit_log" ADD CONSTRAINT "llm_audit_log_prompt_version_id_prompt_versions_id_fk" FOREIGN KEY ("prompt_version_id") REFERENCES "public"."prompt_versions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tasks" ADD CONSTRAINT "tasks_parent_task_id_tasks_id_fk" FOREIGN KEY ("parent_task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "entities_type_idx" ON "entities" USING btree ("type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "entities_canonical_name_idx" ON "entities" USING btree ("canonical_name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "feedback_task_id_idx" ON "extraction_feedback" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "feedback_action_created_at_idx" ON "extraction_feedback" USING btree ("action","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "llm_audit_signal_id_idx" ON "llm_audit_log" USING btree ("signal_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "llm_audit_purpose_created_at_idx" ON "llm_audit_log" USING btree ("purpose","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "prompt_versions_purpose_active_idx" ON "prompt_versions" USING btree ("purpose","active");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "prompt_versions_purpose_version_idx" ON "prompt_versions" USING btree ("purpose","version");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "push_subscriptions_endpoint_idx" ON "push_subscriptions" USING btree ("endpoint");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "signals_dedup_key_unique" ON "signals" USING btree ("dedup_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "signals_source_status_idx" ON "signals" USING btree ("source","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "signals_created_at_idx" ON "signals" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_status_idx" ON "tasks" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_bucket_idx" ON "tasks" USING btree ("bucket");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_priority_idx" ON "tasks" USING btree ("priority");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_due_at_idx" ON "tasks" USING btree ("due_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_dedup_hash_idx" ON "tasks" USING btree ("dedup_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_parent_task_id_idx" ON "tasks" USING btree ("parent_task_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_archived_idx" ON "tasks" USING btree ("archived");