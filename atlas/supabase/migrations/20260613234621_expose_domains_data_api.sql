ALTER TABLE public.domains ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access to domains" ON public.domains;

CREATE POLICY "Allow public read access to domains"
ON public.domains
FOR SELECT
TO anon, authenticated
USING (true);

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT ON public.domains TO anon, authenticated;
