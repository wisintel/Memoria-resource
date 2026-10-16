CREATE TABLE IF NOT EXISTS public.distillation_shard_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_id UUID NOT NULL REFERENCES public.domains(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  shard_id UUID NOT NULL REFERENCES public.document_shards(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'draft',
  current_stage TEXT NOT NULL DEFAULT 'ontology',
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  started_at BIGINT,
  completed_at BIGINT,
  created_at BIGINT NOT NULL DEFAULT floor(extract(epoch from clock_timestamp()) * 1000)::bigint,
  updated_at BIGINT NOT NULL DEFAULT floor(extract(epoch from clock_timestamp()) * 1000)::bigint,
  CONSTRAINT distillation_shard_runs_shard_unique UNIQUE (shard_id),
  CONSTRAINT distillation_shard_runs_status_check CHECK (
    status IN ('draft', 'running', 'needs_review', 'completed', 'failed', 'archived')
  ),
  CONSTRAINT distillation_shard_runs_current_stage_check CHECK (
    current_stage IN ('ontology', 'entities', 'claims', 'entity_relationships', 'claim_relationships', 'promotion', 'complete')
  ),
  CONSTRAINT distillation_shard_runs_settings_object_check CHECK (jsonb_typeof(settings) = 'object')
);

CREATE TABLE IF NOT EXISTS public.distillation_stage_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shard_run_id UUID NOT NULL REFERENCES public.distillation_shard_runs(id) ON DELETE CASCADE,
  stage TEXT NOT NULL,
  stage_order INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  candidate_count INTEGER NOT NULL DEFAULT 0,
  approved_count INTEGER NOT NULL DEFAULT 0,
  rejected_count INTEGER NOT NULL DEFAULT 0,
  input_context JSONB NOT NULL DEFAULT '{}'::jsonb,
  result_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  started_at BIGINT,
  completed_at BIGINT,
  created_at BIGINT NOT NULL DEFAULT floor(extract(epoch from clock_timestamp()) * 1000)::bigint,
  updated_at BIGINT NOT NULL DEFAULT floor(extract(epoch from clock_timestamp()) * 1000)::bigint,
  CONSTRAINT distillation_stage_runs_run_stage_unique UNIQUE (shard_run_id, stage),
  CONSTRAINT distillation_stage_runs_stage_check CHECK (
    stage IN ('ontology', 'entities', 'claims', 'entity_relationships', 'claim_relationships', 'promotion')
  ),
  CONSTRAINT distillation_stage_runs_status_check CHECK (
    status IN ('pending', 'running', 'needs_review', 'completed', 'failed', 'skipped')
  ),
  CONSTRAINT distillation_stage_runs_candidate_count_check CHECK (candidate_count >= 0),
  CONSTRAINT distillation_stage_runs_approved_count_check CHECK (approved_count >= 0),
  CONSTRAINT distillation_stage_runs_rejected_count_check CHECK (rejected_count >= 0),
  CONSTRAINT distillation_stage_runs_input_context_object_check CHECK (jsonb_typeof(input_context) = 'object'),
  CONSTRAINT distillation_stage_runs_result_summary_object_check CHECK (jsonb_typeof(result_summary) = 'object')
);

CREATE TABLE IF NOT EXISTS public.distillation_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shard_run_id UUID NOT NULL REFERENCES public.distillation_shard_runs(id) ON DELETE CASCADE,
  stage_run_id UUID NOT NULL REFERENCES public.distillation_stage_runs(id) ON DELETE CASCADE,
  stage TEXT NOT NULL,
  candidate_kind TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  approval_action TEXT,
  target_class_id UUID REFERENCES public.classes(id) ON DELETE SET NULL,
  target_record_id UUID,
  dedupe_key TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  generated_at BIGINT NOT NULL DEFAULT floor(extract(epoch from clock_timestamp()) * 1000)::bigint,
  reviewed_at BIGINT,
  created_at BIGINT NOT NULL DEFAULT floor(extract(epoch from clock_timestamp()) * 1000)::bigint,
  updated_at BIGINT NOT NULL DEFAULT floor(extract(epoch from clock_timestamp()) * 1000)::bigint,
  CONSTRAINT distillation_candidates_stage_check CHECK (
    stage IN ('ontology', 'entities', 'claims', 'entity_relationships', 'claim_relationships', 'promotion')
  ),
  CONSTRAINT distillation_candidates_kind_check CHECK (
    candidate_kind IN (
      'entity_type',
      'claim_type',
      'relationship_type',
      'entity',
      'claim',
      'entity_relationship',
      'claim_relationship',
      'promotion'
    )
  ),
  CONSTRAINT distillation_candidates_status_check CHECK (
    status IN ('pending', 'approved', 'rejected', 'superseded', 'failed')
  ),
  CONSTRAINT distillation_candidates_payload_object_check CHECK (jsonb_typeof(payload) = 'object'),
  CONSTRAINT distillation_candidates_evidence_object_check CHECK (jsonb_typeof(evidence) = 'object')
);

