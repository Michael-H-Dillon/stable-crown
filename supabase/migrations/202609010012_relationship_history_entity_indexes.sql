-- Names are mutable presentation data. Backfill stable entity references where
-- older relationship history rows can be matched safely within their campaign.
update public.relationship_history as history
set entity_id = entity.id,
    entity_name = entity.canonical_name
from public.world_entities as entity
where history.entity_id is null
  and history.campaign_id = entity.campaign_id
  and lower(history.entity_name) = lower(entity.canonical_name);

update public.campaign_relationship_role_history as history
set entity_id = entity.id,
    entity_name = entity.canonical_name
from public.world_entities as entity
where history.entity_id is null
  and history.campaign_id = entity.campaign_id
  and lower(history.entity_name) = lower(entity.canonical_name);

create index if not exists relationship_history_campaign_entity_idx
  on public.relationship_history (campaign_id, entity_id, created_at desc);

create index if not exists relationship_role_history_campaign_entity_idx
  on public.campaign_relationship_role_history (
    campaign_id,
    entity_id,
    created_at desc
  );
