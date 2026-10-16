DO $$
DECLARE
  reference_count bigint;
BEGIN
  WITH scoped_types AS (
    SELECT id
    FROM public.types
    WHERE domain_type_id IS NOT NULL
      AND domain_id IS NULL
  ),
  scoped_kinds AS (
    SELECT kinds.id
    FROM public.kinds
    INNER JOIN scoped_types
      ON scoped_types.id = kinds.type_id
  ),
  record_references AS (
    SELECT id FROM public.entities WHERE type_id IN (SELECT id FROM scoped_types)
    UNION ALL
    SELECT id FROM public.entities WHERE kind_id IN (SELECT id FROM scoped_kinds)
    UNION ALL
    SELECT id FROM public.claims WHERE type_id IN (SELECT id FROM scoped_types)
    UNION ALL
    SELECT id FROM public.claims WHERE kind_id IN (SELECT id FROM scoped_kinds)
    UNION ALL
    SELECT id FROM public.documents WHERE type_id IN (SELECT id FROM scoped_types)
    UNION ALL
    SELECT id FROM public.documents WHERE kind_id IN (SELECT id FROM scoped_kinds)
    UNION ALL
    SELECT id FROM public.relationships WHERE type_id IN (SELECT id FROM scoped_types)
    UNION ALL
    SELECT id FROM public.relationships WHERE kind_id IN (SELECT id FROM scoped_kinds)
  )
  SELECT count(*)
  INTO reference_count
  FROM record_references;

  IF reference_count > 0 THEN
    RAISE EXCEPTION 'Cannot remove domain-type seeded ontology while % records reference it.', reference_count;
  END IF;
END $$;

DELETE FROM public.kinds
USING public.types
WHERE kinds.type_id = types.id
  AND types.domain_type_id IS NOT NULL
  AND types.domain_id IS NULL;

DELETE FROM public.types
WHERE domain_type_id IS NOT NULL
  AND domain_id IS NULL;
