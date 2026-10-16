CREATE OR REPLACE FUNCTION public.prepare_entity_alias()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

REVOKE EXECUTE ON FUNCTION public.prepare_entity_alias() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.prepare_entity_alias() FROM anon, authenticated;
