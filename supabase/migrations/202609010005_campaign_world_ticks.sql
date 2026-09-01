create table public.campaign_world_ticks (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  turn_id uuid not null unique references public.campaign_turns(id) on delete cascade,
  tick_number integer not null check(tick_number > 0),
  from_day integer,
  through_day integer,
  model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  api_cost_usd numeric(10,6) not null default 0,
  result jsonb not null,
  created_at timestamptz not null default now(),
  unique(campaign_id,tick_number)
);
alter table public.campaign_world_ticks enable row level security;
create policy campaign_world_ticks_member_select on public.campaign_world_ticks for select to authenticated using(private.is_campaign_member(campaign_id));
grant select on public.campaign_world_ticks to authenticated;

alter table public.campaign_turns
  add column model_used text,
  add column input_tokens integer not null default 0,
  add column output_tokens integer not null default 0,
  add column api_cost_usd numeric(10,6) not null default 0,
  add column world_tick_cost_usd numeric(10,6) not null default 0;
