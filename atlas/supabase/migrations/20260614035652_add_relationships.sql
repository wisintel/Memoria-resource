CREATE TABLE IF NOT EXISTS public.relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_id UUID NOT NULL REFERENCES public.domains(id),
  type_id UUID NOT NULL REFERENCES public.types(id),
  kind_id UUID NOT NULL REFERENCES public.kinds(id),
  status_id UUID REFERENCES public.statuses(id),
  source_class_id UUID NOT NULL REFERENCES public.classes(id),
  source_record_id UUID NOT NULL,
  target_class_id UUID NOT NULL REFERENCES public.classes(id),
  target_record_id UUID NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  created_at BIGINT NOT NULL DEFAULT floor(extract(epoch from clock_timestamp()) * 1000)::bigint,
  updated_at BIGINT NOT NULL DEFAULT floor(extract(epoch from clock_timestamp()) * 1000)::bigint
);

ALTER TABLE public.relationships
ADD COLUMN IF NOT EXISTS label TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS relationships_source_idx
ON public.relationships (source_class_id, source_record_id);

CREATE INDEX IF NOT EXISTS relationships_target_idx
ON public.relationships (target_class_id, target_record_id);

CREATE INDEX IF NOT EXISTS relationships_domain_type_kind_idx
ON public.relationships (domain_id, type_id, kind_id);

ALTER TABLE public.relationships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access to relationships" ON public.relationships;
DROP POLICY IF EXISTS "Allow public create access to relationships" ON public.relationships;
DROP POLICY IF EXISTS "Allow public update access to relationships" ON public.relationships;
DROP POLICY IF EXISTS "Allow public delete access to relationships" ON public.relationships;

CREATE POLICY "Allow public read access to relationships"
ON public.relationships
FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "Allow public create access to relationships"
ON public.relationships
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "Allow public update access to relationships"
ON public.relationships
FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Allow public delete access to relationships"
ON public.relationships
FOR DELETE
TO anon, authenticated
USING (true);

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.relationships TO anon, authenticated;
GRANT UPDATE (
  domain_id,
  type_id,
  kind_id,
  status_id,
  source_class_id,
  source_record_id,
  target_class_id,
  target_record_id,
  label,
  updated_at
) ON public.relationships TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.validate_relationship_classification()
RETURNS TRIGGER
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

  SELECT *
  INTO selected_kind
  FROM public.kinds
  WHERE id = NEW.kind_id;

  IF selected_kind.id IS NULL THEN
    RAISE EXCEPTION 'Relationship kind is required.';
  END IF;

  IF selected_kind.class_id <> relationship_class_id THEN
    RAISE EXCEPTION 'Relationship kind must belong to the Relationship class.';
  END IF;

  IF selected_kind.type_id <> NEW.type_id THEN
    RAISE EXCEPTION 'Relationship kind must belong to the selected type.';
  END IF;

  IF selected_kind.domain_id IS NOT NULL AND selected_kind.domain_id <> NEW.domain_id THEN
    RAISE EXCEPTION 'Relationship kind must be global or belong to the selected domain.';
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

  EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I WHERE id = $1)', source_class.table_name)
  INTO record_exists
  USING NEW.source_record_id;

  IF NOT record_exists THEN
    RAISE EXCEPTION 'Relationship source record was not found.';
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
      RAISE EXCEPTION 'Relationship source record must belong to the selected domain.';
    END IF;
  END IF;

  record_table_regclass := to_regclass(format('public.%I', target_class.table_name));

  IF record_table_regclass IS NULL THEN
    RAISE EXCEPTION 'Relationship target table does not exist.';
  END IF;

  EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I WHERE id = $1)', target_class.table_name)
  INTO record_exists
  USING NEW.target_record_id;

  IF NOT record_exists THEN
    RAISE EXCEPTION 'Relationship target record was not found.';
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
      RAISE EXCEPTION 'Relationship target record must belong to the selected domain.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_relationship_label()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  selected_kind public.kinds%ROWTYPE;
  source_class public.classes%ROWTYPE;
  target_class public.classes%ROWTYPE;
  source_label TEXT;
  target_label TEXT;
BEGIN
  SELECT *
  INTO selected_kind
  FROM public.kinds
  WHERE id = NEW.kind_id;

  IF selected_kind.id IS NULL THEN
    RAISE EXCEPTION 'Relationship kind is required.';
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

  NEW.label := concat(source_label, ' - ', selected_kind.label, ' - ', target_label);

  RETURN NEW;
END;
$$;

DROP FUNCTION IF EXISTS public.validate_relationship_record(TEXT, UUID, UUID, TEXT);

DROP TRIGGER IF EXISTS validate_relationship_classification_before_write ON public.relationships;
DROP TRIGGER IF EXISTS set_relationship_label_before_write ON public.relationships;

CREATE TRIGGER set_relationship_label_before_write
BEFORE INSERT OR UPDATE OF
  kind_id,
  source_class_id,
  source_record_id,
  target_class_id,
  target_record_id
ON public.relationships
FOR EACH ROW
EXECUTE FUNCTION public.set_relationship_label();

CREATE TRIGGER validate_relationship_classification_before_write
BEFORE INSERT OR UPDATE OF
  domain_id,
  type_id,
  kind_id,
  status_id,
  source_class_id,
  source_record_id,
  target_class_id,
  target_record_id
ON public.relationships
FOR EACH ROW
EXECUTE FUNCTION public.validate_relationship_classification();

REVOKE EXECUTE ON FUNCTION public.validate_relationship_classification() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.validate_relationship_classification() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_relationship_label() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_relationship_label() FROM anon, authenticated;

UPDATE public.relationships
SET
  kind_id = kind_id,
  updated_at = floor(extract(epoch from clock_timestamp()) * 1000)::bigint;
