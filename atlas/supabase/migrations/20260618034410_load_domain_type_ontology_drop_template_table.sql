WITH template_types AS (
  SELECT
    domain_type_ontology_items.domain_type_id,
    classes.id AS class_id,
    domain_type_ontology_items.slug,
    domain_type_ontology_items.label
  FROM public.domain_type_ontology_items
  INNER JOIN public.classes
    ON classes.table_name = domain_type_ontology_items.target_table
  WHERE domain_type_ontology_items.item_kind = 'type'
),
inserted_types AS (
  INSERT INTO public.types (
    domain_type_id,
    domain_id,
    class_id,
    slug,
    label,
    created_at,
    updated_at
  )
  SELECT
    template_types.domain_type_id,
    NULL::uuid,
    template_types.class_id,
    template_types.slug,
    template_types.label,
    floor(extract(epoch from clock_timestamp()) * 1000)::bigint,
    floor(extract(epoch from clock_timestamp()) * 1000)::bigint
  FROM template_types
  ON CONFLICT ON CONSTRAINT types_domain_type_id_domain_id_class_id_slug_key DO UPDATE
  SET
    label = EXCLUDED.label,
    updated_at = EXCLUDED.updated_at
  RETURNING id
),
template_parent_types AS (
  SELECT DISTINCT
    domain_type_ontology_items.domain_type_id,
    classes.id AS class_id,
    domain_type_ontology_items.parent_type_slug AS slug,
    COALESCE(global_types.label, initcap(replace(domain_type_ontology_items.parent_type_slug, '-', ' '))) AS label
  FROM public.domain_type_ontology_items
  INNER JOIN public.classes
    ON classes.table_name = domain_type_ontology_items.target_table
  LEFT JOIN public.types global_types
    ON global_types.domain_type_id IS NULL
    AND global_types.domain_id IS NULL
    AND global_types.class_id = classes.id
    AND global_types.slug = domain_type_ontology_items.parent_type_slug
  WHERE domain_type_ontology_items.item_kind = 'kind'
    AND domain_type_ontology_items.parent_type_slug <> ''
    AND NOT EXISTS (
      SELECT 1
      FROM public.domain_type_ontology_items explicit_types
      WHERE explicit_types.domain_type_id = domain_type_ontology_items.domain_type_id
        AND explicit_types.target_table = domain_type_ontology_items.target_table
        AND explicit_types.item_kind = 'type'
        AND explicit_types.slug = domain_type_ontology_items.parent_type_slug
    )
),
inserted_parent_types AS (
  INSERT INTO public.types (
    domain_type_id,
    domain_id,
    class_id,
    slug,
    label,
    created_at,
    updated_at
  )
  SELECT
    template_parent_types.domain_type_id,
    NULL::uuid,
    template_parent_types.class_id,
    template_parent_types.slug,
    template_parent_types.label,
    floor(extract(epoch from clock_timestamp()) * 1000)::bigint,
    floor(extract(epoch from clock_timestamp()) * 1000)::bigint
  FROM template_parent_types
  ON CONFLICT ON CONSTRAINT types_domain_type_id_domain_id_class_id_slug_key DO UPDATE
  SET
    label = EXCLUDED.label,
    updated_at = EXCLUDED.updated_at
  RETURNING id
),
template_kinds AS (
  SELECT
    parent_types.id AS type_id,
    domain_type_ontology_items.slug,
    domain_type_ontology_items.label
  FROM public.domain_type_ontology_items
  INNER JOIN public.classes
    ON classes.table_name = domain_type_ontology_items.target_table
  INNER JOIN public.types parent_types
    ON parent_types.domain_type_id = domain_type_ontology_items.domain_type_id
    AND parent_types.domain_id IS NULL
    AND parent_types.class_id = classes.id
    AND parent_types.slug = domain_type_ontology_items.parent_type_slug
  WHERE domain_type_ontology_items.item_kind = 'kind'
)
INSERT INTO public.kinds (
  type_id,
  slug,
  label,
  created_at,
  updated_at
)
SELECT
  template_kinds.type_id,
  template_kinds.slug,
  template_kinds.label,
  floor(extract(epoch from clock_timestamp()) * 1000)::bigint,
  floor(extract(epoch from clock_timestamp()) * 1000)::bigint
FROM template_kinds
ON CONFLICT ON CONSTRAINT kinds_type_id_slug_key DO UPDATE
SET
  label = EXCLUDED.label,
  updated_at = EXCLUDED.updated_at;

DELETE FROM public.statuses
USING public.classes
WHERE statuses.class_id = classes.id
  AND classes.table_name = 'domain_type_ontology_items';

DELETE FROM public.classes
WHERE table_name = 'domain_type_ontology_items';

DROP TABLE IF EXISTS public.domain_type_ontology_items;
