create table public.turn_response_feedback (
  id uuid primary key default gen_random_uuid(),
  turn_id uuid not null references public.campaign_turns(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  rating text not null check(rating in ('helpful','unhelpful')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_id, turn_id)
);

alter table public.turn_response_feedback enable row level security;
create policy turn_response_feedback_owner_select on public.turn_response_feedback
  for select to authenticated using(owner_id = auth.uid());
create policy turn_response_feedback_owner_insert on public.turn_response_feedback
  for insert to authenticated with check(owner_id = auth.uid() and private.is_campaign_member(campaign_id));
create policy turn_response_feedback_owner_update on public.turn_response_feedback
  for update to authenticated using(owner_id = auth.uid()) with check(owner_id = auth.uid());
grant select, insert, update on public.turn_response_feedback to authenticated;

