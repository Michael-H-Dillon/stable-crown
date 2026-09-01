-- Identity revelations rename the existing entity. Historical display labels
-- must follow that entity so dossiers do not appear to lose their history.
update public.relationship_history as history
set entity_name = entity.canonical_name
from public.world_entities as entity
where history.entity_id = entity.id
  and history.campaign_id = entity.campaign_id
  and history.entity_name is distinct from entity.canonical_name;

update public.campaign_relationship_role_history as history
set entity_name = entity.canonical_name
from public.world_entities as entity
where history.entity_id = entity.id
  and history.campaign_id = entity.campaign_id
  and history.entity_name is distinct from entity.canonical_name;

notify pgrst, 'reload schema';
