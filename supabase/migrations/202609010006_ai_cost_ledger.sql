create table public.ai_cost_ledger (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  operation text not null check(operation in ('turn','world_tick','narration','world_generation')),
  model text not null,
  cost_usd numeric(12,6) not null check(cost_usd >= 0),
  reference_id uuid not null,
  campaign_id uuid references public.campaigns(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(operation, reference_id)
);

create index ai_cost_ledger_owner_created_idx
  on public.ai_cost_ledger(owner_id, created_at desc);
create index ai_cost_ledger_operation_created_idx
  on public.ai_cost_ledger(operation, created_at desc);

-- This is business telemetry, not player-facing account data. Edge functions
-- write it with the service role; no authenticated-user read policy is exposed.
alter table public.ai_cost_ledger enable row level security;
revoke all on public.ai_cost_ledger from public, anon, authenticated;
grant all on public.ai_cost_ledger to service_role;

