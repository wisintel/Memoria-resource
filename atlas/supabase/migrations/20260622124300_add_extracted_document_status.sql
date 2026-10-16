ALTER TABLE public.documents
DROP CONSTRAINT IF EXISTS documents_status_check;

ALTER TABLE public.documents
ADD CONSTRAINT documents_status_check
CHECK (status IN ('ready', 'processing', 'failed', 'extracted'));
