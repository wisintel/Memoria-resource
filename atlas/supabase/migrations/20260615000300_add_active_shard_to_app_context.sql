ALTER TABLE public.app_context_sessions
ADD COLUMN IF NOT EXISTS active_document_shard_id UUID REFERENCES public.document_shards(id) ON DELETE SET NULL;
