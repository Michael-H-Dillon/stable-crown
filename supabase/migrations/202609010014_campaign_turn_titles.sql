alter table public.campaign_turns
  add column if not exists turn_title text;

comment on column public.campaign_turns.turn_title is
  'Immutable display heading captured when the turn is resolved.';

update public.campaign_turns
set turn_title = concat(
  state_changes #>> '{nextState,campaignDate,year}',
  ' · DAY ',
  state_changes #>> '{nextState,campaignDate,day}',
  ' · ',
  upper(state_changes #>> '{nextState,campaignDate,segment}')
)
where turn_title is null
  and state_changes #>> '{nextState,campaignDate,year}' is not null
  and state_changes #>> '{nextState,campaignDate,day}' is not null
  and state_changes #>> '{nextState,campaignDate,segment}' is not null;
