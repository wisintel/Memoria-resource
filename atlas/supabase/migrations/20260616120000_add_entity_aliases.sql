CREATE TABLE IF NOT EXISTS public.entity_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_id UUID NOT NULL REFERENCES public.domains(id) ON DELETE CASCADE,
  entity_id UUID NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
  alias TEXT NOT NULL,
  normalized_alias TEXT NOT NULL,
  status_id UUID REFERENCES public.statuses(id) ON DELETE SET NULL,
  source_document_id UUID REFERENCES public.documents(id) ON DELETE SET NULL,
  created_at BIGINT NOT NULL DEFAULT floor(extract(epoch from clock_timestamp()) * 1000)::bigint,
  updated_at BIGINT NOT NULL DEFAULT floor(extract(epoch from clock_timestamp()) * 1000)::bigint,
  CONSTRAINT entity_aliases_alias_not_blank CHECK (length(trim(alias)) > 0),
  CONSTRAINT entity_aliases_normalized_alias_not_blank CHECK (length(trim(normalized_alias)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS entity_aliases_entity_normalized_unique_idx
ON public.entity_aliases (entity_id, normalized_alias);

CREATE INDEX IF NOT EXISTS entity_aliases_domain_normalized_idx
ON public.entity_aliases (domain_id, normalized_alias);

CREATE INDEX IF NOT EXISTS entity_aliases_entity_updated_idx
ON public.entity_aliases (entity_id, updated_at DESC);

CREATE OR REPLACE FUNCTION public.normalize_entity_alias(value TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT btrim(regexp_replace(
    regexp_replace(
      lower(trim(coalesce(value, ''))),
      '[^a-z0-9]+',
      ' ',
      'g'
    ),
    '\s+',
    ' ',
    'g'
  ))
$$;

CREATE OR REPLACE FUNCTION public.prepare_entity_alias()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  selected_entity public.entities%ROWTYPE;
  selected_document public.documents%ROWTYPE;
BEGIN
  NEW.alias = trim(NEW.alias);
  NEW.normalized_alias = public.normalize_entity_alias(NEW.alias);
  NEW.updated_at = floor(extract(epoch from clock_timestamp()) * 1000)::bigint;

  IF TG_OP = 'INSERT' THEN
    NEW.created_at = coalesce(NEW.created_at, NEW.updated_at);
  END IF;

  IF NEW.normalized_alias = '' THEN
    RAISE EXCEPTION 'Alias must include letters or numbers.';
  END IF;

  SELECT *
  INTO selected_entity
  FROM public.entities
  WHERE id = NEW.entity_id;

  IF selected_entity.id IS NULL THEN
    RAISE EXCEPTION 'Alias entity was not found.';
  END IF;

  IF selected_entity.domain_id <> NEW.domain_id THEN
    RAISE EXCEPTION 'Alias entity must belong to the selected domain.';
  END IF;

  IF NEW.source_document_id IS NOT NULL THEN
    SELECT *
    INTO selected_document
    FROM public.documents
    WHERE id = NEW.source_document_id;

    IF selected_document.id IS NULL THEN
      RAISE EXCEPTION 'Alias source document was not found.';
    END IF;

    IF selected_document.domain_id <> NEW.domain_id THEN
      RAISE EXCEPTION 'Alias source document must belong to the selected domain.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prepare_entity_alias_before_write ON public.entity_aliases;

CREATE TRIGGER prepare_entity_alias_before_write
BEFORE INSERT OR UPDATE OF domain_id, entity_id, alias, source_document_id
ON public.entity_aliases
FOR EACH ROW
EXECUTE FUNCTION public.prepare_entity_alias();

ALTER TABLE public.entity_aliases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access to entity_aliases" ON public.entity_aliases;
DROP POLICY IF EXISTS "Allow public create access to entity_aliases" ON public.entity_aliases;
DROP POLICY IF EXISTS "Allow public update access to entity_aliases" ON public.entity_aliases;
DROP POLICY IF EXISTS "Allow public delete access to entity_aliases" ON public.entity_aliases;

CREATE POLICY "Allow public read access to entity_aliases"
ON public.entity_aliases
FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "Allow public create access to entity_aliases"
ON public.entity_aliases
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "Allow public update access to entity_aliases"
ON public.entity_aliases
FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Allow public delete access to entity_aliases"
ON public.entity_aliases
FOR DELETE
TO anon, authenticated
USING (true);

GRANT SELECT, DELETE ON public.entity_aliases TO anon, authenticated;
GRANT INSERT (
  domain_id,
  entity_id,
  alias,
  status_id,
  source_document_id,
  created_at,
  updated_at
) ON public.entity_aliases TO anon, authenticated;
GRANT UPDATE (
  domain_id,
  entity_id,
  alias,
  status_id,
  source_document_id,
  updated_at
) ON public.entity_aliases TO anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.normalize_entity_alias(TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.normalize_entity_alias(TEXT) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prepare_entity_alias() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.prepare_entity_alias() FROM anon, authenticated;
