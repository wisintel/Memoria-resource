CREATE TABLE IF NOT EXISTS public.views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_id UUID NOT NULL REFERENCES public.domains(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  label TEXT NOT NULL,
  description TEXT,
  view_kind TEXT NOT NULL DEFAULT 'semantic',
  status_id UUID REFERENCES public.statuses(id),
  created_at BIGINT NOT NULL DEFAULT floor(extract(epoch from clock_timestamp()) * 1000)::bigint,
  updated_at BIGINT NOT NULL DEFAULT floor(extract(epoch from clock_timestamp()) * 1000)::bigint,
  CONSTRAINT views_slug_format CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  CONSTRAINT views_label_nonempty CHECK (length(trim(label)) > 0),
  CONSTRAINT views_view_kind_check CHECK (view_kind IN ('semantic', 'working', 'presentation')),
  UNIQUE (domain_id, slug)
);

CREATE TABLE IF NOT EXISTS public.view_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  view_id UUID NOT NULL REFERENCES public.views(id) ON DELETE CASCADE,
  record_class_id UUID NOT NULL REFERENCES public.classes(id),
  record_id UUID NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'visible',
  x DOUBLE PRECISION,
  y DOUBLE PRECISION,
  pinned BOOLEAN NOT NULL DEFAULT false,
  created_at BIGINT NOT NULL DEFAULT floor(extract(epoch from clock_timestamp()) * 1000)::bigint,
  updated_at BIGINT NOT NULL DEFAULT floor(extract(epoch from clock_timestamp()) * 1000)::bigint,
  CONSTRAINT view_nodes_visibility_check CHECK (visibility IN ('visible', 'hidden', 'collapsed', 'metadata_only')),
  UNIQUE (view_id, record_class_id, record_id)
);

CREATE TABLE IF NOT EXISTS public.view_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  view_id UUID NOT NULL REFERENCES public.views(id) ON DELETE CASCADE,
  relationship_id UUID NOT NULL REFERENCES public.relationships(id) ON DELETE CASCADE,
  visibility TEXT NOT NULL DEFAULT 'visible',
  created_at BIGINT NOT NULL DEFAULT floor(extract(epoch from clock_timestamp()) * 1000)::bigint,
  updated_at BIGINT NOT NULL DEFAULT floor(extract(epoch from clock_timestamp()) * 1000)::bigint,
  CONSTRAINT view_relationships_visibility_check CHECK (visibility IN ('visible', 'hidden', 'collapsed', 'metadata_only')),
  UNIQUE (view_id, relationship_id)
);

CREATE INDEX IF NOT EXISTS views_domain_updated_idx
ON public.views (domain_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS view_nodes_view_visibility_idx
ON public.view_nodes (view_id, visibility);

CREATE INDEX IF NOT EXISTS view_nodes_record_idx
ON public.view_nodes (record_class_id, record_id);

CREATE INDEX IF NOT EXISTS view_relationships_view_visibility_idx
ON public.view_relationships (view_id, visibility);

CREATE INDEX IF NOT EXISTS view_relationships_relationship_idx
ON public.view_relationships (relationship_id);

CREATE OR REPLACE FUNCTION public.set_views_slug_from_label()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  base_slug TEXT;
  candidate_slug TEXT;
  suffix INTEGER := 2;
BEGIN
  IF NEW.label IS NULL OR length(trim(NEW.label)) = 0 THEN
    RAISE EXCEPTION 'View label is required.';
  END IF;

  base_slug := lower(regexp_replace(trim(NEW.label), '[^a-zA-Z0-9]+', '-', 'g'));
  base_slug := regexp_replace(base_slug, '(^-+|-+$)', '', 'g');

  IF base_slug = '' THEN
    base_slug := 'view';
  END IF;

  candidate_slug := base_slug;

  WHILE EXISTS (
    SELECT 1
    FROM public.views existing_view
    WHERE existing_view.domain_id = NEW.domain_id
      AND existing_view.slug = candidate_slug
      AND existing_view.id IS DISTINCT FROM NEW.id
  ) LOOP
    candidate_slug := base_slug || '-' || suffix::text;
    suffix := suffix + 1;
  END LOOP;

  NEW.slug := candidate_slug;
  NEW.updated_at := floor(extract(epoch from clock_timestamp()) * 1000)::bigint;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_view_node_record()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  selected_view public.views%ROWTYPE;
  selected_class public.classes%ROWTYPE;
  record_exists BOOLEAN;
  record_domain_id UUID;
BEGIN
  SELECT *
  INTO selected_view
  FROM public.views
  WHERE id = NEW.view_id;

  IF selected_view.id IS NULL THEN
    RAISE EXCEPTION 'View node view was not found.';
  END IF;

  SELECT *
  INTO selected_class
  FROM public.classes
  WHERE id = NEW.record_class_id;

  IF selected_class.id IS NULL OR selected_class.table_name IS NULL THEN
    RAISE EXCEPTION 'View node class must point to a table-backed class.';
  END IF;

  IF selected_class.table_name NOT IN ('entities', 'claims') THEN
    RAISE EXCEPTION 'View nodes currently support Entity and Claim records.';
  END IF;

  EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I WHERE id = $1)', selected_class.table_name)
  INTO record_exists
  USING NEW.record_id;

  IF NOT record_exists THEN
    RAISE EXCEPTION 'View node record was not found.';
  END IF;

  EXECUTE format('SELECT domain_id FROM public.%I WHERE id = $1', selected_class.table_name)
  INTO record_domain_id
  USING NEW.record_id;

  IF record_domain_id IS DISTINCT FROM selected_view.domain_id THEN
    RAISE EXCEPTION 'View node record must belong to the selected view domain.';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_view_relationship_record()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  selected_view public.views%ROWTYPE;
  relationship_domain_id UUID;
