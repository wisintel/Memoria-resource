ALTER TABLE public.types
ADD COLUMN IF NOT EXISTS domain_type_id UUID REFERENCES public.domain_types(id);

ALTER TABLE public.types
DROP CONSTRAINT IF EXISTS types_domain_id_class_id_slug_key;

ALTER TABLE public.types
DROP CONSTRAINT IF EXISTS types_scope_check;

ALTER TABLE public.types
ADD CONSTRAINT types_scope_check
CHECK (domain_type_id IS NULL OR domain_id IS NULL);

ALTER TABLE public.types
ADD CONSTRAINT types_domain_type_id_domain_id_class_id_slug_key
UNIQUE NULLS NOT DISTINCT (domain_type_id, domain_id, class_id, slug);

WITH domain_type_types AS (
  SELECT
    domains.domain_type_id,
    old_types.class_id,
    old_types.slug,
    min(old_types.label) AS label,
    min(old_types.status_id::text)::uuid AS status_id
  FROM public.types old_types
  INNER JOIN public.domains
    ON domains.id = old_types.domain_id
  WHERE domains.domain_type_id IS NOT NULL
  GROUP BY domains.domain_type_id, old_types.class_id, old_types.slug
)
INSERT INTO public.types (
  domain_type_id,
  domain_id,
  class_id,
  slug,
  label,
  status_id,
  created_at,
  updated_at
)
SELECT
  domain_type_types.domain_type_id,
  NULL::uuid,
  domain_type_types.class_id,
  domain_type_types.slug,
  domain_type_types.label,
  domain_type_types.status_id,
  floor(extract(epoch from clock_timestamp()) * 1000)::bigint,
  floor(extract(epoch from clock_timestamp()) * 1000)::bigint
FROM domain_type_types
ON CONFLICT ON CONSTRAINT types_domain_type_id_domain_id_class_id_slug_key DO UPDATE
SET
  label = EXCLUDED.label,
  status_id = EXCLUDED.status_id,
  updated_at = EXCLUDED.updated_at;

WITH domain_type_kinds AS (
  SELECT
    canonical_types.id AS type_id,
    old_kinds.slug,
    min(old_kinds.label) AS label,
    min(old_kinds.status_id::text)::uuid AS status_id
  FROM public.kinds old_kinds
  INNER JOIN public.types old_types
    ON old_types.id = old_kinds.type_id
  INNER JOIN public.domains
    ON domains.id = old_types.domain_id
  INNER JOIN public.types canonical_types
    ON canonical_types.domain_type_id = domains.domain_type_id
    AND canonical_types.domain_id IS NULL
    AND canonical_types.class_id = old_types.class_id
    AND canonical_types.slug = old_types.slug
  WHERE domains.domain_type_id IS NOT NULL
  GROUP BY canonical_types.id, old_kinds.slug
)
INSERT INTO public.kinds (
  type_id,
  slug,
  label,
  status_id,
  created_at,
  updated_at
)
SELECT
  domain_type_kinds.type_id,
  domain_type_kinds.slug,
  domain_type_kinds.label,
  domain_type_kinds.status_id,
  floor(extract(epoch from clock_timestamp()) * 1000)::bigint,
  floor(extract(epoch from clock_timestamp()) * 1000)::bigint
FROM domain_type_kinds
ON CONFLICT ON CONSTRAINT kinds_type_id_slug_key DO UPDATE
SET
  label = EXCLUDED.label,
  status_id = EXCLUDED.status_id,
  updated_at = EXCLUDED.updated_at;

WITH type_map AS (
  SELECT
    old_types.id AS old_type_id,
    canonical_types.id AS new_type_id
  FROM public.types old_types
  INNER JOIN public.domains
    ON domains.id = old_types.domain_id
  INNER JOIN public.types canonical_types
    ON canonical_types.domain_type_id = domains.domain_type_id
    AND canonical_types.domain_id IS NULL
    AND canonical_types.class_id = old_types.class_id
    AND canonical_types.slug = old_types.slug
  WHERE domains.domain_type_id IS NOT NULL
),
kind_map AS (
  SELECT
    old_kinds.id AS old_kind_id,
    canonical_kinds.id AS new_kind_id
  FROM public.kinds old_kinds
  INNER JOIN public.types old_types
    ON old_types.id = old_kinds.type_id
  INNER JOIN type_map
    ON type_map.old_type_id = old_types.id
  INNER JOIN public.kinds canonical_kinds
    ON canonical_kinds.type_id = type_map.new_type_id
    AND canonical_kinds.slug = old_kinds.slug
),
entity_updates AS (
  SELECT
    entities.id,
    type_map.new_type_id,
    kind_map.new_kind_id
  FROM public.entities
  INNER JOIN type_map
    ON type_map.old_type_id = entities.type_id
  LEFT JOIN kind_map
    ON kind_map.old_kind_id = entities.kind_id
)
UPDATE public.entities
SET
  type_id = entity_updates.new_type_id,
  kind_id = COALESCE(entity_updates.new_kind_id, public.entities.kind_id)
