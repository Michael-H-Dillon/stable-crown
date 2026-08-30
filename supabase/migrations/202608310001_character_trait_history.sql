create table public.character_trait_history (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  character_id uuid not null references public.characters(id) on delete cascade,
  turn_id uuid references public.campaign_turns(id) on delete set null,
  trait_name text not null check(char_length(trait_name) between 2 and 80),
  change_type text not null check(change_type in ('add','intensify','weaken','remove','replace')),
  previous_trait text,
  scope text not null check(scope in ('general','targeted')),
  target_name text,
  strength_delta integer not null check(strength_delta between -100 and 100),
  reason text not null check(char_length(reason) between 10 and 500),
  created_at timestamptz not null default now(),
  check((scope='targeted' and target_name is not null) or (scope='general' and target_name is null))
);

create index character_trait_history_campaign_character_idx on public.character_trait_history(campaign_id, character_id, created_at desc);
alter table public.character_trait_history enable row level security;
create policy character_trait_history_member_select on public.character_trait_history for select to authenticated using(private.is_campaign_member(campaign_id));
grant select on public.character_trait_history to authenticated;
