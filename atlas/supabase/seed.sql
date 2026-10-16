INSERT INTO public.classes (
  label,
  table_name,
  purpose,
  created_at,
  updated_at
)
VALUES
  (
    'Class',
    'classes',
    'Registry of class tables available in Memoria.',
    floor(extract(epoch from clock_timestamp()) * 1000)::bigint,
    floor(extract(epoch from clock_timestamp()) * 1000)::bigint
  ),
  (
    'Domain',
    'domains',
    'Registry of domain workspaces.',
    floor(extract(epoch from clock_timestamp()) * 1000)::bigint,
    floor(extract(epoch from clock_timestamp()) * 1000)::bigint
  ),
  (
    'Domain Type',
    'domain_types',
    'Reusable domain templates that seed starter ontology and guidance.',
    floor(extract(epoch from clock_timestamp()) * 1000)::bigint,
    floor(extract(epoch from clock_timestamp()) * 1000)::bigint
  ),
  (
    'Kind',
    'kinds',
    'Domain-aware specific options under class-scoped types.',
    floor(extract(epoch from clock_timestamp()) * 1000)::bigint,
    floor(extract(epoch from clock_timestamp()) * 1000)::bigint
  ),
  (
    'Status',
    'statuses',
    'Class-scoped lifecycle or standing values available to records.',
    floor(extract(epoch from clock_timestamp()) * 1000)::bigint,
    floor(extract(epoch from clock_timestamp()) * 1000)::bigint
  ),
  (
    'Type',
    'types',
    'Reusable high-level categories scoped to a class.',
    floor(extract(epoch from clock_timestamp()) * 1000)::bigint,
    floor(extract(epoch from clock_timestamp()) * 1000)::bigint
  ),
  (
    'Entity',
    'entities',
    'Domain-scoped named things that can carry claims and relationships.',
    floor(extract(epoch from clock_timestamp()) * 1000)::bigint,
    floor(extract(epoch from clock_timestamp()) * 1000)::bigint
  ),
  (
    'Claim',
    'claims',
    'Domain-scoped assertions that can be classified by type and kind.',
    floor(extract(epoch from clock_timestamp()) * 1000)::bigint,
    floor(extract(epoch from clock_timestamp()) * 1000)::bigint
  ),
  (
    'Relationship',
    'relationships',
    'Domain-scoped links between records such as entity relationships and source evidence.',
    floor(extract(epoch from clock_timestamp()) * 1000)::bigint,
    floor(extract(epoch from clock_timestamp()) * 1000)::bigint
  ),
  (
    'Document',
    'documents',
    'Domain-scoped source documents extracted or entered as Markdown before structured processing.',
    floor(extract(epoch from clock_timestamp()) * 1000)::bigint,
    floor(extract(epoch from clock_timestamp()) * 1000)::bigint
  ),
  (
    'Tool',
    'tools',
    'Registry of tool records available to Atlas.',
    floor(extract(epoch from clock_timestamp()) * 1000)::bigint,
    floor(extract(epoch from clock_timestamp()) * 1000)::bigint
  ),
  (
    'View',
    'views',
    'Domain-scoped saved graph canvases for arranging and revisiting knowledge records.',
    floor(extract(epoch from clock_timestamp()) * 1000)::bigint,
    floor(extract(epoch from clock_timestamp()) * 1000)::bigint
  ),
  (
    'View Node',
    'view_nodes',
    'Positioned class-backed records inside saved graph views.',
    floor(extract(epoch from clock_timestamp()) * 1000)::bigint,
    floor(extract(epoch from clock_timestamp()) * 1000)::bigint
  ),
  (
    'View Relationship',
    'view_relationships',
    'Visible relationship records included in saved graph views.',
    floor(extract(epoch from clock_timestamp()) * 1000)::bigint,
    floor(extract(epoch from clock_timestamp()) * 1000)::bigint
  ),
  (
    'Alias',
    'entity_aliases',
    'Alternative names used to resolve references to canonical entities.',
    floor(extract(epoch from clock_timestamp()) * 1000)::bigint,
    floor(extract(epoch from clock_timestamp()) * 1000)::bigint
  )
ON CONFLICT (table_name) DO UPDATE
SET
  label = EXCLUDED.label,
  purpose = EXCLUDED.purpose,
  updated_at = EXCLUDED.updated_at;

