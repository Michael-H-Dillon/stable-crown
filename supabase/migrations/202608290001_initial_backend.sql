create extension if not exists pgcrypto;
create extension if not exists citext;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username citext not null unique check (username ~ '^[A-Za-z0-9_-]{3,24}$'),
  display_name text not null check (char_length(display_name) between 1 and 60),
  turns_balance integer not null default 20 check (turns_balance >= 0),
  created_at timestamptz not null default now()
);

create table public.world_packs (
  id uuid primary key default gen_random_uuid(), owner_id uuid references auth.users(id) on delete cascade,
  title text not null, slug text not null, is_system boolean not null default false, created_at timestamptz not null default now(),
  unique nulls not distinct (owner_id, slug)
);
create table public.world_pack_versions (
  id uuid primary key default gen_random_uuid(), pack_id uuid not null references public.world_packs(id) on delete cascade,
  version integer not null check (version > 0), status text not null check (status in ('draft','validation-error','ready')),
  schema_version text not null default '1.0', content jsonb not null, created_at timestamptz not null default now(), unique(pack_id, version)
);
create table public.campaigns (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
  pack_version_id uuid not null references public.world_pack_versions(id), title text not null,
  status text not null default 'active' check (status in ('active','archived','completed')),
  current_chapter integer not null default 1, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.campaign_members (
  campaign_id uuid not null references public.campaigns(id) on delete cascade, user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner','player')), primary key(campaign_id,user_id)
);
create table public.locations (
  id uuid primary key default gen_random_uuid(), campaign_id uuid not null references public.campaigns(id) on delete cascade,
  parent_id uuid references public.locations(id) on delete set null, name text not null,
  location_type text not null check (location_type in ('realm','region','settlement','landmark','interior','unknown')),
  public_description text, created_at timestamptz not null default now(), unique(campaign_id,name)
);
create table public.world_entities (
  id uuid primary key default gen_random_uuid(), campaign_id uuid not null references public.campaigns(id) on delete cascade,
  entity_type text not null check (entity_type in ('character','faction','army','settlement','resource','artifact')),
  canonical_name text not null, public_description text, created_at timestamptz not null default now()
);
create table public.characters (
  id uuid primary key default gen_random_uuid(), campaign_id uuid not null references public.campaigns(id) on delete cascade,
  entity_id uuid not null unique references public.world_entities(id) on delete cascade, name text not null, pronouns text,
  background jsonb not null default '{}', traits jsonb not null default '{}', status jsonb not null default '{}', created_at timestamptz not null default now()
);
create table public.factions (
  id uuid primary key default gen_random_uuid(), campaign_id uuid not null references public.campaigns(id) on delete cascade,
  entity_id uuid not null unique references public.world_entities(id) on delete cascade, name text not null,
  public_profile jsonb not null default '{}', created_at timestamptz not null default now()
);
create table private.authoritative_entity_state (
  entity_id uuid primary key references public.world_entities(id) on delete cascade,
  exact_location_id uuid references public.locations(id) on delete set null, status jsonb not null default '{}',
  hidden_resources jsonb not null default '{}', private_goals jsonb not null default '{}', updated_at timestamptz not null default now()
);
create table private.world_events (
  id uuid primary key default gen_random_uuid(), campaign_id uuid not null references public.campaigns(id) on delete cascade,
  event_type text not null, occurred_at timestamptz not null default now(), payload jsonb not null, visibility_rule jsonb not null default '{}'
);
create table public.intel_reports (
  id uuid primary key default gen_random_uuid(), campaign_id uuid not null references public.campaigns(id) on delete cascade,
  viewer_id uuid not null references auth.users(id) on delete cascade, entity_id uuid references public.world_entities(id) on delete cascade,
  reported_location_id uuid references public.locations(id) on delete set null, source_type text not null,
  source_label text, confidence text not null check (confidence in ('unknown','low','medium','high','confirmed')),
  observed_at timestamptz not null, received_at timestamptz not null default now(), report_text text not null, payload jsonb not null default '{}'
);
create table public.player_knowledge (
  id uuid primary key default gen_random_uuid(), campaign_id uuid not null references public.campaigns(id) on delete cascade,
  viewer_id uuid not null references auth.users(id) on delete cascade, entity_id uuid not null references public.world_entities(id) on delete cascade,
  known_status jsonb not null default '{}', believed_location_id uuid references public.locations(id) on delete set null,
  location_precision text not null default 'unknown' check (location_precision in ('exact','settlement','region','realm','unknown')),
  confidence text not null default 'unknown' check (confidence in ('unknown','low','medium','high','confirmed')),
  last_confirmed_at timestamptz, source_summary text, resource_estimates jsonb not null default '{}', updated_at timestamptz not null default now(),
  unique(campaign_id,viewer_id,entity_id)
);
create table public.campaign_turns (
  id uuid primary key default gen_random_uuid(), campaign_id uuid not null references public.campaigns(id) on delete cascade,
  idempotency_key uuid not null, player_text text not null, structured_intent jsonb not null,
  narration text not null, suggestions jsonb not null default '[]', state_changes jsonb not null default '{}',
  usage_units integer not null default 1 check (usage_units >= 0), created_at timestamptz not null default now(), unique(campaign_id,idempotency_key)
);
create table public.credit_ledger (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  amount integer not null check (amount <> 0), reason text not null, reference_id uuid, created_at timestamptz not null default now()
);

create or replace function private.is_campaign_member(target uuid) returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.campaign_members where campaign_id=target and user_id=auth.uid())
$$;
create or replace function private.handle_new_user() returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.profiles(id,username,display_name)
  values(new.id, lower(coalesce(new.raw_user_meta_data->>'username', split_part(new.email,'@',1))), coalesce(new.raw_user_meta_data->>'display_name', new.raw_user_meta_data->>'username', 'Player'));
  insert into public.credit_ledger(user_id,amount,reason) values(new.id,20,'welcome_grant');
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure private.handle_new_user();
create or replace function private.add_campaign_owner() returns trigger language plpgsql security definer set search_path='' as $$
begin insert into public.campaign_members(campaign_id,user_id,role) values(new.id,new.owner_id,'owner'); return new; end $$;
create trigger on_campaign_created after insert on public.campaigns for each row execute procedure private.add_campaign_owner();

