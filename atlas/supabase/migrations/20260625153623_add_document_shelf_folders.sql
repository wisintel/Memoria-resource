CREATE TABLE IF NOT EXISTS public.document_shelf_folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_id UUID NOT NULL REFERENCES public.domains(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  collapsed BOOLEAN NOT NULL DEFAULT false,
  created_at BIGINT NOT NULL DEFAULT floor(extract(epoch from clock_timestamp()) * 1000)::bigint,
  updated_at BIGINT NOT NULL DEFAULT floor(extract(epoch from clock_timestamp()) * 1000)::bigint,
  CONSTRAINT document_shelf_folders_label_not_empty CHECK (length(btrim(label)) > 0),
  CONSTRAINT document_shelf_folders_position_check CHECK (position >= 0),
  CONSTRAINT document_shelf_folders_id_domain_unique UNIQUE (id, domain_id)
);

ALTER TABLE public.documents
ADD CONSTRAINT documents_id_domain_unique UNIQUE (id, domain_id);

CREATE TABLE IF NOT EXISTS public.document_shelf_folder_items (
  folder_id UUID NOT NULL,
  document_id UUID NOT NULL,
  domain_id UUID NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL DEFAULT floor(extract(epoch from clock_timestamp()) * 1000)::bigint,
  updated_at BIGINT NOT NULL DEFAULT floor(extract(epoch from clock_timestamp()) * 1000)::bigint,
  PRIMARY KEY (folder_id, document_id),
  CONSTRAINT document_shelf_folder_items_document_unique UNIQUE (document_id),
  CONSTRAINT document_shelf_folder_items_position_check CHECK (position >= 0),
  CONSTRAINT document_shelf_folder_items_folder_domain_fk
    FOREIGN KEY (folder_id, domain_id)
    REFERENCES public.document_shelf_folders(id, domain_id)
    ON DELETE CASCADE,
  CONSTRAINT document_shelf_folder_items_document_domain_fk
    FOREIGN KEY (document_id, domain_id)
    REFERENCES public.documents(id, domain_id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS document_shelf_folders_domain_position_idx
ON public.document_shelf_folders (domain_id, position ASC, created_at ASC);

CREATE INDEX IF NOT EXISTS document_shelf_folder_items_folder_position_idx
ON public.document_shelf_folder_items (folder_id, position ASC, created_at ASC);

CREATE INDEX IF NOT EXISTS document_shelf_folder_items_domain_idx
ON public.document_shelf_folder_items (domain_id);

ALTER TABLE public.document_shelf_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_shelf_folder_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access to document shelf folders" ON public.document_shelf_folders;
DROP POLICY IF EXISTS "Allow public create access to document shelf folders" ON public.document_shelf_folders;
DROP POLICY IF EXISTS "Allow public update access to document shelf folders" ON public.document_shelf_folders;
DROP POLICY IF EXISTS "Allow public delete access to document shelf folders" ON public.document_shelf_folders;
DROP POLICY IF EXISTS "Allow public read access to document shelf folder items" ON public.document_shelf_folder_items;
DROP POLICY IF EXISTS "Allow public create access to document shelf folder items" ON public.document_shelf_folder_items;
DROP POLICY IF EXISTS "Allow public update access to document shelf folder items" ON public.document_shelf_folder_items;
DROP POLICY IF EXISTS "Allow public delete access to document shelf folder items" ON public.document_shelf_folder_items;

CREATE POLICY "Allow public read access to document shelf folders"
ON public.document_shelf_folders
FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "Allow public create access to document shelf folders"
ON public.document_shelf_folders
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "Allow public update access to document shelf folders"
ON public.document_shelf_folders
FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Allow public delete access to document shelf folders"
ON public.document_shelf_folders
FOR DELETE
TO anon, authenticated
USING (true);

CREATE POLICY "Allow public read access to document shelf folder items"
ON public.document_shelf_folder_items
FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "Allow public create access to document shelf folder items"
ON public.document_shelf_folder_items
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "Allow public update access to document shelf folder items"
ON public.document_shelf_folder_items
FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Allow public delete access to document shelf folder items"
ON public.document_shelf_folder_items
FOR DELETE
TO anon, authenticated
USING (true);

GRANT SELECT, INSERT, DELETE ON public.document_shelf_folders TO anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.document_shelf_folder_items TO anon, authenticated;

GRANT UPDATE (
  label,
  position,
  collapsed,
  updated_at
) ON public.document_shelf_folders TO anon, authenticated;

GRANT UPDATE (
  folder_id,
  domain_id,
  position,
  updated_at
) ON public.document_shelf_folder_items TO anon, authenticated;
