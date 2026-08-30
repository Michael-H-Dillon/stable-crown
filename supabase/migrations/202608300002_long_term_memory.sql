create table public.campaign_memories (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  source_turn_id uuid references public.campaign_turns(id) on delete set null,
  memory_type text not null check (memory_type in ('event','fact','promise','discovery','injury','possession')),
  fact text not null check (char_length(fact) between 3 and 1000),
  importance smallint not null default 5 check (importance between 1 and 10),
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  unique(campaign_id, fact)
);

create table public.plot_threads (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  opened_by_turn_id uuid references public.campaign_turns(id) on delete set null,
  resolved_by_turn_id uuid references public.campaign_turns(id) on delete set null,
  title text not null check (char_length(title) between 3 and 500),
  status text not null default 'open' check (status in ('open','resolved','abandoned')),
  importance smallint not null default 5 check (importance between 1 and 10),
  updated_at timestamptz not null default now(),
  unique(campaign_id, title)
);

create table public.relationship_history (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  turn_id uuid references public.campaign_turns(id) on delete set null,
  entity_id uuid references public.world_entities(id) on delete set null,
  entity_name text not null,
  change integer not null check (change between -20 and 20),
  reason text not null check (char_length(reason) between 3 and 500),
  created_at timestamptz not null default now()
);

create table public.chapter_summaries (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  chapter_number integer not null check (chapter_number > 0),
  through_turn integer not null check (through_turn >= 0),
  summary text not null check (char_length(summary) between 20 and 5000),
  unresolved_threads jsonb not null default '[]',
  created_at timestamptz not null default now(),
  unique(campaign_id, chapter_number)
);

alter table public.campaign_memories enable row level security;
alter table public.plot_threads enable row level security;
alter table public.relationship_history enable row level security;
alter table public.chapter_summaries enable row level security;

create policy campaign_memories_member_select on public.campaign_memories for select to authenticated using(private.is_campaign_member(campaign_id));
create policy plot_threads_member_select on public.plot_threads for select to authenticated using(private.is_campaign_member(campaign_id));
create policy relationship_history_member_select on public.relationship_history for select to authenticated using(private.is_campaign_member(campaign_id));
create policy chapter_summaries_member_select on public.chapter_summaries for select to authenticated using(private.is_campaign_member(campaign_id));
create policy campaigns_owner_delete on public.campaigns for delete to authenticated using(owner_id=auth.uid());

grant select on public.campaign_memories, public.plot_threads, public.relationship_history, public.chapter_summaries to authenticated;
grant delete on public.campaigns to authenticated;

insert into public.campaign_memories(campaign_id,memory_type,fact,importance,tags)
select c.campaign_id, 'event', memory.value, 6, array['backfilled']
from public.characters c
cross join lateral jsonb_array_elements_text(coalesce(c.status->'memories','[]'::jsonb)) as memory(value)
where c.traits->>'player' = 'true'
on conflict(campaign_id,fact) do nothing;

insert into public.plot_threads(campaign_id,title,status,importance)
select c.campaign_id, thread.value, 'open', 5
from public.characters c
cross join lateral jsonb_array_elements_text(coalesce(c.status->'unresolvedThreads','[]'::jsonb)) as thread(value)
where c.traits->>'player' = 'true'
on conflict(campaign_id,title) do nothing;
