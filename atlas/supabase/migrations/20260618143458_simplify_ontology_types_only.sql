UPDATE public.documents
SET kind_id = NULL
WHERE kind_id IS NOT NULL;

ALTER TABLE public.entities
ALTER COLUMN kind_id DROP NOT NULL;

ALTER TABLE public.claims
ALTER COLUMN kind_id DROP NOT NULL;

ALTER TABLE public.relationships
ALTER COLUMN kind_id DROP NOT NULL;

DELETE FROM public.kinds;

ALTER TABLE public.types
DROP CONSTRAINT IF EXISTS types_domain_type_id_domain_id_class_id_slug_key;

ALTER TABLE public.types
DROP CONSTRAINT IF EXISTS types_scope_check;

ALTER TABLE public.types
DROP CONSTRAINT IF EXISTS types_domain_id_fkey;

ALTER TABLE public.types
DROP CONSTRAINT IF EXISTS types_domain_type_id_fkey;

ALTER TABLE public.types
DROP COLUMN IF EXISTS domain_id,
DROP COLUMN IF EXISTS domain_type_id;

ALTER TABLE public.types
ADD CONSTRAINT types_class_id_slug_key
UNIQUE (class_id, slug);

DELETE FROM public.types
USING public.classes
WHERE public.types.class_id = public.classes.id
  AND public.classes.table_name IN ('entities', 'claims', 'relationships');

WITH target_types AS (
  SELECT *
  FROM (
    VALUES
      ('entities', 'object', 'Object'),
      ('entities', 'concept', 'Concept'),
      ('entities', 'agent', 'Agent'),
      ('entities', 'event', 'Event'),
      ('entities', 'place', 'Place'),
      ('entities', 'system', 'System'),
      ('claims', 'property', 'Property'),
      ('claims', 'measurement', 'Measurement'),
      ('claims', 'identifier', 'Identifier'),
      ('claims', 'state', 'State'),
      ('claims', 'classification', 'Classification'),
      ('claims', 'composition', 'Composition'),
      ('claims', 'comparison', 'Comparison'),
      ('claims', 'causal', 'Causal'),
      ('claims', 'spatial', 'Spatial'),
      ('claims', 'temporal', 'Temporal'),
      ('relationships', 'related-to', 'Related To'),
      ('relationships', 'instance-of', 'Instance Of'),
      ('relationships', 'part-of', 'Part Of'),
      ('relationships', 'has-property', 'Has Property'),
      ('relationships', 'located-in', 'Located In'),
      ('relationships', 'causes', 'Causes'),
      ('relationships', 'precedes', 'Precedes'),
      ('relationships', 'depends-on', 'Depends On')
  ) AS seed(table_name, slug, label)
)
INSERT INTO public.types (
  class_id,
  slug,
  label,
  created_at,
  updated_at
)
SELECT
  classes.id,
  target_types.slug,
  target_types.label,
  floor(extract(epoch from clock_timestamp()) * 1000)::bigint,
  floor(extract(epoch from clock_timestamp()) * 1000)::bigint
FROM target_types
INNER JOIN public.classes
  ON classes.table_name = target_types.table_name
ON CONFLICT ON CONSTRAINT types_class_id_slug_key DO UPDATE
SET
  label = EXCLUDED.label,
  updated_at = EXCLUDED.updated_at;

CREATE OR REPLACE FUNCTION public.validate_entity_classification()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  entity_class_id UUID;
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

  IF NEW.kind_id IS NOT NULL THEN
    SELECT *
    INTO selected_kind
    FROM public.kinds
    WHERE id = NEW.kind_id;

    IF selected_kind.id IS NULL THEN
      RAISE EXCEPTION 'Entity kind was not found.';
    END IF;

    IF selected_kind.type_id <> NEW.type_id THEN
      RAISE EXCEPTION 'Entity kind must belong to the selected type.';
    END IF;
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
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  claim_class_id UUID;
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

  IF NEW.kind_id IS NOT NULL THEN
    SELECT *
    INTO selected_kind
    FROM public.kinds
    WHERE id = NEW.kind_id;

    IF selected_kind.id IS NULL THEN
      RAISE EXCEPTION 'Claim kind was not found.';
    END IF;

    IF selected_kind.type_id <> NEW.type_id THEN
      RAISE EXCEPTION 'Claim kind must belong to the selected type.';
    END IF;
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
  selected_type public.types%ROWTYPE;
  selected_kind public.kinds%ROWTYPE;
BEGIN
  IF NEW.type_id IS NULL AND NEW.kind_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.type_id IS NULL AND NEW.kind_id IS NOT NULL THEN
    RAISE EXCEPTION 'Document type is required when kind is selected.';
  END IF;

  SELECT id
  INTO document_class_id
  FROM public.classes
  WHERE table_name = 'documents';

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

  IF NEW.kind_id IS NOT NULL THEN
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
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_relationship_classification()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  relationship_class_id UUID;
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

  IF NEW.kind_id IS NOT NULL THEN
    SELECT *
    INTO selected_kind
    FROM public.kinds
    WHERE id = NEW.kind_id;

    IF selected_kind.id IS NULL THEN
      RAISE EXCEPTION 'Relationship kind was not found.';
    END IF;

    IF selected_kind.type_id <> NEW.type_id THEN
      RAISE EXCEPTION 'Relationship kind must belong to the selected type.';
    END IF;
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

CREATE OR REPLACE FUNCTION public.set_relationship_label()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  selected_type public.types%ROWTYPE;
  selected_kind public.kinds%ROWTYPE;
  source_class public.classes%ROWTYPE;
  target_class public.classes%ROWTYPE;
  source_label TEXT;
  target_label TEXT;
  relationship_label TEXT;
BEGIN
  SELECT *
  INTO selected_type
  FROM public.types
  WHERE id = NEW.type_id;

  IF selected_type.id IS NULL THEN
    RAISE EXCEPTION 'Relationship type is required.';
  END IF;

  relationship_label := selected_type.label;

  IF NEW.kind_id IS NOT NULL THEN
    SELECT *
    INTO selected_kind
    FROM public.kinds
    WHERE id = NEW.kind_id;

    IF selected_kind.id IS NULL THEN
      RAISE EXCEPTION 'Relationship kind was not found.';
    END IF;

    relationship_label := selected_kind.label;
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

  EXECUTE format('SELECT label FROM public.%I WHERE id = $1', source_class.table_name)
  INTO source_label
  USING NEW.source_record_id;

  IF source_label IS NULL OR length(source_label) = 0 THEN
    RAISE EXCEPTION 'Relationship source record label was not found.';
  END IF;

  EXECUTE format('SELECT label FROM public.%I WHERE id = $1', target_class.table_name)
  INTO target_label
  USING NEW.target_record_id;

  IF target_label IS NULL OR length(target_label) = 0 THEN
    RAISE EXCEPTION 'Relationship target record label was not found.';
  END IF;

  NEW.label := concat(source_label, ' - ', relationship_label, ' - ', target_label);

  RETURN NEW;
END;
$$;

GRANT UPDATE (class_id, slug, label, status_id, updated_at) ON public.types TO anon, authenticated;

GRANT UPDATE (domain_id, type_id, kind_id, status_id, slug, label, updated_at) ON public.entities TO anon, authenticated;
GRANT UPDATE (domain_id, type_id, kind_id, status_id, slug, label, claim_text, target_entity_ids, source_document_id, updated_at) ON public.claims TO anon, authenticated;
GRANT UPDATE (domain_id, type_id, kind_id, status_id, source_class_id, source_record_id, target_class_id, target_record_id, updated_at) ON public.relationships TO anon, authenticated;
