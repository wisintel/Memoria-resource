CREATE TABLE IF NOT EXISTS public.claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_id UUID NOT NULL REFERENCES public.domains(id),
  type_id UUID NOT NULL REFERENCES public.types(id),
  kind_id UUID NOT NULL REFERENCES public.kinds(id),
  status_id UUID REFERENCES public.statuses(id),
  slug TEXT NOT NULL,
  label TEXT NOT NULL,
  claim_text TEXT NOT NULL,
  created_at BIGINT NOT NULL DEFAULT floor(extract(epoch from clock_timestamp()) * 1000)::bigint,
  updated_at BIGINT NOT NULL DEFAULT floor(extract(epoch from clock_timestamp()) * 1000)::bigint,
  UNIQUE (domain_id, slug)
);

ALTER TABLE public.claims ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access to claims" ON public.claims;
DROP POLICY IF EXISTS "Allow public create access to claims" ON public.claims;
DROP POLICY IF EXISTS "Allow public update access to claims" ON public.claims;
DROP POLICY IF EXISTS "Allow public delete access to claims" ON public.claims;

CREATE POLICY "Allow public read access to claims"
ON public.claims
FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "Allow public create access to claims"
ON public.claims
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "Allow public update access to claims"
ON public.claims
FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Allow public delete access to claims"
ON public.claims
FOR DELETE
TO anon, authenticated
USING (true);

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.claims TO anon, authenticated;
GRANT UPDATE (domain_id, type_id, kind_id, status_id, slug, label, claim_text, updated_at) ON public.claims TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.validate_claim_classification()
RETURNS TRIGGER
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

  SELECT *
  INTO selected_kind
  FROM public.kinds
  WHERE id = NEW.kind_id;

  IF selected_kind.id IS NULL THEN
    RAISE EXCEPTION 'Claim kind is required.';
  END IF;

  IF selected_kind.class_id <> claim_class_id THEN
    RAISE EXCEPTION 'Claim kind must belong to the Claim class.';
  END IF;

  IF selected_kind.type_id <> NEW.type_id THEN
    RAISE EXCEPTION 'Claim kind must belong to the selected type.';
  END IF;

  IF selected_kind.domain_id IS NOT NULL AND selected_kind.domain_id <> NEW.domain_id THEN
    RAISE EXCEPTION 'Claim kind must be global or belong to the selected domain.';
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

DROP TRIGGER IF EXISTS validate_claim_classification_before_write ON public.claims;

CREATE TRIGGER validate_claim_classification_before_write
BEFORE INSERT OR UPDATE OF domain_id, type_id, kind_id, status_id
ON public.claims
FOR EACH ROW
EXECUTE FUNCTION public.validate_claim_classification();

REVOKE EXECUTE ON FUNCTION public.validate_claim_classification() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.validate_claim_classification() FROM anon, authenticated;
