-- Earlier context-research jobs copied the batch summary into every character's
-- individual knowledge record. Restore the character-specific dossier text.
update public.player_knowledge knowledge
set source_summary = coalesce(
      nullif(trim(character.background->>'description'),''),
      nullif(trim(character.background->>'name'),''),
      entity.public_description,
      character.name || ' was added through researched campaign context.'
    ),
    updated_at = now()
from public.characters character
join public.world_entities entity on entity.id=character.entity_id
where knowledge.entity_id=character.entity_id
  and coalesce((character.traits->>'researchedContext')::boolean,false)
  and knowledge.source_summary like 'Added from researched author context.%';