FROM entity_updates
WHERE public.entities.id = entity_updates.id;

WITH type_map AS (
  SELECT
    old_types.id AS old_type_id,
    canonical_types.id AS new_type_id
  FROM public.types old_types
  INNER JOIN public.domains
    ON domains.id = old_types.domain_id
  INNER JOIN public.types canonical_types
    ON canonical_types.domain_type_id = domains.domain_type_id
    AND canonical_types.domain_id IS NULL
    AND canonical_types.class_id = old_types.class_id
    AND canonical_types.slug = old_types.slug
  WHERE domains.domain_type_id IS NOT NULL
),
kind_map AS (
  SELECT
    old_kinds.id AS old_kind_id,
    canonical_kinds.id AS new_kind_id
  FROM public.kinds old_kinds
  INNER JOIN public.types old_types
    ON old_types.id = old_kinds.type_id
  INNER JOIN type_map
    ON type_map.old_type_id = old_types.id
  INNER JOIN public.kinds canonical_kinds
    ON canonical_kinds.type_id = type_map.new_type_id
    AND canonical_kinds.slug = old_kinds.slug
),
claim_updates AS (
  SELECT
    claims.id,
    type_map.new_type_id,
    kind_map.new_kind_id
  FROM public.claims
  INNER JOIN type_map
    ON type_map.old_type_id = claims.type_id
  LEFT JOIN kind_map
    ON kind_map.old_kind_id = claims.kind_id
)
UPDATE public.claims
SET
  type_id = claim_updates.new_type_id,
  kind_id = COALESCE(claim_updates.new_kind_id, public.claims.kind_id)
FROM claim_updates
WHERE public.claims.id = claim_updates.id;

WITH type_map AS (
  SELECT
    old_types.id AS old_type_id,
    canonical_types.id AS new_type_id
  FROM public.types old_types
  INNER JOIN public.domains
    ON domains.id = old_types.domain_id
  INNER JOIN public.types canonical_types
    ON canonical_types.domain_type_id = domains.domain_type_id
    AND canonical_types.domain_id IS NULL
    AND canonical_types.class_id = old_types.class_id
    AND canonical_types.slug = old_types.slug
  WHERE domains.domain_type_id IS NOT NULL
),
kind_map AS (
  SELECT
    old_kinds.id AS old_kind_id,
    canonical_kinds.id AS new_kind_id
  FROM public.kinds old_kinds
  INNER JOIN public.types old_types
    ON old_types.id = old_kinds.type_id
  INNER JOIN type_map
    ON type_map.old_type_id = old_types.id
  INNER JOIN public.kinds canonical_kinds
    ON canonical_kinds.type_id = type_map.new_type_id
    AND canonical_kinds.slug = old_kinds.slug
),
relationship_updates AS (
  SELECT
    relationships.id,
    type_map.new_type_id,
    kind_map.new_kind_id
  FROM public.relationships
  INNER JOIN type_map
    ON type_map.old_type_id = relationships.type_id
  LEFT JOIN kind_map
    ON kind_map.old_kind_id = relationships.kind_id
)
UPDATE public.relationships
SET
  type_id = relationship_updates.new_type_id,
  kind_id = COALESCE(relationship_updates.new_kind_id, public.relationships.kind_id)
FROM relationship_updates
WHERE public.relationships.id = relationship_updates.id;

