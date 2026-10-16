CREATE TABLE IF NOT EXISTS public.domains (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  status_id TEXT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);
