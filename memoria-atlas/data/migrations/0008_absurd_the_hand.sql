ALTER TABLE "admission_decisions" DROP CONSTRAINT "admission_decisions_candidate_id_candidates_id_fk";
--> statement-breakpoint
ALTER TABLE "admission_decisions" DROP CONSTRAINT "admission_decisions_bundle_id_candidate_bundles_id_fk";
--> statement-breakpoint
ALTER TABLE "candidates" DROP CONSTRAINT "candidates_source_unit_id_source_units_id_fk";
--> statement-breakpoint
ALTER TABLE "record_provenance" DROP CONSTRAINT "record_provenance_candidate_id_candidates_id_fk";
--> statement-breakpoint
ALTER TABLE "record_provenance" DROP CONSTRAINT "record_provenance_source_unit_id_source_units_id_fk";
--> statement-breakpoint
ALTER TABLE "record_provenance" DROP CONSTRAINT "record_provenance_run_id_pipeline_runs_id_fk";
--> statement-breakpoint
ALTER TABLE "admission_decisions" ALTER COLUMN "candidate_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "admission_decisions" ALTER COLUMN "bundle_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "candidates" ALTER COLUMN "source_unit_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "record_provenance" ALTER COLUMN "candidate_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "record_provenance" ALTER COLUMN "source_unit_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "record_provenance" ALTER COLUMN "run_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "admission_decisions" ADD CONSTRAINT "admission_decisions_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admission_decisions" ADD CONSTRAINT "admission_decisions_bundle_id_candidate_bundles_id_fk" FOREIGN KEY ("bundle_id") REFERENCES "public"."candidate_bundles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_source_unit_id_source_units_id_fk" FOREIGN KEY ("source_unit_id") REFERENCES "public"."source_units"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "record_provenance" ADD CONSTRAINT "record_provenance_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "record_provenance" ADD CONSTRAINT "record_provenance_source_unit_id_source_units_id_fk" FOREIGN KEY ("source_unit_id") REFERENCES "public"."source_units"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "record_provenance" ADD CONSTRAINT "record_provenance_run_id_pipeline_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."pipeline_runs"("id") ON DELETE set null ON UPDATE no action;