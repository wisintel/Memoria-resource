with claim_relationship_descriptions as (
  select
    relationship.id as relationship_id,
    concat_ws(
      E'\n',
      'Relationship: ' || relationship_type.label,
      'Source claim: ' || source_claim.claim_text,
      'Target claim: ' || target_claim.claim_text
    ) as description
  from public.relationships relationship
  join public.classes source_class
    on source_class.id = relationship.source_class_id
    and source_class.table_name = 'claims'
  join public.classes target_class
    on target_class.id = relationship.target_class_id
    and target_class.table_name = 'claims'
  join public.claims source_claim
    on source_claim.id = relationship.source_record_id
  join public.claims target_claim
    on target_claim.id = relationship.target_record_id
  join public.types relationship_type
    on relationship_type.id = relationship.type_id
  where nullif(btrim(coalesce(relationship.description, '')), '') is null
)
update public.relationships relationship
set
  description = claim_relationship_descriptions.description,
  updated_at = extract(epoch from now())::bigint * 1000
from claim_relationship_descriptions
where claim_relationship_descriptions.relationship_id = relationship.id;

with entity_relationship_descriptions as (
  select
    relationship.id as relationship_id,
    concat_ws(
      E'\n',
      'Relationship: ' || relationship_type.label,
      'Source entity: ' || source_entity.label,
      'Target entity: ' || target_entity.label
    ) as description
  from public.relationships relationship
  join public.classes source_class
    on source_class.id = relationship.source_class_id
    and source_class.table_name = 'entities'
  join public.classes target_class
    on target_class.id = relationship.target_class_id
    and target_class.table_name = 'entities'
  join public.entities source_entity
    on source_entity.id = relationship.source_record_id
  join public.entities target_entity
    on target_entity.id = relationship.target_record_id
  join public.types relationship_type
    on relationship_type.id = relationship.type_id
  where nullif(btrim(coalesce(relationship.description, '')), '') is null
)
update public.relationships relationship
set
  description = entity_relationship_descriptions.description,
  updated_at = extract(epoch from now())::bigint * 1000
from entity_relationship_descriptions
where entity_relationship_descriptions.relationship_id = relationship.id;
