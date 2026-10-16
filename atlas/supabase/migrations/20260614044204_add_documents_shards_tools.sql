CREATE TABLE IF NOT EXISTS public.tools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  tool_kind TEXT NOT NULL,
  purpose TEXT,
  asset_path TEXT,
  metadata_path TEXT,
  entrypoint TEXT,
  launch_url TEXT,
  env_contract JSONB NOT NULL DEFAULT '{}'::jsonb,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'active',
  created_at BIGINT NOT NULL DEFAULT floor(extract(epoch from clock_timestamp()) * 1000)::bigint,
  updated_at BIGINT NOT NULL DEFAULT floor(extract(epoch from clock_timestamp()) * 1000)::bigint,
  CONSTRAINT tools_slug_format CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  CONSTRAINT tools_tool_kind_check CHECK (tool_kind IN ('extractor', 'sharder', 'launcher', 'workflow')),
  CONSTRAINT tools_status_check CHECK (status IN ('active', 'inactive', 'archived'))
);

CREATE TABLE IF NOT EXISTS public.documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_id UUID NOT NULL REFERENCES public.domains(id),
  title TEXT NOT NULL,
  source_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ready',
  source_filename TEXT,
  source_url TEXT,
  content_hash TEXT,
  mime_type TEXT,
  size_bytes BIGINT NOT NULL DEFAULT 0,
  shard_count INTEGER NOT NULL DEFAULT 0,
  extracted_by_tool_id UUID REFERENCES public.tools(id),
  error_message TEXT,
  created_at BIGINT NOT NULL DEFAULT floor(extract(epoch from clock_timestamp()) * 1000)::bigint,
  updated_at BIGINT NOT NULL DEFAULT floor(extract(epoch from clock_timestamp()) * 1000)::bigint,
  CONSTRAINT documents_source_type_check CHECK (source_type IN ('markdown', 'paste', 'html', 'url', 'pdf', 'converted_file')),
  CONSTRAINT documents_status_check CHECK (status IN ('ready', 'processing', 'failed')),
  CONSTRAINT documents_size_bytes_check CHECK (size_bytes >= 0),
  CONSTRAINT documents_shard_count_check CHECK (shard_count >= 0)
);

CREATE TABLE IF NOT EXISTS public.document_shards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  heading_path TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  body TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,
  created_at BIGINT NOT NULL DEFAULT floor(extract(epoch from clock_timestamp()) * 1000)::bigint,
  updated_at BIGINT NOT NULL DEFAULT floor(extract(epoch from clock_timestamp()) * 1000)::bigint,
  CONSTRAINT document_shards_position_check CHECK (position >= 0),
  CONSTRAINT document_shards_size_bytes_check CHECK (size_bytes >= 0),
  CONSTRAINT document_shards_document_position_unique UNIQUE (document_id, position)
);

CREATE INDEX IF NOT EXISTS documents_domain_updated_idx
ON public.documents (domain_id, updated_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS documents_domain_content_hash_unique_idx
ON public.documents (domain_id, content_hash)
WHERE content_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS documents_extracted_by_tool_idx
ON public.documents (extracted_by_tool_id);

CREATE INDEX IF NOT EXISTS document_shards_document_position_idx
ON public.document_shards (document_id, position);

ALTER TABLE public.tools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_shards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access to tools" ON public.tools;
DROP POLICY IF EXISTS "Allow public create access to tools" ON public.tools;
DROP POLICY IF EXISTS "Allow public update access to tools" ON public.tools;
DROP POLICY IF EXISTS "Allow public delete access to tools" ON public.tools;
DROP POLICY IF EXISTS "Allow public read access to documents" ON public.documents;
DROP POLICY IF EXISTS "Allow public create access to documents" ON public.documents;
DROP POLICY IF EXISTS "Allow public update access to documents" ON public.documents;
DROP POLICY IF EXISTS "Allow public delete access to documents" ON public.documents;
DROP POLICY IF EXISTS "Allow public read access to document_shards" ON public.document_shards;
DROP POLICY IF EXISTS "Allow public create access to document_shards" ON public.document_shards;
DROP POLICY IF EXISTS "Allow public update access to document_shards" ON public.document_shards;
DROP POLICY IF EXISTS "Allow public delete access to document_shards" ON public.document_shards;

CREATE POLICY "Allow public read access to tools"
ON public.tools
FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "Allow public create access to tools"
ON public.tools
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "Allow public update access to tools"
ON public.tools
FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Allow public delete access to tools"
ON public.tools
FOR DELETE
TO anon, authenticated
USING (true);

CREATE POLICY "Allow public read access to documents"
ON public.documents
FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "Allow public create access to documents"
ON public.documents
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "Allow public update access to documents"
ON public.documents
FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Allow public delete access to documents"
ON public.documents
FOR DELETE
TO anon, authenticated
USING (true);

CREATE POLICY "Allow public read access to document_shards"
ON public.document_shards
FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "Allow public create access to document_shards"
ON public.document_shards
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "Allow public update access to document_shards"
ON public.document_shards
FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Allow public delete access to document_shards"
ON public.document_shards
FOR DELETE
TO anon, authenticated
USING (true);

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.tools TO anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.documents TO anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.document_shards TO anon, authenticated;

GRANT UPDATE (
  slug,
  label,
  tool_kind,
  purpose,
  asset_path,
  metadata_path,
  entrypoint,
  launch_url,
  env_contract,
  config,
  status,
  updated_at
) ON public.tools TO anon, authenticated;

GRANT UPDATE (
  domain_id,
  title,
  source_type,
  status,
  source_filename,
  source_url,
  content_hash,
  mime_type,
  size_bytes,
  shard_count,
  extracted_by_tool_id,
  error_message,
  updated_at
) ON public.documents TO anon, authenticated;

GRANT UPDATE (
  document_id,
  position,
  heading_path,
  body,
  size_bytes,
  updated_at
) ON public.document_shards TO anon, authenticated;
