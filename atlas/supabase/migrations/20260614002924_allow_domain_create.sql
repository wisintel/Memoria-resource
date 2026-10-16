DROP POLICY IF EXISTS "Allow public create access to domains" ON public.domains;

CREATE POLICY "Allow public create access to domains"
ON public.domains
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

GRANT INSERT ON public.domains TO anon, authenticated;
