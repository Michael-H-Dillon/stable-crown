alter table public.background_jobs drop constraint if exists background_jobs_status_check;
alter table public.background_jobs add constraint background_jobs_status_check check (status in ('queued','running','stalled','completed','failed'));
alter table public.background_jobs
  add column if not exists last_activity_at timestamptz not null default now(),
  add column if not exists stage_started_at timestamptz,
  add column if not exists stage_timings jsonb not null default '{}'::jsonb,
  add column if not exists checkpoint jsonb not null default '{}'::jsonb,
  add column if not exists model_used text,
  add column if not exists input_tokens bigint not null default 0,
  add column if not exists output_tokens bigint not null default 0,
  add column if not exists web_search_count integer not null default 0,
  add column if not exists api_cost_usd numeric(12,6) not null default 0,
  add column if not exists max_api_cost_usd numeric(12,6) not null default 0.90;

alter table public.profiles
  add column if not exists world_job_email_notifications boolean not null default false,
  add column if not exists world_job_push_notifications boolean not null default false;

create table if not exists public.push_notification_devices (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
  expo_push_token text not null, platform text not null, enabled boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(owner_id,expo_push_token)
);
alter table public.push_notification_devices enable row level security;
create policy push_devices_self_all on public.push_notification_devices for all to authenticated using(owner_id=auth.uid()) with check(owner_id=auth.uid());
grant select,insert,update,delete on public.push_notification_devices to authenticated;

create table if not exists public.world_generation_analytics (
  id uuid primary key default gen_random_uuid(), owner_id uuid references auth.users(id) on delete set null,
  generation_job_id uuid, pack_version_id uuid references public.world_pack_versions(id) on delete set null,
  ai_cost_usd numeric(12,6) not null default 0, crowns_charged integer not null default 0,
  generated_at timestamptz not null default now(), first_campaign_at timestamptz,
  campaigns_created integer not null default 0, gameplay_turns integer not null default 0,
  gameplay_crowns_spent integer not null default 0, last_played_at timestamptz
);
alter table public.world_generation_analytics enable row level security;
create index if not exists world_generation_analytics_pack_idx on public.world_generation_analytics(pack_version_id);

create or replace function public.attribute_generated_world_campaign() returns trigger language plpgsql security definer set search_path=public as $$
begin
  update public.world_generation_analytics set campaigns_created=campaigns_created+1, first_campaign_at=coalesce(first_campaign_at,now()) where pack_version_id=new.pack_version_id;
  return new;
end; $$;
drop trigger if exists attribute_generated_world_campaign on public.campaigns;
create trigger attribute_generated_world_campaign after insert on public.campaigns for each row execute function public.attribute_generated_world_campaign();

create or replace function public.attribute_generated_world_turn() returns trigger language plpgsql security definer set search_path=public as $$
begin
  update public.world_generation_analytics a set gameplay_turns=a.gameplay_turns+1, gameplay_crowns_spent=a.gameplay_crowns_spent+greatest(0,new.usage_units), last_played_at=now()
  from public.campaigns c where c.id=new.campaign_id and a.pack_version_id=c.pack_version_id;
  return new;
end; $$;
drop trigger if exists attribute_generated_world_turn on public.campaign_turns;
create trigger attribute_generated_world_turn after insert on public.campaign_turns for each row execute function public.attribute_generated_world_turn();

create or replace function public.purge_expired_background_jobs() returns integer language plpgsql security definer set search_path=public as $$
declare deleted_count integer;
begin
  delete from public.background_jobs where status in ('completed','failed') and completed_at < now() - interval '7 days';
  get diagnostics deleted_count = row_count;
  return deleted_count;
end; $$;
revoke all on function public.purge_expired_background_jobs() from public, anon, authenticated;

do $$ begin
  if exists(select 1 from pg_extension where extname='pg_cron') then
    perform cron.schedule('purge-expired-background-jobs','17 3 * * *','select public.purge_expired_background_jobs()');
  end if;
exception when others then null;
end $$;
