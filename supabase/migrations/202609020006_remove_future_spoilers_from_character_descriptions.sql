create or replace function pg_temp.present_only_description(value text)
returns text
language sql
immutable
as $$
  select nullif(trim(string_agg(sentence, ' ' order by ordinal)), '')
  from regexp_split_to_table(coalesce(value, ''), '(?<=[.!?])\s+') with ordinality parts(sentence, ordinal)
  where sentence !~* '\m(in the future|future (event|title|role|office|appointment|elevation|marriage|death)|lies? beyond the campaign date|after the campaign date|later (elevation|appointment|promotion|marriage|death|allegiance|defection|role|title)|(will|would) (later |eventually )?(become|join|marry|die|betray|serve|be appointed|be elevated)|(will|would) go on to|is destined to|subsequently (became|joined|married|died|served|was appointed))\M';
$$;

update public.world_entities
set public_description = coalesce(pg_temp.present_only_description(public_description), canonical_name || ' is a known figure at the campaign opening.')
where entity_type = 'character'
  and public_description is distinct from pg_temp.present_only_description(public_description);

update public.characters
set background = jsonb_set(
  background,
  '{description}',
  to_jsonb(coalesce(pg_temp.present_only_description(background->>'description'), name || ' is a known figure at the campaign opening.')),
  true
)
where background ? 'description'
  and background->>'description' is distinct from pg_temp.present_only_description(background->>'description');

update public.player_knowledge knowledge
set source_summary = coalesce(pg_temp.present_only_description(knowledge.source_summary), entity.canonical_name || ' is a known figure at the campaign opening.'),
    updated_at = now()
from public.world_entities entity
where knowledge.entity_id = entity.id
  and entity.entity_type = 'character'
  and knowledge.source_summary is distinct from pg_temp.present_only_description(knowledge.source_summary);
