alter table public.campaign_world_ticks
  add column status text not null default 'completed' check (status in ('queued','running','completed','failed')),
  add column applied_turn_id uuid references public.campaign_turns(id) on delete set null,
  add column applied_at timestamptz,
  add column started_at timestamptz,
  add column finished_at timestamptz,
  add column error_message text;
-- Old ticks were already applied synchronously with their triggering turn.
update public.campaign_world_ticks set applied_turn_id=turn_id, applied_at=created_at, finished_at=created_at;
create index campaign_world_ticks_unapplied_idx on public.campaign_world_ticks(campaign_id,tick_number)
  where status='completed' and applied_at is null;
