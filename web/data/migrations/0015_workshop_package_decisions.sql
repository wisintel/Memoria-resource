CREATE TABLE IF NOT EXISTS "workshop_package_decisions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "bundle_id" uuid NOT NULL,
  "subject_text" text NOT NULL,
  "normalized_subject" text NOT NULL,
  "outcome" text DEFAULT 'admit' NOT NULL,
  "actor_kind" text DEFAULT 'user' NOT NULL,
  "target_subject_id" uuid,
  "resulting_subject_id" uuid,
  "resulting_claim_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "error_message" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "workshop_package_decisions_bundle_subject_unique" UNIQUE("bundle_id", "normalized_subject")
);
--> statement-breakpoint
ALTER TABLE "workshop_package_decisions" ADD CONSTRAINT "workshop_package_decisions_bundle_id_extraction_bundles_id_fk" FOREIGN KEY ("bundle_id") REFERENCES "public"."extraction_bundles"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "workshop_package_decisions" ADD CONSTRAINT "workshop_package_decisions_target_subject_id_subjects_id_fk" FOREIGN KEY ("target_subject_id") REFERENCES "public"."subjects"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "workshop_package_decisions" ADD CONSTRAINT "workshop_package_decisions_resulting_subject_id_subjects_id_fk" FOREIGN KEY ("resulting_subject_id") REFERENCES "public"."subjects"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workshop_package_decisions_bundle_id_idx" ON "workshop_package_decisions" USING btree ("bundle_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workshop_package_decisions_resulting_subject_id_idx" ON "workshop_package_decisions" USING btree ("resulting_subject_id");
