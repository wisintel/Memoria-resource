ALTER TABLE public.documents
ADD COLUMN IF NOT EXISTS label TEXT;

UPDATE public.documents
SET label = title
WHERE label IS NULL;

ALTER TABLE public.documents
ALTER COLUMN label SET NOT NULL;
