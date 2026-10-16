ALTER TABLE "claims" ADD COLUMN "modality" "extraction_modality";--> statement-breakpoint
UPDATE "claims"
SET "modality" = ("claims"."metadata"->>'extractionModality')::"extraction_modality"
WHERE "claims"."modality" IS NULL
  AND "claims"."metadata" ? 'extractionModality'
  AND "claims"."metadata"->>'extractionModality' IN ('empirical', 'normative', 'projection', 'reported', 'rhetorical');--> statement-breakpoint
UPDATE "claims"
SET "modality" = "extraction_claims"."modality"
FROM "extraction_claims"
WHERE "claims"."modality" IS NULL
  AND "claims"."metadata"->>'extractionClaimId' = "extraction_claims"."id"::text;--> statement-breakpoint
CREATE INDEX "claims_modality_idx" ON "claims" USING btree ("modality");--> statement-breakpoint
