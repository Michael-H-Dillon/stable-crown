create table if not exists public.campaign_canon_events (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  event_key text not null,
  name text not null,
  description text not null,
  canonical_timing text not null,
  sequence_index integer not null default 0,
  participants text[] not null default '{}',
  preconditions jsonb not null default '[]'::jsonb,
  expected_outcomes jsonb not null default '[]'::jsonb,
  prevention_conditions jsonb not null default '[]'::jsonb,
  knowledge_after jsonb not null default '[]'::jsonb,
  status text not null default 'pending' check(status in ('pending','due','completed','altered','prevented')),
  resolution_reason text,
  source_basis text not null,
  source_confidence text not null check(source_confidence in ('high','medium','low')),
  resolved_turn_id uuid references public.campaign_turns(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(campaign_id,event_key)
);

create index if not exists campaign_canon_events_pending_idx
  on public.campaign_canon_events(campaign_id,status,sequence_index);

create table if not exists public.engine_hidden_campaign_facts (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  source_turn_id uuid references public.campaign_turns(id) on delete set null,
  canon_event_id uuid references public.campaign_canon_events(id) on delete set null,
  fact_key text not null,
  fact text not null,
  known_by text[] not null default '{}',
  status text not null default 'active' check(status in ('active','superseded','retracted')),
  reason text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(campaign_id,fact_key)
);

create index if not exists engine_hidden_campaign_facts_active_idx
  on public.engine_hidden_campaign_facts(campaign_id,status,updated_at desc);

alter table public.campaign_canon_events enable row level security;
alter table public.engine_hidden_campaign_facts enable row level security;
revoke all on public.campaign_canon_events,public.engine_hidden_campaign_facts from public,anon,authenticated;
grant all on public.campaign_canon_events,public.engine_hidden_campaign_facts to service_role;

alter table public.campaign_memories add column if not exists retracted_at timestamptz;
alter table public.campaign_memories add column if not exists retraction_reason text;
