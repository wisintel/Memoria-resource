CREATE TABLE IF NOT EXISTS public."user" (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  email_verified BOOLEAN NOT NULL DEFAULT false,
  image TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.session (
  id TEXT PRIMARY KEY,
  expires_at TIMESTAMPTZ NOT NULL,
  token TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_address TEXT,
  user_agent TEXT,
  user_id TEXT NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.account (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  access_token TEXT,
  refresh_token TEXT,
  id_token TEXT,
  access_token_expires_at TIMESTAMPTZ,
  refresh_token_expires_at TIMESTAMPTZ,
  scope TEXT,
  password TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.verification (
  id TEXT PRIMARY KEY,
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.atlas_chats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id TEXT NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'New chat',
  eve_session JSONB,
  pending_user_message TEXT,
  pending_user_message_created_at TIMESTAMPTZ,
  domain_id UUID REFERENCES public.domains(id) ON DELETE SET NULL,
  view_id UUID REFERENCES public.views(id) ON DELETE SET NULL,
  document_id UUID REFERENCES public.documents(id) ON DELETE SET NULL,
  active_document_shard_id UUID REFERENCES public.document_shards(id) ON DELETE SET NULL,
  mode TEXT,
  selected_record_table TEXT,
  selected_record_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT atlas_chats_title_nonempty CHECK (length(trim(title)) > 0)
);

CREATE TABLE IF NOT EXISTS public.atlas_chat_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id UUID NOT NULL REFERENCES public.atlas_chats(id) ON DELETE CASCADE,
  event_index INTEGER NOT NULL,
  event JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT atlas_chat_events_event_index_nonnegative CHECK (event_index >= 0)
);

CREATE INDEX IF NOT EXISTS idx_session_user_id
ON public.session (user_id);

CREATE INDEX IF NOT EXISTS idx_account_user_id
ON public.account (user_id);

CREATE INDEX IF NOT EXISTS idx_atlas_chats_owner_updated
ON public.atlas_chats (owner_user_id, updated_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_atlas_chats_owner_domain_updated
ON public.atlas_chats (owner_user_id, domain_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_atlas_chats_owner_view_updated
ON public.atlas_chats (owner_user_id, view_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_atlas_chat_events_chat
ON public.atlas_chat_events (chat_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_atlas_chat_events_chat_index
ON public.atlas_chat_events (chat_id, event_index);

ALTER TABLE public."user" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verification ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atlas_chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atlas_chat_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public."user" FROM anon, authenticated;
REVOKE ALL ON TABLE public.session FROM anon, authenticated;
REVOKE ALL ON TABLE public.account FROM anon, authenticated;
REVOKE ALL ON TABLE public.verification FROM anon, authenticated;
REVOKE ALL ON TABLE public.atlas_chats FROM anon, authenticated;
REVOKE ALL ON TABLE public.atlas_chat_events FROM anon, authenticated;
