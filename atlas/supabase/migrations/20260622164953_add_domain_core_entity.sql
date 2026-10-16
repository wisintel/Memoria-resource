ALTER TABLE public.domains
ADD COLUMN IF NOT EXISTS core_entity_id UUID REFERENCES public.entities(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS domains_core_entity_idx
ON public.domains (core_entity_id);

CREATE OR REPLACE FUNCTION public.validate_domain_core_entity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  selected_entity public.entities%ROWTYPE;
BEGIN
  IF NEW.core_entity_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT *
  INTO selected_entity
  FROM public.entities
  WHERE id = NEW.core_entity_id;

  IF selected_entity.id IS NULL THEN
    RAISE EXCEPTION 'Domain core entity was not found.';
  END IF;

  IF selected_entity.domain_id <> NEW.id THEN
    RAISE EXCEPTION 'Domain core entity must belong to the domain.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_domain_core_entity_before_write ON public.domains;

CREATE TRIGGER validate_domain_core_entity_before_write
BEFORE INSERT OR UPDATE OF id, core_entity_id
ON public.domains
FOR EACH ROW
EXECUTE FUNCTION public.validate_domain_core_entity();

GRANT UPDATE (domain_type_id, core_entity_id, slug, label, status_id, updated_at) ON public.domains TO anon, authenticated;
