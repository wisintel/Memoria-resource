CREATE OR REPLACE FUNCTION public.slugify_label(label_value TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT regexp_replace(
    regexp_replace(lower(trim(label_value)), '[^a-z0-9]+', '-', 'g'),
    '(^-+|-+$)',
    '',
    'g'
  );
$$;

CREATE OR REPLACE FUNCTION public.set_slug_from_label()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.slug := public.slugify_label(NEW.label);

  IF NEW.slug IS NULL OR NEW.slug = '' THEN
    RAISE EXCEPTION 'Label must generate a slug.';
  END IF;

  RETURN NEW;
END;
$$;

UPDATE public.domains
SET
  slug = public.slugify_label(label),
  updated_at = floor(extract(epoch from clock_timestamp()) * 1000)::bigint;

UPDATE public.entities
SET
  slug = public.slugify_label(label),
  updated_at = floor(extract(epoch from clock_timestamp()) * 1000)::bigint;

UPDATE public.claims
SET
  slug = public.slugify_label(label),
  updated_at = floor(extract(epoch from clock_timestamp()) * 1000)::bigint;

UPDATE public.types
SET
  slug = public.slugify_label(label),
  updated_at = floor(extract(epoch from clock_timestamp()) * 1000)::bigint;

UPDATE public.kinds
SET
  slug = public.slugify_label(label),
  updated_at = floor(extract(epoch from clock_timestamp()) * 1000)::bigint;

UPDATE public.statuses
SET
  slug = public.slugify_label(label),
  updated_at = floor(extract(epoch from clock_timestamp()) * 1000)::bigint;

DROP TRIGGER IF EXISTS set_domains_slug_from_label_before_write ON public.domains;
DROP TRIGGER IF EXISTS set_entities_slug_from_label_before_write ON public.entities;
DROP TRIGGER IF EXISTS set_claims_slug_from_label_before_write ON public.claims;
DROP TRIGGER IF EXISTS set_types_slug_from_label_before_write ON public.types;
DROP TRIGGER IF EXISTS set_kinds_slug_from_label_before_write ON public.kinds;
DROP TRIGGER IF EXISTS set_statuses_slug_from_label_before_write ON public.statuses;

CREATE TRIGGER set_domains_slug_from_label_before_write
BEFORE INSERT OR UPDATE OF label
ON public.domains
FOR EACH ROW
EXECUTE FUNCTION public.set_slug_from_label();

CREATE TRIGGER set_entities_slug_from_label_before_write
BEFORE INSERT OR UPDATE OF label
ON public.entities
FOR EACH ROW
EXECUTE FUNCTION public.set_slug_from_label();

CREATE TRIGGER set_claims_slug_from_label_before_write
BEFORE INSERT OR UPDATE OF label
ON public.claims
FOR EACH ROW
EXECUTE FUNCTION public.set_slug_from_label();

CREATE TRIGGER set_types_slug_from_label_before_write
BEFORE INSERT OR UPDATE OF label
ON public.types
FOR EACH ROW
EXECUTE FUNCTION public.set_slug_from_label();

CREATE TRIGGER set_kinds_slug_from_label_before_write
BEFORE INSERT OR UPDATE OF label
ON public.kinds
FOR EACH ROW
EXECUTE FUNCTION public.set_slug_from_label();

CREATE TRIGGER set_statuses_slug_from_label_before_write
BEFORE INSERT OR UPDATE OF label
ON public.statuses
FOR EACH ROW
EXECUTE FUNCTION public.set_slug_from_label();

REVOKE EXECUTE ON FUNCTION public.set_slug_from_label() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_slug_from_label() FROM anon, authenticated;
