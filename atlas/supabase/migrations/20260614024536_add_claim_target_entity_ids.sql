ALTER TABLE public.claims
ADD COLUMN IF NOT EXISTS target_entity_ids UUID[];

ALTER TABLE public.claims
ALTER COLUMN target_entity_ids SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'claims_target_entity_ids_nonempty'
      AND conrelid = 'public.claims'::regclass
  ) THEN
    ALTER TABLE public.claims
    ADD CONSTRAINT claims_target_entity_ids_nonempty
    CHECK (cardinality(target_entity_ids) > 0);
  END IF;
END;
$$;

GRANT UPDATE (
  domain_id,
  type_id,
  kind_id,
  target_entity_ids,
  status_id,
  slug,
  label,
  claim_text,
  updated_at
) ON public.claims TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.validate_claim_classification()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  claim_class_id UUID;
  selected_type public.types%ROWTYPE;
  selected_kind public.kinds%ROWTYPE;
  selected_status public.statuses%ROWTYPE;
  target_count INTEGER;
  distinct_target_count INTEGER;
BEGIN
  SELECT id
  INTO claim_class_id
  FROM public.classes
  WHERE table_name = 'claims';

  IF claim_class_id IS NULL THEN
    RAISE EXCEPTION 'Claim class registry row is required.';
  END IF;

  IF cardinality(NEW.target_entity_ids) < 1 THEN
    RAISE EXCEPTION 'Claim must target at least one entity.';
  END IF;

  SELECT count(*), count(DISTINCT target_entity_id)
  INTO target_count, distinct_target_count
  FROM unnest(NEW.target_entity_ids) AS target_entity_id;

  IF target_count <> distinct_target_count THEN
    RAISE EXCEPTION 'Claim target entities must be unique.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(NEW.target_entity_ids) AS target_entity_id
    LEFT JOIN public.entities target_entity
      ON target_entity.id = target_entity_id
    WHERE target_entity.id IS NULL
  ) THEN
    RAISE EXCEPTION 'Claim target entity was not found.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.entities target_entity
    WHERE target_entity.id = ANY(NEW.target_entity_ids)
      AND target_entity.domain_id <> NEW.domain_id
  ) THEN
    RAISE EXCEPTION 'Claim target entities must belong to the selected domain.';
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
BEFORE INSERT OR UPDATE OF domain_id, type_id, kind_id, target_entity_ids, status_id
ON public.claims
FOR EACH ROW
EXECUTE FUNCTION public.validate_claim_classification();

REVOKE EXECUTE ON FUNCTION public.validate_claim_classification() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.validate_claim_classification() FROM anon, authenticated;
