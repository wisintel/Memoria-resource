ALTER TABLE public.documents
ADD COLUMN IF NOT EXISTS type_id UUID REFERENCES public.types(id),
ADD COLUMN IF NOT EXISTS kind_id UUID REFERENCES public.kinds(id);

CREATE INDEX IF NOT EXISTS documents_type_kind_idx
ON public.documents (type_id, kind_id);

CREATE OR REPLACE FUNCTION public.validate_document_classification()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  document_class_id UUID;
  selected_type public.types%ROWTYPE;
  selected_kind public.kinds%ROWTYPE;
BEGIN
  IF NEW.type_id IS NULL AND NEW.kind_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.type_id IS NULL OR NEW.kind_id IS NULL THEN
    RAISE EXCEPTION 'Document type and kind must be selected together.';
  END IF;

  SELECT id
  INTO document_class_id
  FROM public.classes
  WHERE table_name = 'documents';

  SELECT *
  INTO selected_type
  FROM public.types
  WHERE id = NEW.type_id;

  IF selected_type.id IS NULL THEN
    RAISE EXCEPTION 'Document type was not found.';
  END IF;

  IF selected_type.class_id <> document_class_id THEN
    RAISE EXCEPTION 'Document type must belong to the Document class.';
  END IF;

  SELECT *
  INTO selected_kind
  FROM public.kinds
  WHERE id = NEW.kind_id;

  IF selected_kind.id IS NULL THEN
    RAISE EXCEPTION 'Document kind was not found.';
  END IF;

  IF selected_kind.class_id <> document_class_id THEN
    RAISE EXCEPTION 'Document kind must belong to the Document class.';
  END IF;

  IF selected_kind.type_id <> NEW.type_id THEN
    RAISE EXCEPTION 'Document kind must belong to the selected document type.';
  END IF;

  IF selected_kind.domain_id IS NOT NULL AND selected_kind.domain_id <> NEW.domain_id THEN
    RAISE EXCEPTION 'Document kind must be global or belong to the selected domain.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_document_classification_before_write ON public.documents;

CREATE TRIGGER validate_document_classification_before_write
BEFORE INSERT OR UPDATE OF domain_id, type_id, kind_id
ON public.documents
FOR EACH ROW
EXECUTE FUNCTION public.validate_document_classification();

REVOKE EXECUTE ON FUNCTION public.validate_document_classification() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.validate_document_classification() FROM anon, authenticated;

GRANT UPDATE (
  type_id,
  kind_id,
  updated_at
) ON public.documents TO anon, authenticated;
