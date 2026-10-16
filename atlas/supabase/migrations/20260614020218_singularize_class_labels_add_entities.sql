UPDATE public.classes
SET
  label = CASE table_name
    WHEN 'classes' THEN 'Class'
    WHEN 'domains' THEN 'Domain'
    WHEN 'kinds' THEN 'Kind'
    WHEN 'statuses' THEN 'Status'
    WHEN 'types' THEN 'Type'
    ELSE label
  END,
  updated_at = floor(extract(epoch from clock_timestamp()) * 1000)::bigint
WHERE table_name IN ('classes', 'domains', 'kinds', 'statuses', 'types');

CREATE TABLE IF NOT EXISTS public.entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_id UUID NOT NULL REFERENCES public.domains(id),
  type_id UUID NOT NULL REFERENCES public.types(id),
  kind_id UUID NOT NULL REFERENCES public.kinds(id),
  status_id UUID REFERENCES public.statuses(id),
  slug TEXT NOT NULL,
  label TEXT NOT NULL,
  created_at BIGINT NOT NULL DEFAULT floor(extract(epoch from clock_timestamp()) * 1000)::bigint,
  updated_at BIGINT NOT NULL DEFAULT floor(extract(epoch from clock_timestamp()) * 1000)::bigint,
  UNIQUE (domain_id, slug)
);

ALTER TABLE public.entities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access to entities" ON public.entities;
DROP POLICY IF EXISTS "Allow public create access to entities" ON public.entities;
DROP POLICY IF EXISTS "Allow public update access to entities" ON public.entities;
DROP POLICY IF EXISTS "Allow public delete access to entities" ON public.entities;

CREATE POLICY "Allow public read access to entities"
ON public.entities
FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "Allow public create access to entities"
ON public.entities
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "Allow public update access to entities"
ON public.entities
FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Allow public delete access to entities"
ON public.entities
FOR DELETE
TO anon, authenticated
USING (true);

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.entities TO anon, authenticated;
GRANT UPDATE (domain_id, type_id, kind_id, status_id, slug, label, updated_at) ON public.entities TO anon, authenticated;
