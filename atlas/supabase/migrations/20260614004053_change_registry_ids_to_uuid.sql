BEGIN;

ALTER TABLE public.classes DROP CONSTRAINT classes_pkey;
ALTER TABLE public.classes ALTER COLUMN id DROP IDENTITY IF EXISTS;
ALTER TABLE public.classes ALTER COLUMN id TYPE UUID USING gen_random_uuid();
ALTER TABLE public.classes ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.classes ADD PRIMARY KEY (id);

ALTER TABLE public.domains DROP CONSTRAINT domains_pkey;
ALTER TABLE public.domains ALTER COLUMN id DROP IDENTITY IF EXISTS;
ALTER TABLE public.domains ALTER COLUMN id TYPE UUID USING gen_random_uuid();
ALTER TABLE public.domains ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.domains ADD PRIMARY KEY (id);

COMMIT;
