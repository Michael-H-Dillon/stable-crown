-- Normalize player-facing inventory labels and repair ordinary possessions that
-- are already implied by the playable character's established background.
with player_inventory as (
  select
    c.id,
    c.entity_id,
    c.status,
    lower(concat_ws(' ', c.background->>'id', c.background->>'name', c.background->>'description')) as background_text,
    coalesce(c.status->>'summary', '') as summary_text
  from public.characters c
  where coalesce((c.traits->>'player')::boolean, false)
), repaired as (
  select
    p.id,
    p.entity_id,
    jsonb_set(
      p.status,
      '{inventory}',
      coalesce((
        select jsonb_agg(to_jsonb(item) order by ordinal)
        from (
          select distinct on (lower(item)) item, ordinal
          from (
            select
              case lower(raw_item)
                when 'renlys-seal' then 'Renly’s Seal'
                when 'traveling-mail' then 'Travelling Mail'
                when 'road-rations' then 'Road Rations'
                else initcap(regexp_replace(raw_item, '[-_]+', ' ', 'g'))
              end as item,
              ordinal
            from jsonb_array_elements_text(coalesce(p.status->'inventory', '[]'::jsonb)) with ordinality existing(raw_item, ordinal)
            union all
            select 'Sword', 100001 where p.background_text ~ '\m(knight|lord|lady|prince|princess|king|queen|noble)\M'
            union all
            select 'Horse', 100002 where p.background_text ~ '\m(knight|lord|lady|prince|princess|king|queen|noble)\M'
              and concat_ws(' ', p.background_text, p.summary_text) ~* '\m(horse|horseback|mounted|ride|rides|riding|destrier|courser|palfrey|knight)\M'
            union all
            select 'Personal Purse', 100003 where p.background_text ~ '\m(lord|lady|prince|princess|king|queen|noble)\M'
          ) candidates
          where item <> ''
          order by lower(item), ordinal
        ) deduplicated
      ), '[]'::jsonb),
      true
    ) as next_status
  from player_inventory p
)
update public.characters c
set status = r.next_status
from repaired r
where c.id = r.id;

update public.engine_authoritative_entity_state truth
set status = c.status,
    updated_at = now()
from public.characters c
where c.entity_id = truth.entity_id
  and coalesce((c.traits->>'player')::boolean, false);
