ALTER TABLE public.classes
ADD COLUMN field_layout JSONB NOT NULL DEFAULT '{}'::jsonb;

DROP POLICY IF EXISTS "Allow public layout updates to classes" ON public.classes;

CREATE POLICY "Allow public layout updates to classes"
ON public.classes
FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);

GRANT UPDATE (field_layout, updated_at) ON public.classes TO anon, authenticated;
