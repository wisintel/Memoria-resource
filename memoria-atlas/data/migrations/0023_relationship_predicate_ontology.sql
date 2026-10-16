WITH relationship_class AS (
  SELECT id
  FROM classes
  WHERE key = 'relationship'
), type_status AS (
  SELECT statuses.id
  FROM statuses
  JOIN classes ON classes.id = statuses.class_id
  WHERE classes.key = 'type'
    AND statuses.is_default = true
  LIMIT 1
), seeds(slug, label, description, example) AS (
  VALUES
    ('instance-of', 'Instance of', 'Connects an individual subject to the class it instantiates.', 'Earth instance of terrestrial planet'),
    ('subtype-of', 'Subtype of', 'Connects a narrower class to a broader class.', 'terrestrial planet subtype of planet'),
    ('part-of', 'Part of', 'Connects a component or constituent to the whole it belongs to.', 'Sun part of Solar System'),
    ('located-in', 'Located in', 'Connects a subject to the place or spatial container containing it.', 'Olympus Mons located in Mars'),
    ('depends-on', 'Depends on', 'Indicates that one subject requires or relies on another.', 'photosynthesis depends on sunlight'),
    ('causes', 'Causes', 'Indicates that one subject brings about another.', 'solar wind causes aurorae'),
    ('uses', 'Uses', 'Indicates that one subject employs another.', 'mission uses spacecraft'),
    ('implements', 'Implements', 'Indicates that one subject realizes or carries out another.', 'service implements protocol'),
    ('interacts-with', 'Interacts with', 'Indicates that two subjects act on or affect one another.', 'solar wind interacts with magnetosphere')
)
INSERT INTO types (
  class_id,
  domain_id,
  slug,
  label,
  description,
  status_id,
  metadata,
  created_by
)
SELECT
  relationship_class.id,
  NULL,
  seeds.slug,
  seeds.label,
  seeds.description,
  type_status.id,
  jsonb_build_object(
    'source', 'memoria-meta-ontology',
    'state', 'active',
    'stratum', 'grammar',
    'systemSeed', true,
    'versionDate', '2026-07-09',
    'dimension', 'relationship_predicate',
    'example', seeds.example
  ),
  'system'
FROM seeds
CROSS JOIN relationship_class
LEFT JOIN type_status ON true
ON CONFLICT (class_id, slug) WHERE domain_id IS NULL
DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  status_id = EXCLUDED.status_id,
  metadata = EXCLUDED.metadata,
  created_by = EXCLUDED.created_by,
  updated_at = now();
--> statement-breakpoint
UPDATE relationships AS relationship
SET
  relationship_type_id = replacement_type.id,
  label = source_subject.canonical_label || ' Instance of ' || target_subject.canonical_label,
  updated_at = now()
FROM types AS old_type,
  types AS replacement_type,
  classes AS relationship_class,
  subjects AS source_subject,
  subjects AS target_subject
WHERE relationship_class.key = 'relationship'
  AND old_type.class_id = relationship_class.id
  AND old_type.domain_id IS NULL
  AND old_type.slug = 'taxonomic'
  AND replacement_type.class_id = relationship_class.id
  AND replacement_type.domain_id IS NULL
  AND replacement_type.slug = 'instance-of'
  AND relationship.relationship_type_id = old_type.id
  AND source_subject.id = relationship.source_object_id
  AND target_subject.id = relationship.target_object_id;
--> statement-breakpoint
UPDATE relationships AS relationship
SET
  relationship_type_id = replacement_type.id,
  label = source_subject.canonical_label || ' Located in ' || target_subject.canonical_label,
  updated_at = now()
FROM types AS old_type,
  types AS replacement_type,
  classes AS relationship_class,
  subjects AS source_subject,
  subjects AS target_subject
