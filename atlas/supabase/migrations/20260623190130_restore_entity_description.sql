alter table public.entities
add column if not exists description text;

grant update (description) on public.entities to anon, authenticated;
