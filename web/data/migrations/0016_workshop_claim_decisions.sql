CREATE TABLE IF NOT EXISTS "workshop_claim_decisions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "claim_row_id" uuid NOT NULL,
  "outcome" text NOT NULL,
  "actor_kind" text DEFAULT 'user' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "workshop_claim_decisions_claim_row_unique" UNIQUE("claim_row_id")
);
--> statement-breakpoint
ALTER TABLE "workshop_claim_decisions" ADD CONSTRAINT "workshop_claim_decisions_claim_row_id_extraction_claims_id_fk" FOREIGN KEY ("claim_row_id") REFERENCES "public"."extraction_claims"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workshop_claim_decisions_claim_row_id_idx" ON "workshop_claim_decisions" USING btree ("claim_row_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workshop_claim_decisions_outcome_idx" ON "workshop_claim_decisions" USING btree ("outcome");
