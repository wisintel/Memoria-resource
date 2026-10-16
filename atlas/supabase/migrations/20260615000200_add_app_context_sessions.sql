CREATE TABLE IF NOT EXISTS public.app_context_sessions (
  session_id TEXT PRIMARY KEY,
  route TEXT NOT NULL,
  screen TEXT NOT NULL,
  domain_id UUID REFERENCES public.domains(id) ON DELETE SET NULL,
  document_id UUID REFERENCES public.documents(id) ON DELETE SET NULL,
  mode TEXT,
  selected_record_id UUID,
  selected_record_table TEXT,
  updated_at BIGINT NOT NULL DEFAULT floor(extract(epoch from clock_timestamp()) * 1000)::bigint,
  CONSTRAINT app_context_sessions_session_id_nonempty CHECK (length(trim(session_id)) > 0),
  CONSTRAINT app_context_sessions_route_nonempty CHECK (length(trim(route)) > 0),
  CONSTRAINT app_context_sessions_screen_nonempty CHECK (length(trim(screen)) > 0)
);

ALTER TABLE public.app_context_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access to app context sessions" ON public.app_context_sessions;
DROP POLICY IF EXISTS "Allow public upsert access to app context sessions" ON public.app_context_sessions;

CREATE POLICY "Allow public read access to app context sessions"
ON public.app_context_sessions
FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "Allow public upsert access to app context sessions"
ON public.app_context_sessions
FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_context_sessions TO anon, authenticated;
