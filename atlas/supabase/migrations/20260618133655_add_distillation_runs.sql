CREATE TABLE IF NOT EXISTS public.distillation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_id UUID NOT NULL REFERENCES public.domains(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'draft',
  current_step TEXT NOT NULL DEFAULT 'claims',
  claim_registry JSONB NOT NULL DEFAULT '{"items":[]}'::jsonb,
  entity_registry JSONB NOT NULL DEFAULT '{"items":[]}'::jsonb,
  relationship_registry JSONB NOT NULL DEFAULT '{"items":[]}'::jsonb,
  bundle JSONB NOT NULL DEFAULT '{}'::jsonb,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  started_at BIGINT,
  completed_at BIGINT,
  created_at BIGINT NOT NULL DEFAULT floor(extract(epoch from clock_timestamp()) * 1000)::bigint,
  updated_at BIGINT NOT NULL DEFAULT floor(extract(epoch from clock_timestamp()) * 1000)::bigint,
  CONSTRAINT distillation_runs_status_check CHECK (
    status IN ('draft', 'running', 'needs_review', 'approved', 'failed', 'promoted', 'archived')
  ),
  CONSTRAINT distillation_runs_current_step_check CHECK (
    current_step IN ('claims', 'entities', 'relationships', 'bundle', 'promotion')
  ),
  CONSTRAINT distillation_runs_claim_registry_object_check CHECK (jsonb_typeof(claim_registry) = 'object'),
  CONSTRAINT distillation_runs_entity_registry_object_check CHECK (jsonb_typeof(entity_registry) = 'object'),
  CONSTRAINT distillation_runs_relationship_registry_object_check CHECK (jsonb_typeof(relationship_registry) = 'object'),
  CONSTRAINT distillation_runs_bundle_object_check CHECK (jsonb_typeof(bundle) = 'object'),
  CONSTRAINT distillation_runs_settings_object_check CHECK (jsonb_typeof(settings) = 'object')
);

CREATE INDEX IF NOT EXISTS distillation_runs_domain_updated_idx
ON public.distillation_runs (domain_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS distillation_runs_document_created_idx
ON public.distillation_runs (document_id, created_at DESC);

CREATE INDEX IF NOT EXISTS distillation_runs_status_idx
ON public.distillation_runs (status);

ALTER TABLE public.distillation_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access to distillation runs" ON public.distillation_runs;
DROP POLICY IF EXISTS "Allow public create access to distillation runs" ON public.distillation_runs;
DROP POLICY IF EXISTS "Allow public update access to distillation runs" ON public.distillation_runs;
DROP POLICY IF EXISTS "Allow public delete access to distillation runs" ON public.distillation_runs;

CREATE POLICY "Allow public read access to distillation runs"
ON public.distillation_runs
FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "Allow public create access to distillation runs"
ON public.distillation_runs
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "Allow public update access to distillation runs"
ON public.distillation_runs
FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Allow public delete access to distillation runs"
ON public.distillation_runs
FOR DELETE
TO anon, authenticated
USING (true);

GRANT SELECT, INSERT, DELETE ON public.distillation_runs TO anon, authenticated;

GRANT UPDATE (
  domain_id,
  document_id,
  status,
  current_step,
  claim_registry,
  entity_registry,
  relationship_registry,
  bundle,
  settings,
  error_message,
  started_at,
  completed_at,
  updated_at
) ON public.distillation_runs TO anon, authenticated;
