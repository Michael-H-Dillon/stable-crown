-- A character can hold several simultaneous relationship roles with the player.
create table public.campaign_relationship_roles (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  entity_id uuid references public.world_entities(id) on delete set null,
  entity_name text not null,
  relationship_type text not null check(char_length(trim(relationship_type)) between 2 and 60),
  status text not null default 'active' check(status in ('active','former')),
  private boolean not null default false,
  started_by_turn_id uuid references public.campaign_turns(id) on delete set null,
  ended_by_turn_id uuid references public.campaign_turns(id) on delete set null,
  started_reason text not null,
  ended_reason text,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  updated_at timestamptz not null default now()
);
create unique index campaign_relationship_roles_active_unique on public.campaign_relationship_roles(campaign_id,lower(entity_name),lower(relationship_type)) where status='active';
create index campaign_relationship_roles_campaign_entity_idx on public.campaign_relationship_roles(campaign_id,lower(entity_name),status);

create table public.campaign_relationship_role_history (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  relationship_role_id uuid references public.campaign_relationship_roles(id) on delete set null,
  turn_id uuid references public.campaign_turns(id) on delete set null,
  entity_id uuid references public.world_entities(id) on delete set null,
  entity_name text not null,
  relationship_type text not null,
  change_type text not null check(change_type in ('started','ended','restored')),
  reason text not null,
  created_at timestamptz not null default now()
);
create index campaign_relationship_role_history_campaign_idx on public.campaign_relationship_role_history(campaign_id,created_at desc);

alter table public.campaign_relationship_roles enable row level security;
alter table public.campaign_relationship_role_history enable row level security;
create policy campaign_relationship_roles_member_select on public.campaign_relationship_roles for select to authenticated using(private.is_campaign_member(campaign_id));
create policy campaign_relationship_role_history_member_select on public.campaign_relationship_role_history for select to authenticated using(private.is_campaign_member(campaign_id));
grant select on public.campaign_relationship_roles,public.campaign_relationship_role_history to authenticated;