WITH type_map AS (
  SELECT
    old_types.id AS old_type_id,
    canonical_types.id AS new_type_id
  FROM public.types old_types
  INNER JOIN public.domains
    ON domains.id = old_types.domain_id
  INNER JOIN public.types canonical_types
    ON canonical_types.domain_type_id = domains.domain_type_id
    AND canonical_types.domain_id IS NULL
    AND canonical_types.class_id = old_types.class_id
    AND canonical_types.slug = old_types.slug
  WHERE domains.domain_type_id IS NOT NULL
),
kind_map AS (
  SELECT
    old_kinds.id AS old_kind_id,
    canonical_kinds.id AS new_kind_id
  FROM public.kinds old_kinds
  INNER JOIN public.types old_types
    ON old_types.id = old_kinds.type_id
  INNER JOIN type_map
    ON type_map.old_type_id = old_types.id
  INNER JOIN public.kinds canonical_kinds
    ON canonical_kinds.type_id = type_map.new_type_id
    AND canonical_kinds.slug = old_kinds.slug
),
document_updates AS (
  SELECT
    documents.id,
    type_map.new_type_id,
    kind_map.new_kind_id
  FROM public.documents
  INNER JOIN type_map
    ON type_map.old_type_id = documents.type_id
  LEFT JOIN kind_map
    ON kind_map.old_kind_id = documents.kind_id
)
UPDATE public.documents
SET
  type_id = document_updates.new_type_id,
  kind_id = CASE
    WHEN public.documents.kind_id IS NULL THEN NULL
    ELSE COALESCE(document_updates.new_kind_id, public.documents.kind_id)
  END
FROM document_updates
WHERE public.documents.id = document_updates.id;

WITH duplicate_types AS (
  SELECT old_types.id
  FROM public.types old_types
  INNER JOIN public.domains
    ON domains.id = old_types.domain_id
  INNER JOIN public.types canonical_types
    ON canonical_types.domain_type_id = domains.domain_type_id
    AND canonical_types.domain_id IS NULL
    AND canonical_types.class_id = old_types.class_id
    AND canonical_types.slug = old_types.slug
  WHERE domains.domain_type_id IS NOT NULL
)
DELETE FROM public.kinds
USING duplicate_types
WHERE public.kinds.type_id = duplicate_types.id;

WITH duplicate_types AS (
  SELECT old_types.id
  FROM public.types old_types
  INNER JOIN public.domains
    ON domains.id = old_types.domain_id
  INNER JOIN public.types canonical_types
    ON canonical_types.domain_type_id = domains.domain_type_id
    AND canonical_types.domain_id IS NULL
    AND canonical_types.class_id = old_types.class_id
    AND canonical_types.slug = old_types.slug
  WHERE domains.domain_type_id IS NOT NULL
)
DELETE FROM public.types
USING duplicate_types
WHERE public.types.id = duplicate_types.id;

CREATE OR REPLACE FUNCTION public.validate_entity_classification()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  entity_class_id UUID;
  selected_domain_type_id UUID;
  selected_type public.types%ROWTYPE;
  selected_kind public.kinds%ROWTYPE;
  selected_status public.statuses%ROWTYPE;
BEGIN
  SELECT id
  INTO entity_class_id
  FROM public.classes
  WHERE table_name = 'entities';

  IF entity_class_id IS NULL THEN
    RAISE EXCEPTION 'Entity class registry row is required.';
  END IF;

  SELECT domain_type_id
  INTO selected_domain_type_id
  FROM public.domains
  WHERE id = NEW.domain_id;

  SELECT *
  INTO selected_type
  FROM public.types
  WHERE id = NEW.type_id;

  IF selected_type.id IS NULL THEN
    RAISE EXCEPTION 'Entity type is required.';
  END IF;

  IF selected_type.class_id <> entity_class_id THEN
    RAISE EXCEPTION 'Entity type must belong to the Entity class.';
  END IF;

  IF selected_type.domain_id IS NOT NULL AND selected_type.domain_id <> NEW.domain_id THEN
    RAISE EXCEPTION 'Entity type must be global, belong to the selected domain, or belong to the selected domain type.';
  END IF;

  IF selected_type.domain_type_id IS NOT NULL AND selected_type.domain_type_id IS DISTINCT FROM selected_domain_type_id THEN
    RAISE EXCEPTION 'Entity type must belong to the selected domain type.';
  END IF;

  SELECT *
  INTO selected_kind
  FROM public.kinds
  WHERE id = NEW.kind_id;

  IF selected_kind.id IS NULL THEN
    RAISE EXCEPTION 'Entity kind is required.';
  END IF;

  IF selected_kind.type_id <> NEW.type_id THEN
    RAISE EXCEPTION 'Entity kind must belong to the selected type.';
  END IF;

  IF NEW.status_id IS NOT NULL THEN
    SELECT *
    INTO selected_status
    FROM public.statuses
    WHERE id = NEW.status_id;

    IF selected_status.id IS NULL THEN
      RAISE EXCEPTION 'Entity status was not found.';
    END IF;

    IF selected_status.class_id <> entity_class_id THEN
      RAISE EXCEPTION 'Entity status must belong to the Entity class.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_claim_classification()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  claim_class_id UUID;
  selected_domain_type_id UUID;
  selected_type public.types%ROWTYPE;
  selected_kind public.kinds%ROWTYPE;
  selected_status public.statuses%ROWTYPE;
