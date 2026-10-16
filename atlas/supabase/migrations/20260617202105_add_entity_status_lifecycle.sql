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

  IF NEW.status_id IS NULL THEN
    SELECT id
    INTO NEW.status_id
    FROM public.statuses
    WHERE class_id = entity_class_id
      AND slug = 'proposed';

    IF NEW.status_id IS NULL THEN
      RAISE EXCEPTION 'Entity proposed status is required.';
    END IF;
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

  RETURN NEW;
END;
$$;

ALTER TABLE public.entities
ALTER COLUMN status_id SET NOT NULL;
