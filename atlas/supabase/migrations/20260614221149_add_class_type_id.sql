ALTER TABLE public.classes
ADD COLUMN type_id UUID REFERENCES public.types(id);

UPDATE public.classes class_record
SET
  type_id = class_type.id,
  updated_at = floor(extract(epoch from clock_timestamp()) * 1000)::bigint
FROM public.types class_type
INNER JOIN public.classes class_type_class
  ON class_type_class.id = class_type.class_id
WHERE
  class_type_class.table_name = 'classes'
  AND class_type.slug = CASE
    WHEN class_record.table_name IN ('documents', 'tools') THEN 'document-management'
    WHEN class_record.table_name IN ('claims', 'entities', 'relationships') THEN 'knowledge-graph'
    WHEN class_record.table_name IN ('classes', 'domains', 'types', 'kinds', 'statuses') THEN 'ontology'
    ELSE NULL
  END;
