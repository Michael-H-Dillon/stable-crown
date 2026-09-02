-- Character status is deliberately a small player-facing vocabulary. Details
-- such as imprisonment remain in descriptions, locations, facts, and events.
update public.player_knowledge
set known_status = jsonb_set(
      coalesce(known_status,'{}'::jsonb),
      '{label}',
      to_jsonb(case
        when lower(coalesce(known_status->>'label',''))='dead' then 'Dead'
        when lower(coalesce(known_status->>'label','')) in ('missing','disappeared') then 'Missing'
        when lower(coalesce(known_status->>'label','')) in ('wounded','injured','incapacitated') then 'Wounded'
        when lower(coalesce(known_status->>'label','')) in ('unknown','status uncertain','unconfirmed','') then 'Unknown'
        else 'Alive'
      end::text),
      true
    ),
    updated_at=now();

update public.characters
set status = jsonb_set(
      jsonb_set(coalesce(status,'{}'::jsonb),'{label}',to_jsonb(case
        when lower(coalesce(status->>'label',status->>'condition',''))='dead' then 'Dead'
        when lower(coalesce(status->>'label',status->>'condition','')) in ('missing','disappeared') then 'Missing'
        when lower(coalesce(status->>'label',status->>'condition','')) in ('wounded','injured','incapacitated') then 'Wounded'
        when lower(coalesce(status->>'label',status->>'condition','')) in ('unknown','') then 'Unknown'
        else 'Alive'
      end::text),true),
      '{active}',
      to_jsonb(lower(coalesce(status->>'label',status->>'condition',''))<>'dead'),
      true
    );

update public.engine_authoritative_entity_state
set status = jsonb_set(coalesce(status,'{}'::jsonb),'{label}',to_jsonb(case
      when lower(coalesce(status->>'label',status->>'condition',''))='dead' then 'Dead'
      when lower(coalesce(status->>'label',status->>'condition','')) in ('missing','disappeared') then 'Missing'
      when lower(coalesce(status->>'label',status->>'condition','')) in ('wounded','injured','incapacitated') then 'Wounded'
      when lower(coalesce(status->>'label',status->>'condition','')) in ('unknown','') then 'Unknown'
      else 'Alive'
    end::text),true);
