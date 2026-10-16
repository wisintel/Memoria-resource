CREATE TABLE IF NOT EXISTS public.domain_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  description TEXT,
  source_reference TEXT,
  guidance_path TEXT,
  created_at BIGINT NOT NULL DEFAULT floor(extract(epoch from clock_timestamp()) * 1000)::bigint,
  updated_at BIGINT NOT NULL DEFAULT floor(extract(epoch from clock_timestamp()) * 1000)::bigint,
  CONSTRAINT domain_types_slug_format CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  CONSTRAINT domain_types_label_nonempty CHECK (length(trim(label)) > 0)
);

ALTER TABLE public.domains
ADD COLUMN IF NOT EXISTS domain_type_id UUID REFERENCES public.domain_types(id);

CREATE INDEX IF NOT EXISTS domains_domain_type_idx
ON public.domains (domain_type_id);

CREATE TABLE IF NOT EXISTS public.domain_type_ontology_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_type_id UUID NOT NULL REFERENCES public.domain_types(id) ON DELETE CASCADE,
  target_table TEXT NOT NULL,
  item_kind TEXT NOT NULL,
  parent_type_slug TEXT NOT NULL DEFAULT '',
  slug TEXT NOT NULL,
  label TEXT NOT NULL,
  description TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL DEFAULT floor(extract(epoch from clock_timestamp()) * 1000)::bigint,
  updated_at BIGINT NOT NULL DEFAULT floor(extract(epoch from clock_timestamp()) * 1000)::bigint,
  CONSTRAINT domain_type_ontology_items_target_table_check
    CHECK (target_table IN ('entities', 'relationships', 'claims', 'documents')),
  CONSTRAINT domain_type_ontology_items_item_kind_check
    CHECK (item_kind IN ('type', 'kind')),
  CONSTRAINT domain_type_ontology_items_slug_format CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  CONSTRAINT domain_type_ontology_items_label_nonempty CHECK (length(trim(label)) > 0),
  CONSTRAINT domain_type_ontology_items_parent_check
    CHECK (
      (item_kind = 'type' AND parent_type_slug = '')
      OR (item_kind = 'kind' AND parent_type_slug <> '')
    ),
  UNIQUE (domain_type_id, target_table, item_kind, parent_type_slug, slug)
);

CREATE INDEX IF NOT EXISTS domain_type_ontology_items_domain_type_idx
ON public.domain_type_ontology_items (domain_type_id, target_table, item_kind, sort_order);

ALTER TABLE public.domain_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.domain_type_ontology_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access to domain_types" ON public.domain_types;
DROP POLICY IF EXISTS "Allow public create access to domain_types" ON public.domain_types;
DROP POLICY IF EXISTS "Allow public update access to domain_types" ON public.domain_types;
DROP POLICY IF EXISTS "Allow public delete access to domain_types" ON public.domain_types;

CREATE POLICY "Allow public read access to domain_types"
ON public.domain_types
FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "Allow public create access to domain_types"
ON public.domain_types
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "Allow public update access to domain_types"
ON public.domain_types
FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Allow public delete access to domain_types"
ON public.domain_types
FOR DELETE
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "Allow public read access to domain_type_ontology_items" ON public.domain_type_ontology_items;
DROP POLICY IF EXISTS "Allow public create access to domain_type_ontology_items" ON public.domain_type_ontology_items;
DROP POLICY IF EXISTS "Allow public update access to domain_type_ontology_items" ON public.domain_type_ontology_items;
DROP POLICY IF EXISTS "Allow public delete access to domain_type_ontology_items" ON public.domain_type_ontology_items;

CREATE POLICY "Allow public read access to domain_type_ontology_items"
ON public.domain_type_ontology_items
FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "Allow public create access to domain_type_ontology_items"
ON public.domain_type_ontology_items
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "Allow public update access to domain_type_ontology_items"
ON public.domain_type_ontology_items
FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Allow public delete access to domain_type_ontology_items"
ON public.domain_type_ontology_items
FOR DELETE
TO anon, authenticated
USING (true);

GRANT USAGE ON SCHEMA public TO anon, authenticated;

GRANT SELECT, INSERT, DELETE ON public.domain_types TO anon, authenticated;
GRANT UPDATE (
  slug,
  label,
  description,
  source_reference,
  guidance_path,
  updated_at
) ON public.domain_types TO anon, authenticated;

GRANT SELECT, INSERT, DELETE ON public.domain_type_ontology_items TO anon, authenticated;
GRANT UPDATE (
  domain_type_id,
  target_table,
  item_kind,
  parent_type_slug,
  slug,
  label,
  description,
  metadata,
  sort_order,
  updated_at
) ON public.domain_type_ontology_items TO anon, authenticated;

GRANT UPDATE (
  domain_type_id,
  updated_at
) ON public.domains TO anon, authenticated;
