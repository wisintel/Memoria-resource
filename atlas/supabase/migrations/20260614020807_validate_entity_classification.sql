CREATE OR REPLACE FUNCTION public.validate_entity_classification()
RETURNS TRIGGER
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

  SELECT *
  INTO selected_kind
  FROM public.kinds
  WHERE id = NEW.kind_id;

  IF selected_kind.id IS NULL THEN
    RAISE EXCEPTION 'Entity kind is required.';
  END IF;

  IF selected_kind.class_id <> entity_class_id THEN
    RAISE EXCEPTION 'Entity kind must belong to the Entity class.';
  END IF;

  IF selected_kind.type_id <> NEW.type_id THEN
    RAISE EXCEPTION 'Entity kind must belong to the selected type.';
  END IF;

  IF selected_kind.domain_id IS NOT NULL AND selected_kind.domain_id <> NEW.domain_id THEN
    RAISE EXCEPTION 'Entity kind must be global or belong to the selected domain.';
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

DROP TRIGGER IF EXISTS validate_entity_classification_before_write ON public.entities;

CREATE TRIGGER validate_entity_classification_before_write
BEFORE INSERT OR UPDATE OF domain_id, type_id, kind_id, status_id
ON public.entities
FOR EACH ROW
EXECUTE FUNCTION public.validate_entity_classification();

REVOKE EXECUTE ON FUNCTION public.validate_entity_classification() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.validate_entity_classification() FROM anon, authenticated;
