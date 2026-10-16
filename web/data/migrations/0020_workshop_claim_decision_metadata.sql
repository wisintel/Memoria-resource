ALTER TABLE "workshop_claim_decisions"
ADD COLUMN IF NOT EXISTS "result_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL;
