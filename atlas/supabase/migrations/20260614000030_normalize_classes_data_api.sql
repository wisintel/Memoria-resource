ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access to classes" ON public.classes;

CREATE POLICY "Allow public read access to classes"
ON public.classes
FOR SELECT
TO anon, authenticated
USING (true);

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT ON public.classes TO anon, authenticated;
