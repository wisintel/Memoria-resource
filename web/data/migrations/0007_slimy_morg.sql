CREATE TYPE "public"."admission_actor_kind" AS ENUM('user', 'agent', 'system');--> statement-breakpoint
CREATE TYPE "public"."admission_outcome" AS ENUM('match_existing', 'match_with_alias', 'create_new', 'possible_same_as', 'merge', 'reject', 'defer');--> statement-breakpoint
CREATE TYPE "public"."candidate_bundle_status" AS ENUM('assembling', 'needs_review', 'committed', 'archived');--> statement-breakpoint
CREATE TYPE "public"."candidate_kind" AS ENUM('subject', 'claim', 'relationship');--> statement-breakpoint
CREATE TYPE "public"."candidate_state" AS ENUM('pending', 'proposed', 'admitted', 'rejected', 'deferred', 'superseded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."pipeline_run_status" AS ENUM('draft', 'running', 'needs_review', 'completed', 'failed', 'archived');--> statement-breakpoint
CREATE TYPE "public"."pipeline_step" AS ENUM('subject_extraction', 'claim_extraction', 'relationship_extraction', 'reconciliation');--> statement-breakpoint
CREATE TYPE "public"."pipeline_step_status" AS ENUM('pending', 'running', 'completed', 'failed', 'skipped');--> statement-breakpoint
CREATE TABLE "admission_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"candidate_id" uuid NOT NULL,
	"bundle_id" uuid NOT NULL,
	"outcome" "admission_outcome" NOT NULL,
	"actor_kind" "admission_actor_kind" NOT NULL,
	"rationale" text DEFAULT '' NOT NULL,
	"resulting_record_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"batch_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "candidate_bundles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"domain_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"label" text NOT NULL,
	"status" "candidate_bundle_status" DEFAULT 'assembling' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bundle_id" uuid NOT NULL,
	"run_step_id" uuid NOT NULL,
	"source_unit_id" uuid NOT NULL,
	"kind" "candidate_kind" NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"dedupe_key" text NOT NULL,
	"state" "candidate_state" DEFAULT 'pending' NOT NULL,
	"proposed_outcome" "admission_outcome",
	"proposed_target_id" uuid,
	"proposal_rationale" text,
	"proposal_confidence" real,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "candidates_bundle_kind_dedupe_unique" UNIQUE("bundle_id","kind","dedupe_key")
);
--> statement-breakpoint
CREATE TABLE "pipeline_run_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"step" "pipeline_step" NOT NULL,
	"step_order" integer NOT NULL,
	"status" "pipeline_step_status" DEFAULT 'pending' NOT NULL,
	"model" text,
	"prompt_version" text,
	"effort" text,
	"input_context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"raw_output" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"result_summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"candidate_count" integer DEFAULT 0 NOT NULL,
	"token_usage" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"latency_ms" integer,
	"cost" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error_message" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pipeline_run_steps_run_step_unique" UNIQUE("run_id","step")
);
--> statement-breakpoint
CREATE TABLE "pipeline_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"domain_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"scope" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "pipeline_run_status" DEFAULT 'draft' NOT NULL,
	"current_step" "pipeline_step" DEFAULT 'subject_extraction' NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error_message" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "record_provenance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"record_id" uuid NOT NULL,
	"record_class_key" text NOT NULL,
	"candidate_id" uuid NOT NULL,
	"source_unit_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admission_decisions" ADD CONSTRAINT "admission_decisions_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admission_decisions" ADD CONSTRAINT "admission_decisions_bundle_id_candidate_bundles_id_fk" FOREIGN KEY ("bundle_id") REFERENCES "public"."candidate_bundles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_bundles" ADD CONSTRAINT "candidate_bundles_id_objects_id_fk" FOREIGN KEY ("id") REFERENCES "public"."objects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_bundles" ADD CONSTRAINT "candidate_bundles_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_bundles" ADD CONSTRAINT "candidate_bundles_run_id_pipeline_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."pipeline_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_bundle_id_candidate_bundles_id_fk" FOREIGN KEY ("bundle_id") REFERENCES "public"."candidate_bundles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_run_step_id_pipeline_run_steps_id_fk" FOREIGN KEY ("run_step_id") REFERENCES "public"."pipeline_run_steps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_source_unit_id_source_units_id_fk" FOREIGN KEY ("source_unit_id") REFERENCES "public"."source_units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_run_steps" ADD CONSTRAINT "pipeline_run_steps_run_id_pipeline_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."pipeline_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_runs" ADD CONSTRAINT "pipeline_runs_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_runs" ADD CONSTRAINT "pipeline_runs_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "record_provenance" ADD CONSTRAINT "record_provenance_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "record_provenance" ADD CONSTRAINT "record_provenance_source_unit_id_source_units_id_fk" FOREIGN KEY ("source_unit_id") REFERENCES "public"."source_units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "record_provenance" ADD CONSTRAINT "record_provenance_run_id_pipeline_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."pipeline_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admission_decisions_candidate_id_idx" ON "admission_decisions" USING btree ("candidate_id");--> statement-breakpoint
CREATE INDEX "admission_decisions_bundle_id_idx" ON "admission_decisions" USING btree ("bundle_id");--> statement-breakpoint
CREATE INDEX "admission_decisions_batch_id_idx" ON "admission_decisions" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "candidate_bundles_domain_id_idx" ON "candidate_bundles" USING btree ("domain_id");--> statement-breakpoint
CREATE INDEX "candidate_bundles_run_id_idx" ON "candidate_bundles" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "candidate_bundles_status_idx" ON "candidate_bundles" USING btree ("status");--> statement-breakpoint
CREATE INDEX "candidates_bundle_id_idx" ON "candidates" USING btree ("bundle_id");--> statement-breakpoint
CREATE INDEX "candidates_run_step_id_idx" ON "candidates" USING btree ("run_step_id");--> statement-breakpoint
CREATE INDEX "candidates_source_unit_id_idx" ON "candidates" USING btree ("source_unit_id");--> statement-breakpoint
CREATE INDEX "candidates_state_idx" ON "candidates" USING btree ("state");--> statement-breakpoint
CREATE INDEX "candidates_proposed_target_id_idx" ON "candidates" USING btree ("proposed_target_id");--> statement-breakpoint
CREATE INDEX "pipeline_run_steps_run_order_idx" ON "pipeline_run_steps" USING btree ("run_id","step_order");--> statement-breakpoint
CREATE INDEX "pipeline_run_steps_status_idx" ON "pipeline_run_steps" USING btree ("status");--> statement-breakpoint
CREATE INDEX "pipeline_runs_domain_id_idx" ON "pipeline_runs" USING btree ("domain_id");--> statement-breakpoint
CREATE INDEX "pipeline_runs_document_id_idx" ON "pipeline_runs" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "pipeline_runs_status_idx" ON "pipeline_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "record_provenance_record_idx" ON "record_provenance" USING btree ("record_class_key","record_id");--> statement-breakpoint
CREATE INDEX "record_provenance_candidate_id_idx" ON "record_provenance" USING btree ("candidate_id");--> statement-breakpoint
CREATE INDEX "record_provenance_source_unit_id_idx" ON "record_provenance" USING btree ("source_unit_id");--> statement-breakpoint
CREATE INDEX "record_provenance_run_id_idx" ON "record_provenance" USING btree ("run_id");