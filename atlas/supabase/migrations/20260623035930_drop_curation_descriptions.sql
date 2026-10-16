alter table public.entities
drop column if exists description;

alter table public.relationships
drop column if exists description;

alter table public.views
drop column if exists description;

alter table public.domain_types
drop column if exists description;

alter table public.domain_type_ontology_items
drop column if exists description;
