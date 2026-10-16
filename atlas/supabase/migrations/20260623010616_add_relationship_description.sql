alter table public.relationships
add column if not exists description text;

with candidate_descriptions as (
  select distinct on (candidate.target_record_id)
    candidate.target_record_id as relationship_id,
    nullif(btrim(candidate.payload->>'rationale'), '') as description
  from public.distillation_candidates candidate
  where candidate.stage in ('entity_relationships', 'claim_relationships')
    and candidate.status = 'approved'
    and candidate.target_record_id is not null
    and nullif(btrim(candidate.payload->>'rationale'), '') is not null
  order by
    candidate.target_record_id,
    candidate.reviewed_at desc nulls last,
    candidate.updated_at desc nulls last
)
update public.relationships relationship
set
  description = candidate_descriptions.description,
  updated_at = extract(epoch from now())::bigint * 1000
from candidate_descriptions
where candidate_descriptions.relationship_id = relationship.id
  and nullif(btrim(coalesce(relationship.description, '')), '') is null;