WITH domain_class AS (
  SELECT id
  FROM public.classes
  WHERE table_name = 'domains'
),
status_values AS (
  SELECT *
  FROM (
    VALUES
      ('active', 'Active'),
      ('retired', 'Retired')
  ) AS status_value(slug, label)
)
INSERT INTO public.statuses (
  class_id,
  slug,
  label,
  created_at,
  updated_at
)
SELECT
  domain_class.id,
  status_values.slug,
  status_values.label,
  floor(extract(epoch from clock_timestamp()) * 1000)::bigint,
  floor(extract(epoch from clock_timestamp()) * 1000)::bigint
FROM domain_class
CROSS JOIN status_values
ON CONFLICT (class_id, slug) DO UPDATE
SET
  label = EXCLUDED.label,
  updated_at = EXCLUDED.updated_at;

WITH active_domain_status AS (
  SELECT statuses.id
  FROM public.statuses
  INNER JOIN public.classes
    ON classes.id = statuses.class_id
  WHERE classes.table_name = 'domains'
    AND statuses.slug = 'active'
)
INSERT INTO public.domains (
  slug,
  label,
  status_id,
  created_at,
  updated_at
)
SELECT
  'atlas',
  'Atlas',
  active_domain_status.id,
  floor(extract(epoch from clock_timestamp()) * 1000)::bigint,
  floor(extract(epoch from clock_timestamp()) * 1000)::bigint
FROM active_domain_status
ON CONFLICT (slug) DO UPDATE
SET
  label = EXCLUDED.label,
  status_id = EXCLUDED.status_id,
  updated_at = EXCLUDED.updated_at;

INSERT INTO public.domain_types (
  slug,
  label,
  source_reference,
  guidance_path,
  created_at,
  updated_at
)
VALUES
  (
    'technical',
    'Technical',
    'technical-operational',
    'domain-guidance/references/technical-operational.md',
    floor(extract(epoch from clock_timestamp()) * 1000)::bigint,
    floor(extract(epoch from clock_timestamp()) * 1000)::bigint
  ),
  (
    'scientific',
    'Scientific',
    'scientific-empirical',
    'domain-guidance/references/scientific-empirical.md',
    floor(extract(epoch from clock_timestamp()) * 1000)::bigint,
    floor(extract(epoch from clock_timestamp()) * 1000)::bigint
  ),
  (
    'investigative',
    'Investigative',
    'analytical-investigative',
    'domain-guidance/references/analytical-investigative.md',
    floor(extract(epoch from clock_timestamp()) * 1000)::bigint,
    floor(extract(epoch from clock_timestamp()) * 1000)::bigint
  ),
  (
    'commercial',
    'Commercial',
    'commercial-transactional',
    'domain-guidance/references/commercial-transactional.md',
    floor(extract(epoch from clock_timestamp()) * 1000)::bigint,
    floor(extract(epoch from clock_timestamp()) * 1000)::bigint
  ),
  (
    'reflective',
    'Reflective',
    'personal-reflective',
    'domain-guidance/references/personal-reflective.md',
    floor(extract(epoch from clock_timestamp()) * 1000)::bigint,
    floor(extract(epoch from clock_timestamp()) * 1000)::bigint
  ),
  (
    'narrative',
    'Narrative',
    'narrative-creative',
    'domain-guidance/references/narrative-creative.md',
    floor(extract(epoch from clock_timestamp()) * 1000)::bigint,
    floor(extract(epoch from clock_timestamp()) * 1000)::bigint
  ),
  (
    'educational',
    'Educational',
    'educational-pedagogical',
    'domain-guidance/references/educational-pedagogical.md',
    floor(extract(epoch from clock_timestamp()) * 1000)::bigint,
    floor(extract(epoch from clock_timestamp()) * 1000)::bigint
  )
ON CONFLICT (slug) DO UPDATE
SET
  label = EXCLUDED.label,
  source_reference = EXCLUDED.source_reference,
  guidance_path = EXCLUDED.guidance_path,
  updated_at = EXCLUDED.updated_at;

WITH entity_class AS (
  SELECT id
  FROM public.classes
  WHERE table_name = 'entities'
),
status_values AS (
  SELECT *
  FROM (
    VALUES
      ('proposed', 'Proposed'),
      ('canon', 'Canon'),
      ('retired', 'Retired')
  ) AS status_value(slug, label)
)
INSERT INTO public.statuses (
  class_id,
  slug,
  label,
  created_at,
  updated_at
)
SELECT
  entity_class.id,
  status_values.slug,
  status_values.label,
  floor(extract(epoch from clock_timestamp()) * 1000)::bigint,
  floor(extract(epoch from clock_timestamp()) * 1000)::bigint