BEGIN
  SELECT id
  INTO claim_class_id
  FROM public.classes
  WHERE table_name = 'claims';

  IF claim_class_id IS NULL THEN
    RAISE EXCEPTION 'Claim class registry row is required.';
  END IF;

  SELECT domain_type_id
  INTO selected_domain_type_id
  FROM public.domains
  WHERE id = NEW.domain_id;

  SELECT *
  INTO selected_type
  FROM public.types
  WHERE id = NEW.type_id;

  IF selected_type.id IS NULL THEN
    RAISE EXCEPTION 'Claim type is required.';
  END IF;

  IF selected_type.class_id <> claim_class_id THEN
    RAISE EXCEPTION 'Claim type must belong to the Claim class.';
  END IF;

  IF selected_type.domain_id IS NOT NULL AND selected_type.domain_id <> NEW.domain_id THEN
    RAISE EXCEPTION 'Claim type must be global, belong to the selected domain, or belong to the selected domain type.';
  END IF;

  IF selected_type.domain_type_id IS NOT NULL AND selected_type.domain_type_id IS DISTINCT FROM selected_domain_type_id THEN
    RAISE EXCEPTION 'Claim type must belong to the selected domain type.';
  END IF;

  SELECT *
  INTO selected_kind
  FROM public.kinds
  WHERE id = NEW.kind_id;

  IF selected_kind.id IS NULL THEN
    RAISE EXCEPTION 'Claim kind is required.';
  END IF;

  IF selected_kind.type_id <> NEW.type_id THEN
    RAISE EXCEPTION 'Claim kind must belong to the selected type.';
  END IF;

  IF NEW.status_id IS NOT NULL THEN
    SELECT *
    INTO selected_status
    FROM public.statuses
    WHERE id = NEW.status_id;

    IF selected_status.id IS NULL THEN
      RAISE EXCEPTION 'Claim status was not found.';
    END IF;

    IF selected_status.class_id <> claim_class_id THEN
      RAISE EXCEPTION 'Claim status must belong to the Claim class.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_document_classification()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  document_class_id UUID;
  selected_domain_type_id UUID;
  selected_type public.types%ROWTYPE;
  selected_kind public.kinds%ROWTYPE;
BEGIN
  IF NEW.type_id IS NULL AND NEW.kind_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.type_id IS NULL OR NEW.kind_id IS NULL THEN
    RAISE EXCEPTION 'Document type and kind must be selected together.';
  END IF;

  SELECT id
  INTO document_class_id
  FROM public.classes
  WHERE table_name = 'documents';

  SELECT domain_type_id
  INTO selected_domain_type_id
  FROM public.domains
  WHERE id = NEW.domain_id;

  SELECT *
  INTO selected_type
  FROM public.types
  WHERE id = NEW.type_id;

  IF selected_type.id IS NULL THEN
    RAISE EXCEPTION 'Document type was not found.';
  END IF;

  IF selected_type.class_id <> document_class_id THEN
    RAISE EXCEPTION 'Document type must belong to the Document class.';
  END IF;

  IF selected_type.domain_id IS NOT NULL AND selected_type.domain_id <> NEW.domain_id THEN
    RAISE EXCEPTION 'Document type must be global, belong to the selected domain, or belong to the selected domain type.';
  END IF;

  IF selected_type.domain_type_id IS NOT NULL AND selected_type.domain_type_id IS DISTINCT FROM selected_domain_type_id THEN
    RAISE EXCEPTION 'Document type must belong to the selected domain type.';
  END IF;

  SELECT *
  INTO selected_kind
  FROM public.kinds
  WHERE id = NEW.kind_id;

  IF selected_kind.id IS NULL THEN
    RAISE EXCEPTION 'Document kind was not found.';
  END IF;

  IF selected_kind.type_id <> NEW.type_id THEN
    RAISE EXCEPTION 'Document kind must belong to the selected document type.';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_relationship_classification()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  relationship_class_id UUID;
  selected_domain_type_id UUID;
  selected_type public.types%ROWTYPE;
  selected_kind public.kinds%ROWTYPE;
  selected_status public.statuses%ROWTYPE;
  source_class public.classes%ROWTYPE;
  target_class public.classes%ROWTYPE;
  record_table_regclass REGCLASS;
  has_domain_id BOOLEAN;
  record_exists BOOLEAN;
  record_domain_id UUID;
