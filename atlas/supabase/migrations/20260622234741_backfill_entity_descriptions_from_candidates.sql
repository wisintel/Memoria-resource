with candidate_descriptions as (
  select distinct on (candidate.target_record_id)
    candidate.target_record_id as entity_id,
    nullif(btrim(candidate.payload->>'rationale'), '') as description
  from public.distillation_candidates candidate
  where candidate.stage = 'entities'
    and candidate.status = 'approved'
    and candidate.target_record_id is not null
    and nullif(btrim(candidate.payload->>'rationale'), '') is not null
  order by
    candidate.target_record_id,
    candidate.reviewed_at desc nulls last,
    candidate.updated_at desc nulls last
)
update public.entities entity
set
  description = candidate_descriptions.description,
  updated_at = extract(epoch from now())::bigint * 1000
from candidate_descriptions
where candidate_descriptions.entity_id = entity.id
  and nullif(btrim(coalesce(entity.description, '')), '') is null;