alter table public.profiles enable row level security;
alter table public.world_packs enable row level security; alter table public.world_pack_versions enable row level security;
alter table public.campaigns enable row level security; alter table public.campaign_members enable row level security;
alter table public.locations enable row level security; alter table public.world_entities enable row level security;
alter table public.characters enable row level security; alter table public.factions enable row level security;
alter table public.intel_reports enable row level security; alter table public.player_knowledge enable row level security;
alter table public.campaign_turns enable row level security; alter table public.credit_ledger enable row level security;

create policy profiles_self_select on public.profiles for select to authenticated using(id=auth.uid());
create policy profiles_self_update on public.profiles for update to authenticated using(id=auth.uid()) with check(id=auth.uid());
create policy packs_select on public.world_packs for select to authenticated using(is_system or owner_id=auth.uid());
create policy packs_owner_all on public.world_packs for all to authenticated using(owner_id=auth.uid()) with check(owner_id=auth.uid());
create policy pack_versions_select on public.world_pack_versions for select to authenticated using(exists(select 1 from public.world_packs p where p.id=pack_id and (p.is_system or p.owner_id=auth.uid())));
create policy pack_versions_owner_write on public.world_pack_versions for all to authenticated using(exists(select 1 from public.world_packs p where p.id=pack_id and p.owner_id=auth.uid())) with check(exists(select 1 from public.world_packs p where p.id=pack_id and p.owner_id=auth.uid()));
create policy campaigns_member_select on public.campaigns for select to authenticated using(private.is_campaign_member(id));
create policy campaigns_owner_insert on public.campaigns for insert to authenticated with check(owner_id=auth.uid());
create policy campaigns_owner_update on public.campaigns for update to authenticated using(owner_id=auth.uid()) with check(owner_id=auth.uid());
create policy members_select on public.campaign_members for select to authenticated using(private.is_campaign_member(campaign_id));
create policy locations_member_select on public.locations for select to authenticated using(private.is_campaign_member(campaign_id));
create policy entities_member_select on public.world_entities for select to authenticated using(private.is_campaign_member(campaign_id));
create policy characters_member_select on public.characters for select to authenticated using(private.is_campaign_member(campaign_id));
create policy factions_member_select on public.factions for select to authenticated using(private.is_campaign_member(campaign_id));
create policy intel_own_select on public.intel_reports for select to authenticated using(viewer_id=auth.uid() and private.is_campaign_member(campaign_id));
create policy knowledge_own_select on public.player_knowledge for select to authenticated using(viewer_id=auth.uid() and private.is_campaign_member(campaign_id));
create policy turns_member_select on public.campaign_turns for select to authenticated using(private.is_campaign_member(campaign_id));
create policy ledger_self_select on public.credit_ledger for select to authenticated using(user_id=auth.uid());

revoke all on all tables in schema public from anon;
grant select,update on public.profiles to authenticated;
grant select,insert,update,delete on public.world_packs,public.world_pack_versions to authenticated;
grant select,insert,update on public.campaigns to authenticated;
grant select on public.campaign_members,public.locations,public.world_entities,public.characters,public.factions,public.intel_reports,public.player_knowledge,public.campaign_turns,public.credit_ledger to authenticated;
grant usage on schema private to authenticated;
grant execute on function private.is_campaign_member(uuid) to authenticated;
