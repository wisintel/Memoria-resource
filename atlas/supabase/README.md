# Atlas Supabase

## Source Of Truth

The active Atlas database runs in Supabase Cloud. Do not treat a local Supabase
stack as authoritative unless David explicitly asks for local database work.

Use local files in this folder as source-controlled schema intent:

- `migrations/` contains tracked database migrations.
- `seed.sql` contains local seed data only when local development is explicitly in use.
- `config.toml` is Supabase CLI project metadata.

## App-Visible Tables

Tables that the Memoria web app reads through Supabase Data API need all of these in the migration that creates or exposes them:

```sql
ALTER TABLE public.example_table ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to example_table"
ON public.example_table
FOR SELECT
TO anon, authenticated
USING (true);

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT ON public.example_table TO anon, authenticated;
```

Register class-backed tables in `public.classes` in the same migration or the next migration.

## Current Class Tables

- `public.classes`: table registry.
- `public.claims`: domain-scoped assertions with one or more target entities.
- `public.domains`: domain workspace registry.
- `public.entities`: domain-scoped named things.
- `public.statuses`: class-scoped status vocabulary.
- `public.types`: reusable high-level categories scoped to a class.
- `public.kinds`: domain-aware specific options under class-scoped types.
- `public.views`: domain-scoped saved graph canvases.
- `public.view_nodes`: positioned class-backed records inside saved graph views.
- `public.view_relationships`: relationship records included in saved graph views.

## Workflow

Use `supabase migration new <name>` before adding migration SQL.

For verification and application, use the Supabase Cloud project through MCP/OAuth
or another explicitly approved cloud path. Do not run local database checks as a
substitute for cloud verification.