WHERE relationship_class.key = 'relationship'
  AND old_type.class_id = relationship_class.id
  AND old_type.domain_id IS NULL
  AND old_type.slug = 'spatial'
  AND replacement_type.class_id = relationship_class.id
  AND replacement_type.domain_id IS NULL
  AND replacement_type.slug = 'located-in'
  AND relationship.relationship_type_id = old_type.id
  AND source_subject.id = relationship.source_object_id
  AND target_subject.id = relationship.target_object_id
  AND NOT (
    source_subject.canonical_label = 'Solar System'
    AND target_subject.canonical_label = 'Sun'
  )
  AND NOT (
    source_subject.canonical_label = 'Oort Cloud'
    AND target_subject.canonical_label = 'Kuiper Belt'
  );
--> statement-breakpoint
UPDATE relationships AS relationship
SET
  source_object_id = relationship.target_object_id,
  target_object_id = relationship.source_object_id,
  relationship_type_id = replacement_type.id,
  label = target_subject.canonical_label || ' Part of ' || source_subject.canonical_label,
  updated_at = now()
FROM types AS old_type,
  types AS replacement_type,
  classes AS relationship_class,
  subjects AS source_subject,
  subjects AS target_subject
WHERE relationship_class.key = 'relationship'
  AND old_type.class_id = relationship_class.id
  AND old_type.domain_id IS NULL
  AND old_type.slug = 'spatial'
  AND replacement_type.class_id = relationship_class.id
  AND replacement_type.domain_id IS NULL
  AND replacement_type.slug = 'part-of'
  AND relationship.relationship_type_id = old_type.id
  AND source_subject.id = relationship.source_object_id
  AND target_subject.id = relationship.target_object_id
  AND source_subject.canonical_label = 'Solar System'
  AND target_subject.canonical_label = 'Sun';
--> statement-breakpoint
DELETE FROM record_provenance
WHERE record_class_key = 'relationship'
  AND record_id IN (
    SELECT relationship.id
    FROM relationships AS relationship
    JOIN types AS relationship_type
      ON relationship_type.id = relationship.relationship_type_id
    JOIN classes AS relationship_class
      ON relationship_class.id = relationship_type.class_id
    JOIN subjects AS source_subject
      ON source_subject.id = relationship.source_object_id
    JOIN subjects AS target_subject
      ON target_subject.id = relationship.target_object_id
    WHERE relationship_class.key = 'relationship'
      AND relationship_type.domain_id IS NULL
      AND relationship_type.slug = 'spatial'
      AND source_subject.canonical_label = 'Oort Cloud'
      AND target_subject.canonical_label = 'Kuiper Belt'
  );
--> statement-breakpoint
DELETE FROM objects AS object
USING relationships AS relationship,
  types AS relationship_type,
  classes AS relationship_class,
  subjects AS source_subject,
  subjects AS target_subject
WHERE object.id = relationship.id
  AND relationship_type.id = relationship.relationship_type_id
  AND relationship_class.id = relationship_type.class_id
  AND relationship_class.key = 'relationship'
  AND relationship_type.domain_id IS NULL
  AND relationship_type.slug = 'spatial'
  AND source_subject.id = relationship.source_object_id
  AND target_subject.id = relationship.target_object_id
  AND source_subject.canonical_label = 'Oort Cloud'
  AND target_subject.canonical_label = 'Kuiper Belt';
--> statement-breakpoint
UPDATE types AS child_type
SET parent_type_id = NULL
FROM types AS old_type,
  classes AS relationship_class
WHERE child_type.parent_type_id = old_type.id
  AND relationship_class.id = old_type.class_id
  AND relationship_class.key = 'relationship'
  AND old_type.domain_id IS NULL
  AND old_type.slug IN (
    'taxonomic',
    'structural',
    'causal',
    'functional',
    'spatial',
    'temporal',
    'attributive',
    'comparative'
  );
--> statement-breakpoint
DELETE FROM types AS old_type
USING classes AS relationship_class
WHERE relationship_class.id = old_type.class_id
  AND relationship_class.key = 'relationship'
  AND old_type.domain_id IS NULL
  AND old_type.slug IN (
    'taxonomic',
    'structural',
    'causal',
    'functional',
    'spatial',
    'temporal',
    'attributive',
    'comparative'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM relationships
    WHERE relationships.relationship_type_id = old_type.id
  );