FROM entity_class
CROSS JOIN status_values
ON CONFLICT (class_id, slug) DO UPDATE
SET
  label = EXCLUDED.label,
  updated_at = EXCLUDED.updated_at;

WITH entity_class AS (
  SELECT id
  FROM public.classes
  WHERE table_name = 'entities'
),
seed_types AS (
  SELECT *
  FROM (
    VALUES
      ('object', 'Object'),
      ('concept', 'Concept'),
      ('agent', 'Agent'),
      ('event', 'Event'),
      ('place', 'Place'),
      ('system', 'System')
  ) AS seed(slug, label)
)
INSERT INTO public.types (
  class_id,
  slug,
  label,
  created_at,
  updated_at
)
SELECT
  entity_class.id,
  seed_types.slug,
  seed_types.label,
  floor(extract(epoch from clock_timestamp()) * 1000)::bigint,
  floor(extract(epoch from clock_timestamp()) * 1000)::bigint
FROM entity_class
CROSS JOIN seed_types
ON CONFLICT ON CONSTRAINT types_class_id_slug_key DO UPDATE
SET
  label = EXCLUDED.label,
  updated_at = EXCLUDED.updated_at;

WITH claim_class AS (
  SELECT id
  FROM public.classes
  WHERE table_name = 'claims'
),
seed_types AS (
  SELECT *
  FROM (
    VALUES
      ('property', 'Property'),
      ('measurement', 'Measurement'),
      ('identifier', 'Identifier'),
      ('state', 'State'),
      ('classification', 'Classification'),
      ('composition', 'Composition'),
      ('comparison', 'Comparison'),
      ('causal', 'Causal'),
      ('spatial', 'Spatial'),
      ('temporal', 'Temporal')
  ) AS seed(slug, label)
)
INSERT INTO public.types (
  class_id,
  slug,
  label,
  created_at,
  updated_at
)
SELECT
  claim_class.id,
  seed_types.slug,
  seed_types.label,
  floor(extract(epoch from clock_timestamp()) * 1000)::bigint,
  floor(extract(epoch from clock_timestamp()) * 1000)::bigint
FROM claim_class
CROSS JOIN seed_types
ON CONFLICT ON CONSTRAINT types_class_id_slug_key DO UPDATE
SET
  label = EXCLUDED.label,
  updated_at = EXCLUDED.updated_at;

WITH document_class AS (
  SELECT id
  FROM public.classes
  WHERE table_name = 'documents'
)
INSERT INTO public.types (
  class_id,
  slug,
  label,
  created_at,
  updated_at
)
SELECT
  document_class.id,
  'source',
  'Source',
  floor(extract(epoch from clock_timestamp()) * 1000)::bigint,
  floor(extract(epoch from clock_timestamp()) * 1000)::bigint
FROM document_class
ON CONFLICT ON CONSTRAINT types_class_id_slug_key DO UPDATE
SET
  label = EXCLUDED.label,
  updated_at = EXCLUDED.updated_at;

WITH relationship_class AS (
  SELECT id
  FROM public.classes
  WHERE table_name = 'relationships'
),
seed_types AS (
  SELECT *
  FROM (
    VALUES
      ('related-to', 'Related To'),
      ('instance-of', 'Instance Of'),
      ('part-of', 'Part Of'),
      ('has-property', 'Has Property'),
      ('located-in', 'Located In'),
      ('causes', 'Causes'),
      ('precedes', 'Precedes'),
      ('depends-on', 'Depends On')
  ) AS seed(slug, label)
)
INSERT INTO public.types (
  class_id,
  slug,
  label,
  created_at,
  updated_at
)
SELECT
  relationship_class.id,
  seed_types.slug,
  seed_types.label,
  floor(extract(epoch from clock_timestamp()) * 1000)::bigint,
  floor(extract(epoch from clock_timestamp()) * 1000)::bigint
FROM relationship_class
CROSS JOIN seed_types
ON CONFLICT ON CONSTRAINT types_class_id_slug_key DO UPDATE
SET
  label = EXCLUDED.label,
  updated_at = EXCLUDED.updated_at;
