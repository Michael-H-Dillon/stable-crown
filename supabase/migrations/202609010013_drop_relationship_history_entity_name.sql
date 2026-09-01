-- History belongs to an immutable entity, never to its mutable display name.
-- First make one final attempt to link legacy name-only rows.
update public.relationship_history as history
set entity_id = character.entity_id
from public.characters as character
where history.entity_id is null
  and history.campaign_id = character.campaign_id
  and character.entity_id is not null
  and lower(history.entity_name) = lower(character.name);

update public.campaign_relationship_role_history as history
set entity_id = character.entity_id
from public.characters as character
where history.entity_id is null
  and history.campaign_id = character.campaign_id
  and character.entity_id is not null
  and lower(history.entity_name) = lower(character.name);

alter table public.relationship_history
  drop column if exists entity_name;

alter table public.campaign_relationship_role_history
  drop column if exists entity_name;

notify pgrst, 'reload schema';
