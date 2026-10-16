WITH modality_matches AS (
  SELECT
    "claims"."id" AS "claim_id",
    "extraction_claims"."modality" AS "modality"
  FROM "claims"
  JOIN "object_domain_memberships"
    ON "object_domain_memberships"."object_id" = "claims"."id"
  JOIN "extraction_bundles"
    ON "extraction_bundles"."domain_id" = "object_domain_memberships"."domain_id"
  JOIN "extraction_claims"
    ON "extraction_claims"."bundle_id" = "extraction_bundles"."id"
    AND lower("extraction_claims"."text") = lower("claims"."claim_text")
  WHERE "claims"."modality" IS NULL
    AND "object_domain_memberships"."membership_state" = 'member'
),
unambiguous_matches AS (
  SELECT
    "claim_id",
    min("modality"::text)::"extraction_modality" AS "modality"
  FROM "modality_matches"
  GROUP BY "claim_id"
  HAVING count(DISTINCT "modality") = 1
)
UPDATE "claims"
SET "modality" = "unambiguous_matches"."modality"
FROM "unambiguous_matches"
WHERE "claims"."id" = "unambiguous_matches"."claim_id";--> statement-breakpoint