BEGIN
  SELECT id
  INTO relationship_class_id
  FROM public.classes
  WHERE table_name = 'relationships';

  IF relationship_class_id IS NULL THEN
    RAISE EXCEPTION 'Relationship class registry row is required.';
  END IF;

  SELECT domain_type_id
  INTO selected_domain_type_id
  FROM public.domains
  WHERE id = NEW.domain_id;

  SELECT *
  INTO selected_type
  FROM public.types
  WHERE id = NEW.type_id;

  IF selected_type.id IS NULL THEN
    RAISE EXCEPTION 'Relationship type is required.';
  END IF;

  IF selected_type.class_id <> relationship_class_id THEN
    RAISE EXCEPTION 'Relationship type must belong to the Relationship class.';
  END IF;

  IF selected_type.domain_id IS NOT NULL AND selected_type.domain_id <> NEW.domain_id THEN
    RAISE EXCEPTION 'Relationship type must be global, belong to the selected domain, or belong to the selected domain type.';
  END IF;

  IF selected_type.domain_type_id IS NOT NULL AND selected_type.domain_type_id IS DISTINCT FROM selected_domain_type_id THEN
    RAISE EXCEPTION 'Relationship type must belong to the selected domain type.';
  END IF;

  SELECT *
  INTO selected_kind
  FROM public.kinds
  WHERE id = NEW.kind_id;

  IF selected_kind.id IS NULL THEN
    RAISE EXCEPTION 'Relationship kind is required.';
  END IF;

  IF selected_kind.type_id <> NEW.type_id THEN
    RAISE EXCEPTION 'Relationship kind must belong to the selected type.';
  END IF;

  IF NEW.status_id IS NOT NULL THEN
    SELECT *
    INTO selected_status
    FROM public.statuses
    WHERE id = NEW.status_id;

    IF selected_status.id IS NULL THEN
      RAISE EXCEPTION 'Relationship status was not found.';
    END IF;

    IF selected_status.class_id <> relationship_class_id THEN
      RAISE EXCEPTION 'Relationship status must belong to the Relationship class.';
    END IF;
  END IF;

  SELECT *
  INTO source_class
  FROM public.classes
  WHERE id = NEW.source_class_id;

  IF source_class.id IS NULL OR source_class.table_name IS NULL THEN
    RAISE EXCEPTION 'Relationship source class must point to a table-backed class.';
  END IF;

  SELECT *
  INTO target_class
  FROM public.classes
  WHERE id = NEW.target_class_id;

  IF target_class.id IS NULL OR target_class.table_name IS NULL THEN
    RAISE EXCEPTION 'Relationship target class must point to a table-backed class.';
  END IF;

  IF source_class.table_name NOT IN ('entities', 'claims') THEN
    RAISE EXCEPTION 'Relationship source class must currently be Entity or Claim.';
  END IF;

  IF target_class.table_name <> source_class.table_name THEN
    RAISE EXCEPTION 'Relationship target class must currently match the source class.';
  END IF;

  record_table_regclass := to_regclass(format('public.%I', source_class.table_name));

  IF record_table_regclass IS NULL THEN
    RAISE EXCEPTION 'Relationship source table does not exist.';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = source_class.table_name
      AND column_name = 'domain_id'
  )
  INTO has_domain_id;

  IF has_domain_id THEN
    EXECUTE format('SELECT domain_id FROM public.%I WHERE id = $1', source_class.table_name)
    INTO record_domain_id
    USING NEW.source_record_id;

    IF record_domain_id IS DISTINCT FROM NEW.domain_id THEN
      RAISE EXCEPTION 'Relationship source record must belong to the relationship domain.';
    END IF;
  ELSE
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I WHERE id = $1)', source_class.table_name)
    INTO record_exists
    USING NEW.source_record_id;

    IF NOT record_exists THEN
      RAISE EXCEPTION 'Relationship source record was not found.';
    END IF;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = target_class.table_name
      AND column_name = 'domain_id'
  )
  INTO has_domain_id;

  IF has_domain_id THEN
    EXECUTE format('SELECT domain_id FROM public.%I WHERE id = $1', target_class.table_name)
    INTO record_domain_id
    USING NEW.target_record_id;

    IF record_domain_id IS DISTINCT FROM NEW.domain_id THEN
      RAISE EXCEPTION 'Relationship target record must belong to the relationship domain.';
    END IF;
  ELSE
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I WHERE id = $1)', target_class.table_name)
    INTO record_exists
    USING NEW.target_record_id;

    IF NOT record_exists THEN
      RAISE EXCEPTION 'Relationship target record was not found.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

GRANT UPDATE (domain_type_id, domain_id, class_id, slug, label, status_id, updated_at) ON public.types TO anon, authenticated;
