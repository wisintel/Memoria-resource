ALTER TYPE "extraction_claim_kind" ADD VALUE IF NOT EXISTS 'comparative';--> statement-breakpoint
INSERT INTO "types" (
  "class_id",
  "domain_id",
  "slug",
  "label",
  "description",
  "status_id",
  "metadata",
  "created_by"
)
SELECT
  "classes"."id",
  NULL,
  'comparative',
  'Comparative',
  'relative difference between things',
  "statuses"."id",
  '{"source":"memoria-meta-ontology","state":"active","stratum":"grammar","systemSeed":true,"versionDate":"2026-07-06","dimension":"claim_kind","example":"Earth has a greater mass than Mars"}'::jsonb,
  'system'
FROM "classes"
LEFT JOIN "statuses"
  ON "statuses"."class_id" = "classes"."id"
  AND "statuses"."is_default" = true
WHERE "classes"."key" = 'claim'
ON CONFLICT ("class_id", "slug") WHERE "domain_id" IS NULL
DO UPDATE SET
  "label" = EXCLUDED."label",
  "description" = EXCLUDED."description",
  "status_id" = EXCLUDED."status_id",
  "metadata" = EXCLUDED."metadata",
  "created_by" = EXCLUDED."created_by",
  "updated_at" = now();--> statement-breakpoint
INSERT INTO "types" (
  "class_id",
  "domain_id",
  "slug",
  "label",
  "description",
  "status_id",
  "metadata",
  "created_by"
)
SELECT
  "classes"."id",
  NULL,
  'comparative',
  'Comparative',
  'relative difference between things',
  "statuses"."id",
  '{"source":"memoria-meta-ontology","state":"active","stratum":"grammar","systemSeed":true,"versionDate":"2026-07-06","dimension":"relationship_kind","example":"Earth has a greater mass than Mars"}'::jsonb,
  'system'
FROM "classes"
LEFT JOIN "statuses"
  ON "statuses"."class_id" = "classes"."id"
  AND "statuses"."is_default" = true
WHERE "classes"."key" = 'relationship'
ON CONFLICT ("class_id", "slug") WHERE "domain_id" IS NULL
DO UPDATE SET
  "label" = EXCLUDED."label",
  "description" = EXCLUDED."description",
  "status_id" = EXCLUDED."status_id",
  "metadata" = EXCLUDED."metadata",
  "created_by" = EXCLUDED."created_by",
  "updated_at" = now();