BEGIN
  SELECT *
  INTO selected_view
  FROM public.views
  WHERE id = NEW.view_id;

  IF selected_view.id IS NULL THEN
    RAISE EXCEPTION 'View relationship view was not found.';
  END IF;

  SELECT domain_id
  INTO relationship_domain_id
  FROM public.relationships
  WHERE id = NEW.relationship_id;

  IF relationship_domain_id IS NULL THEN
    RAISE EXCEPTION 'View relationship record was not found.';
  END IF;

  IF relationship_domain_id IS DISTINCT FROM selected_view.domain_id THEN
    RAISE EXCEPTION 'View relationship must belong to the selected view domain.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_views_slug_from_label_before_write ON public.views;
DROP TRIGGER IF EXISTS validate_view_node_record_before_write ON public.view_nodes;
DROP TRIGGER IF EXISTS validate_view_relationship_record_before_write ON public.view_relationships;

CREATE TRIGGER set_views_slug_from_label_before_write
BEFORE INSERT OR UPDATE OF label, domain_id
ON public.views
FOR EACH ROW
EXECUTE FUNCTION public.set_views_slug_from_label();

CREATE TRIGGER validate_view_node_record_before_write
BEFORE INSERT OR UPDATE OF view_id, record_class_id, record_id
ON public.view_nodes
FOR EACH ROW
EXECUTE FUNCTION public.validate_view_node_record();

CREATE TRIGGER validate_view_relationship_record_before_write
BEFORE INSERT OR UPDATE OF view_id, relationship_id
ON public.view_relationships
FOR EACH ROW
EXECUTE FUNCTION public.validate_view_relationship_record();

ALTER TABLE public.views ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.view_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.view_relationships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access to views" ON public.views;
DROP POLICY IF EXISTS "Allow public create access to views" ON public.views;
DROP POLICY IF EXISTS "Allow public update access to views" ON public.views;
DROP POLICY IF EXISTS "Allow public delete access to views" ON public.views;

CREATE POLICY "Allow public read access to views"
ON public.views
FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "Allow public create access to views"
ON public.views
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "Allow public update access to views"
ON public.views
FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Allow public delete access to views"
ON public.views
FOR DELETE
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "Allow public read access to view_nodes" ON public.view_nodes;
DROP POLICY IF EXISTS "Allow public create access to view_nodes" ON public.view_nodes;
DROP POLICY IF EXISTS "Allow public update access to view_nodes" ON public.view_nodes;
DROP POLICY IF EXISTS "Allow public delete access to view_nodes" ON public.view_nodes;

CREATE POLICY "Allow public read access to view_nodes"
ON public.view_nodes
FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "Allow public create access to view_nodes"
ON public.view_nodes
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "Allow public update access to view_nodes"
ON public.view_nodes
FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Allow public delete access to view_nodes"
ON public.view_nodes
FOR DELETE
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "Allow public read access to view_relationships" ON public.view_relationships;
DROP POLICY IF EXISTS "Allow public create access to view_relationships" ON public.view_relationships;
DROP POLICY IF EXISTS "Allow public update access to view_relationships" ON public.view_relationships;
DROP POLICY IF EXISTS "Allow public delete access to view_relationships" ON public.view_relationships;

CREATE POLICY "Allow public read access to view_relationships"
ON public.view_relationships
FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "Allow public create access to view_relationships"
ON public.view_relationships
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "Allow public update access to view_relationships"
ON public.view_relationships
FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Allow public delete access to view_relationships"
ON public.view_relationships
FOR DELETE
TO anon, authenticated
USING (true);

GRANT USAGE ON SCHEMA public TO anon, authenticated;

GRANT SELECT, INSERT, DELETE ON public.views TO anon, authenticated;
GRANT UPDATE (domain_id, label, description, view_kind, status_id, updated_at) ON public.views TO anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.view_nodes TO anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.view_relationships TO anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.set_views_slug_from_label() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_views_slug_from_label() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_view_node_record() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.validate_view_node_record() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_view_relationship_record() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.validate_view_relationship_record() FROM anon, authenticated;
