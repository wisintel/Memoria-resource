CREATE SEQUENCE IF NOT EXISTS "claims_review_number_seq";--> statement-breakpoint
ALTER TABLE "claims" ADD COLUMN IF NOT EXISTS "review_number" integer;--> statement-breakpoint
WITH numbered_claims AS (
  SELECT
    "claims"."id",
    row_number() OVER (
      ORDER BY "claims"."created_at", "claims"."id"
    )::integer AS "review_number"
  FROM "claims"
)
UPDATE "claims"
SET "review_number" = "numbered_claims"."review_number"
FROM "numbered_claims"
WHERE "claims"."id" = "numbered_claims"."id"
  AND "claims"."review_number" IS NULL;--> statement-breakpoint
SELECT setval(
  'claims_review_number_seq',
  greatest(coalesce((SELECT max("review_number") FROM "claims"), 0) + 1, 1),
  false
);--> statement-breakpoint
ALTER TABLE "claims" ALTER COLUMN "review_number" SET DEFAULT nextval('claims_review_number_seq'::regclass);--> statement-breakpoint
ALTER TABLE "claims" ALTER COLUMN "review_number" SET NOT NULL;--> statement-breakpoint
ALTER SEQUENCE "claims_review_number_seq" OWNED BY "claims"."review_number";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "claims_review_number_unique" ON "claims" USING btree ("review_number");