CREATE UNIQUE INDEX IF NOT EXISTS distillation_candidates_stage_dedupe_idx
ON public.distillation_candidates (stage_run_id, candidate_kind, dedupe_key)
WHERE dedupe_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.record_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_id UUID NOT NULL REFERENCES public.domains(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  shard_id UUID NOT NULL REFERENCES public.document_shards(id) ON DELETE CASCADE,
  source_class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  source_record_id UUID NOT NULL,
  evidence_kind TEXT NOT NULL DEFAULT 'generated_from',
  candidate_id UUID REFERENCES public.distillation_candidates(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at BIGINT NOT NULL DEFAULT floor(extract(epoch from clock_timestamp()) * 1000)::bigint,
  updated_at BIGINT NOT NULL DEFAULT floor(extract(epoch from clock_timestamp()) * 1000)::bigint,
  CONSTRAINT record_sources_evidence_kind_check CHECK (
    evidence_kind IN ('generated_from', 'supports', 'mentions', 'inferred_from', 'reviewed_from')
  ),
  CONSTRAINT record_sources_metadata_object_check CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS distillation_shard_runs_domain_updated_idx
ON public.distillation_shard_runs (domain_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS distillation_shard_runs_document_shard_idx
ON public.distillation_shard_runs (document_id, shard_id);

CREATE INDEX IF NOT EXISTS distillation_stage_runs_run_order_idx
ON public.distillation_stage_runs (shard_run_id, stage_order);

CREATE INDEX IF NOT EXISTS distillation_candidates_run_stage_status_idx
ON public.distillation_candidates (shard_run_id, stage, status);

CREATE INDEX IF NOT EXISTS distillation_candidates_target_idx
ON public.distillation_candidates (target_class_id, target_record_id);

CREATE INDEX IF NOT EXISTS record_sources_record_idx
ON public.record_sources (source_class_id, source_record_id);

CREATE INDEX IF NOT EXISTS record_sources_shard_idx
ON public.record_sources (shard_id, evidence_kind);

ALTER TABLE public.distillation_shard_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.distillation_stage_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.distillation_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.record_sources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access to distillation shard runs" ON public.distillation_shard_runs;
DROP POLICY IF EXISTS "Allow public create access to distillation shard runs" ON public.distillation_shard_runs;
DROP POLICY IF EXISTS "Allow public update access to distillation shard runs" ON public.distillation_shard_runs;
DROP POLICY IF EXISTS "Allow public delete access to distillation shard runs" ON public.distillation_shard_runs;

CREATE POLICY "Allow public read access to distillation shard runs"
ON public.distillation_shard_runs
FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "Allow public create access to distillation shard runs"
ON public.distillation_shard_runs
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "Allow public update access to distillation shard runs"
ON public.distillation_shard_runs
FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Allow public delete access to distillation shard runs"
ON public.distillation_shard_runs
FOR DELETE
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "Allow public read access to distillation stage runs" ON public.distillation_stage_runs;
DROP POLICY IF EXISTS "Allow public create access to distillation stage runs" ON public.distillation_stage_runs;
DROP POLICY IF EXISTS "Allow public update access to distillation stage runs" ON public.distillation_stage_runs;
DROP POLICY IF EXISTS "Allow public delete access to distillation stage runs" ON public.distillation_stage_runs;

CREATE POLICY "Allow public read access to distillation stage runs"
ON public.distillation_stage_runs
FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "Allow public create access to distillation stage runs"
ON public.distillation_stage_runs
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "Allow public update access to distillation stage runs"
ON public.distillation_stage_runs
FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Allow public delete access to distillation stage runs"
ON public.distillation_stage_runs
FOR DELETE
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "Allow public read access to distillation candidates" ON public.distillation_candidates;
DROP POLICY IF EXISTS "Allow public create access to distillation candidates" ON public.distillation_candidates;
DROP POLICY IF EXISTS "Allow public update access to distillation candidates" ON public.distillation_candidates;
DROP POLICY IF EXISTS "Allow public delete access to distillation candidates" ON public.distillation_candidates;

CREATE POLICY "Allow public read access to distillation candidates"
ON public.distillation_candidates
FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "Allow public create access to distillation candidates"
ON public.distillation_candidates
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "Allow public update access to distillation candidates"
ON public.distillation_candidates
FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Allow public delete access to distillation candidates"
ON public.distillation_candidates
FOR DELETE
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "Allow public read access to record sources" ON public.record_sources;
DROP POLICY IF EXISTS "Allow public create access to record sources" ON public.record_sources;
DROP POLICY IF EXISTS "Allow public update access to record sources" ON public.record_sources;
DROP POLICY IF EXISTS "Allow public delete access to record sources" ON public.record_sources;

CREATE POLICY "Allow public read access to record sources"
ON public.record_sources
FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "Allow public create access to record sources"
ON public.record_sources
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "Allow public update access to record sources"
ON public.record_sources
FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Allow public delete access to record sources"
ON public.record_sources
FOR DELETE
TO anon, authenticated
USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.distillation_shard_runs TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.distillation_stage_runs TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.distillation_candidates TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.record_sources TO anon, authenticated;
