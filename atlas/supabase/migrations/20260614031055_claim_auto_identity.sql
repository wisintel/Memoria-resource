CREATE OR REPLACE FUNCTION public.set_claim_identity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  domain_slug TEXT;
  next_claim_number INTEGER;
  claim_identity TEXT;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.domain_id = OLD.domain_id THEN
    RETURN NEW;
  END IF;

  SELECT slug
  INTO domain_slug
  FROM public.domains
  WHERE id = NEW.domain_id;

  IF domain_slug IS NULL THEN
    RAISE EXCEPTION 'Claim domain is required.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('claims:' || NEW.domain_id::text));

  SELECT COALESCE(max((regexp_match(existing_claim.slug, '^' || domain_slug || '-clm-([0-9]+)$'))[1]::integer), 0) + 1
  INTO next_claim_number
  FROM public.claims existing_claim
  WHERE existing_claim.domain_id = NEW.domain_id
    AND existing_claim.id <> NEW.id
    AND existing_claim.slug ~ ('^' || domain_slug || '-clm-[0-9]+$');

  claim_identity := domain_slug || '-clm-' || lpad(next_claim_number::text, 4, '0');

  NEW.label := claim_identity;
  NEW.slug := claim_identity;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_claim_identity_before_write ON public.claims;

CREATE TRIGGER set_claim_identity_before_write
BEFORE INSERT OR UPDATE OF domain_id
ON public.claims
FOR EACH ROW
EXECUTE FUNCTION public.set_claim_identity();

REVOKE EXECUTE ON FUNCTION public.set_claim_identity() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_claim_identity() FROM anon, authenticated;
