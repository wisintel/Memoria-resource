ALTER TABLE public.claims
ADD COLUMN IF NOT EXISTS source_document_id UUID REFERENCES public.documents(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS claims_source_document_idx
ON public.claims (source_document_id);

GRANT UPDATE (
  domain_id,
  type_id,
  kind_id,
  target_entity_ids,
  source_document_id,
  status_id,
  slug,
  label,
  claim_text,
  updated_at
) ON public.claims TO anon, authenticated;
