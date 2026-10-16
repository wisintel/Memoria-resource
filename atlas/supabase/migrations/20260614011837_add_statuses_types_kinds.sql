CREATE TABLE IF NOT EXISTS public.statuses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id UUID NOT NULL REFERENCES public.classes(id),
  slug TEXT NOT NULL,
  label TEXT NOT NULL,
  created_at BIGINT NOT NULL DEFAULT floor(extract(epoch from clock_timestamp()) * 1000)::bigint,
  updated_at BIGINT NOT NULL DEFAULT floor(extract(epoch from clock_timestamp()) * 1000)::bigint,
  UNIQUE (class_id, slug)
);

CREATE TABLE IF NOT EXISTS public.types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id UUID NOT NULL REFERENCES public.classes(id),
  slug TEXT NOT NULL,
  label TEXT NOT NULL,
  status_id UUID REFERENCES public.statuses(id),
  created_at BIGINT NOT NULL DEFAULT floor(extract(epoch from clock_timestamp()) * 1000)::bigint,
  updated_at BIGINT NOT NULL DEFAULT floor(extract(epoch from clock_timestamp()) * 1000)::bigint,
  UNIQUE (class_id, slug)
);

CREATE TABLE IF NOT EXISTS public.kinds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_id UUID REFERENCES public.domains(id),
  class_id UUID NOT NULL REFERENCES public.classes(id),
  type_id UUID NOT NULL REFERENCES public.types(id),
  slug TEXT NOT NULL,
  label TEXT NOT NULL,
  status_id UUID REFERENCES public.statuses(id),
  created_at BIGINT NOT NULL DEFAULT floor(extract(epoch from clock_timestamp()) * 1000)::bigint,
  updated_at BIGINT NOT NULL DEFAULT floor(extract(epoch from clock_timestamp()) * 1000)::bigint,
  UNIQUE (domain_id, class_id, type_id, slug)
);

ALTER TABLE public.domains
ALTER COLUMN status_id TYPE UUID
USING NULLIF(status_id, '')::uuid;

ALTER TABLE public.domains
ADD CONSTRAINT domains_status_id_fkey
FOREIGN KEY (status_id) REFERENCES public.statuses(id);

ALTER TABLE public.statuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kinds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access to statuses" ON public.statuses;
DROP POLICY IF EXISTS "Allow public create access to statuses" ON public.statuses;
DROP POLICY IF EXISTS "Allow public update access to statuses" ON public.statuses;
DROP POLICY IF EXISTS "Allow public delete access to statuses" ON public.statuses;

CREATE POLICY "Allow public read access to statuses"
ON public.statuses
FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "Allow public create access to statuses"
ON public.statuses
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "Allow public update access to statuses"
ON public.statuses
FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Allow public delete access to statuses"
ON public.statuses
FOR DELETE
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "Allow public read access to types" ON public.types;
DROP POLICY IF EXISTS "Allow public create access to types" ON public.types;
DROP POLICY IF EXISTS "Allow public update access to types" ON public.types;
DROP POLICY IF EXISTS "Allow public delete access to types" ON public.types;

CREATE POLICY "Allow public read access to types"
ON public.types
FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "Allow public create access to types"
ON public.types
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "Allow public update access to types"
ON public.types
FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Allow public delete access to types"
ON public.types
FOR DELETE
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "Allow public read access to kinds" ON public.kinds;
DROP POLICY IF EXISTS "Allow public create access to kinds" ON public.kinds;
DROP POLICY IF EXISTS "Allow public update access to kinds" ON public.kinds;
DROP POLICY IF EXISTS "Allow public delete access to kinds" ON public.kinds;

CREATE POLICY "Allow public read access to kinds"
ON public.kinds
FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "Allow public create access to kinds"
ON public.kinds
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "Allow public update access to kinds"
ON public.kinds
FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Allow public delete access to kinds"
ON public.kinds
FOR DELETE
TO anon, authenticated
USING (true);

GRANT USAGE ON SCHEMA public TO anon, authenticated;

GRANT SELECT, INSERT, DELETE ON public.statuses TO anon, authenticated;
GRANT UPDATE (class_id, slug, label, updated_at) ON public.statuses TO anon, authenticated;

GRANT SELECT, INSERT, DELETE ON public.types TO anon, authenticated;
GRANT UPDATE (class_id, slug, label, status_id, updated_at) ON public.types TO anon, authenticated;

GRANT SELECT, INSERT, DELETE ON public.kinds TO anon, authenticated;
GRANT UPDATE (domain_id, class_id, type_id, slug, label, status_id, updated_at) ON public.kinds TO anon, authenticated;
