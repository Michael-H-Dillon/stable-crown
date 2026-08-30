create table public.campaign_clock (
  campaign_id uuid primary key references public.campaigns(id) on delete cascade,
  calendar_name text not null,
  year_label text not null,
  day_number integer not null check(day_number > 0),
  segment text not null,
  updated_at timestamptz not null default now()
);

create table private.scheduled_campaign_events (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  event_key text not null,
  name text not null,
  description text not null,
  earliest_day integer not null check(earliest_day > 0),
  latest_day integer not null check(latest_day >= earliest_day),
  conditions jsonb not null default '[]',
  status text not null default 'pending' check(status in ('pending','triggered','prevented','altered')),
  resolution_reason text,
  updated_at timestamptz not null default now(),
  unique(campaign_id,event_key)
);

create table private.campaign_secrets (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  secret_key text not null,
  name text not null,
  description text not null,
  stakes jsonb not null default '[]',
  evidence_types jsonb not null default '[]',
  status text not null default 'hidden' check(status in ('hidden','rumoured','exposed','defused')),
  created_at timestamptz not null default now(),
  unique(campaign_id,secret_key)
);

create table private.entity_secret_awareness (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  secret_id uuid not null references private.campaign_secrets(id) on delete cascade,
  entity_id uuid references public.world_entities(id) on delete set null,
  entity_name text not null,
  awareness text not null default 'none' check(awareness in ('none','suspects','knows')),
  suspicion integer not null default 0 check(suspicion between 0 and 100),
  reasons jsonb not null default '[]',
  updated_at timestamptz not null default now(),
  unique(secret_id,entity_name)
);

create table private.secret_evidence (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  secret_id uuid not null references private.campaign_secrets(id) on delete cascade,
  discovered_by_entity_id uuid references public.world_entities(id) on delete set null,
  evidence_type text not null,
  description text not null,
  credibility integer not null default 50 check(credibility between 0 and 100),
  created_at timestamptz not null default now()
);

alter table public.campaign_clock enable row level security;
create policy campaign_clock_member_select on public.campaign_clock for select to authenticated using(private.is_campaign_member(campaign_id));
grant select on public.campaign_clock to authenticated;

revoke all on private.scheduled_campaign_events, private.campaign_secrets, private.entity_secret_awareness, private.secret_evidence from public, anon, authenticated;
