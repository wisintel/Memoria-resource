DROP TABLE IF EXISTS "admission_decisions" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "candidates" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "candidate_bundles" CASCADE;
--> statement-breakpoint
ALTER TABLE "record_provenance" DROP COLUMN IF EXISTS "candidate_id";
--> statement-breakpoint
DELETE FROM "pipeline_run_steps";
--> statement-breakpoint
DELETE FROM "pipeline_runs";
--> statement-breakpoint
ALTER TABLE "pipeline_run_steps" RENAME COLUMN "candidate_count" TO "claim_count";
--> statement-breakpoint
ALTER TABLE "pipeline_run_steps" ALTER COLUMN "step" TYPE text USING "step"::text;
--> statement-breakpoint
ALTER TABLE "pipeline_runs" ALTER COLUMN "current_step" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "pipeline_runs" ALTER COLUMN "current_step" TYPE text USING "current_step"::text;
--> statement-breakpoint
DROP TYPE IF EXISTS "pipeline_step";
--> statement-breakpoint
CREATE TYPE "pipeline_step" AS ENUM('explicit_pass', 'inferred_pass', 'atomization', 'modality_classification');
--> statement-breakpoint
ALTER TABLE "pipeline_run_steps" ALTER COLUMN "step" TYPE "pipeline_step" USING "step"::"pipeline_step";
--> statement-breakpoint
ALTER TABLE "pipeline_runs" ALTER COLUMN "current_step" TYPE "pipeline_step" USING 'explicit_pass'::"pipeline_step";
--> statement-breakpoint
ALTER TABLE "pipeline_runs" ALTER COLUMN "current_step" SET DEFAULT 'explicit_pass';
--> statement-breakpoint
DROP TYPE IF EXISTS "candidate_bundle_status";
--> statement-breakpoint
DROP TYPE IF EXISTS "candidate_kind";
--> statement-breakpoint
DROP TYPE IF EXISTS "candidate_state";
--> statement-breakpoint
DROP TYPE IF EXISTS "admission_outcome";
--> statement-breakpoint
DROP TYPE IF EXISTS "admission_actor_kind";
--> statement-breakpoint
CREATE TYPE "extraction_claim_kind" AS ENUM('taxonomic', 'structural', 'causal', 'functional', 'spatial', 'temporal', 'attributive');
--> statement-breakpoint
CREATE TYPE "extraction_modality" AS ENUM('empirical', 'normative', 'projection', 'reported', 'rhetorical');
--> statement-breakpoint
CREATE TYPE "extraction_assertion" AS ENUM('explicit', 'inferred');
--> statement-breakpoint
CREATE TYPE "extraction_mention_role" AS ENUM('g_subject', 'g_object', 'other');
--> statement-breakpoint
CREATE TYPE "extraction_kind_hint" AS ENUM('actor', 'object', 'concept', 'event');
--> statement-breakpoint
ALTER TABLE "documents" DROP COLUMN IF EXISTS "intake_profile";
--> statement-breakpoint
CREATE TABLE "extraction_bundles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"domain_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"label" text NOT NULL,
	"schema_version" text DEFAULT 'bundle-v1' NOT NULL,
	"status" text DEFAULT 'assembling' NOT NULL,
	"document" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"extractor" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "extraction_claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bundle_id" uuid NOT NULL,
	"run_step_id" uuid,
	"claim_id" text NOT NULL,
	"text" text NOT NULL,
	"kind" "extraction_claim_kind" NOT NULL,
	"modality" "extraction_modality" NOT NULL,
	"assertion" "extraction_assertion" NOT NULL,
	"predicate" text,
	"flags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "extraction_claims_bundle_claim_unique" UNIQUE("bundle_id","claim_id")
);
--> statement-breakpoint
CREATE TABLE "extraction_claim_mentions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"claim_row_id" uuid NOT NULL,
	"text" text NOT NULL,
	"role" "extraction_mention_role" NOT NULL,
	"kind_hint" "extraction_kind_hint" NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "extraction_claim_provenance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"claim_row_id" uuid NOT NULL,
	"source_unit_id" uuid NOT NULL,
	"shard_id" text NOT NULL,
	"locator" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"quote" text,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "extraction_claim_inferred_from" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"claim_row_id" uuid NOT NULL,
	"source_claim_id" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "extraction_bundles" ADD CONSTRAINT "extraction_bundles_id_objects_id_fk" FOREIGN KEY ("id") REFERENCES "public"."objects"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "extraction_bundles" ADD CONSTRAINT "extraction_bundles_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "extraction_bundles" ADD CONSTRAINT "extraction_bundles_run_id_pipeline_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."pipeline_runs"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "extraction_bundles" ADD CONSTRAINT "extraction_bundles_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "extraction_claims" ADD CONSTRAINT "extraction_claims_bundle_id_extraction_bundles_id_fk" FOREIGN KEY ("bundle_id") REFERENCES "public"."extraction_bundles"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "extraction_claims" ADD CONSTRAINT "extraction_claims_run_step_id_pipeline_run_steps_id_fk" FOREIGN KEY ("run_step_id") REFERENCES "public"."pipeline_run_steps"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "extraction_claim_mentions" ADD CONSTRAINT "extraction_claim_mentions_claim_row_id_extraction_claims_id_fk" FOREIGN KEY ("claim_row_id") REFERENCES "public"."extraction_claims"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "extraction_claim_provenance" ADD CONSTRAINT "extraction_claim_provenance_claim_row_id_extraction_claims_id_fk" FOREIGN KEY ("claim_row_id") REFERENCES "public"."extraction_claims"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "extraction_claim_provenance" ADD CONSTRAINT "extraction_claim_provenance_source_unit_id_source_units_id_fk" FOREIGN KEY ("source_unit_id") REFERENCES "public"."source_units"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "extraction_claim_inferred_from" ADD CONSTRAINT "extraction_claim_inferred_from_claim_row_id_extraction_claims_id_fk" FOREIGN KEY ("claim_row_id") REFERENCES "public"."extraction_claims"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "extraction_bundles_domain_id_idx" ON "extraction_bundles" USING btree ("domain_id");
--> statement-breakpoint
CREATE INDEX "extraction_bundles_run_id_idx" ON "extraction_bundles" USING btree ("run_id");
--> statement-breakpoint
CREATE INDEX "extraction_bundles_document_id_idx" ON "extraction_bundles" USING btree ("document_id");
--> statement-breakpoint
CREATE INDEX "extraction_bundles_status_idx" ON "extraction_bundles" USING btree ("status");
--> statement-breakpoint
CREATE INDEX "extraction_claims_bundle_id_idx" ON "extraction_claims" USING btree ("bundle_id");
--> statement-breakpoint
CREATE INDEX "extraction_claims_run_step_id_idx" ON "extraction_claims" USING btree ("run_step_id");
--> statement-breakpoint
CREATE INDEX "extraction_claims_assertion_idx" ON "extraction_claims" USING btree ("assertion");
--> statement-breakpoint
CREATE INDEX "extraction_claim_mentions_claim_row_id_idx" ON "extraction_claim_mentions" USING btree ("claim_row_id");
--> statement-breakpoint
CREATE INDEX "extraction_claim_provenance_claim_row_id_idx" ON "extraction_claim_provenance" USING btree ("claim_row_id");
--> statement-breakpoint
CREATE INDEX "extraction_claim_provenance_source_unit_id_idx" ON "extraction_claim_provenance" USING btree ("source_unit_id");
--> statement-breakpoint
CREATE INDEX "extraction_claim_inferred_from_claim_row_id_idx" ON "extraction_claim_inferred_from" USING btree ("claim_row_id");
