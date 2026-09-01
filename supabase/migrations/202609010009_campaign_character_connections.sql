create table if not exists public.campaign_character_connections (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  source_entity_id uuid not null references public.world_entities(id) on delete cascade,
  target_entity_id uuid not null references public.world_entities(id) on delete cascade,
  source_name text not null,
  target_name text not null,
  relationship_type text not null check (char_length(trim(relationship_type)) between 2 and 60),
  status text not null default 'active' check (status in ('active', 'former')),
  private boolean not null default false,
  established_by_turn_id uuid references public.campaign_turns(id) on delete set null,
  reason text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campaign_character_connections_distinct_entities check (source_entity_id <> target_entity_id),
  constraint campaign_character_connections_unique unique (
    campaign_id,
    source_entity_id,
    target_entity_id,
    relationship_type
  )
);

create index if not exists campaign_character_connections_campaign_idx
  on public.campaign_character_connections (campaign_id, status);

create index if not exists campaign_character_connections_source_idx
  on public.campaign_character_connections (source_entity_id);

create index if not exists campaign_character_connections_target_idx
  on public.campaign_character_connections (target_entity_id);

alter table public.campaign_character_connections enable row level security;

create policy "Campaign members can read character connections"
  on public.campaign_character_connections
  for select
  to authenticated
  using (private.is_campaign_member(campaign_id));

grant select on public.campaign_character_connections to authenticated;

notify pgrst, 'reload schema';
