DROP POLICY IF EXISTS "Allow public update access to domains" ON public.domains;
DROP POLICY IF EXISTS "Allow public delete access to domains" ON public.domains;

CREATE POLICY "Allow public update access to domains"
ON public.domains
FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Allow public delete access to domains"
ON public.domains
FOR DELETE
TO anon, authenticated
USING (true);

GRANT UPDATE (slug, label, status_id, updated_at) ON public.domains TO anon, authenticated;
GRANT DELETE ON public.domains TO anon, authenticated;
