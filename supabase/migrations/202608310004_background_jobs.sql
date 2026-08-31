create table if not exists public.background_jobs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  job_type text not null check (job_type in ('generate_world','create_campaign')),
  idempotency_key text not null,
  status text not null default 'queued' check (status in ('queued','running','completed','failed')),
  payload jsonb not null default '{}'::jsonb,
  result jsonb,
  error_message text,
  attempts integer not null default 0,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique(owner_id,idempotency_key)
);
alter table public.background_jobs enable row level security;
create policy background_jobs_self_select on public.background_jobs for select to authenticated using(owner_id=auth.uid());
grant select on public.background_jobs to authenticated;
create index if not exists background_jobs_owner_status_idx on public.background_jobs(owner_id,status,created_at desc);
alter table public.campaigns add column if not exists background_job_id uuid unique references public.background_jobs(id) on delete set null;
