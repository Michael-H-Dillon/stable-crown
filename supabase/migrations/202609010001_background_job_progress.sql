alter table public.background_jobs
  add column if not exists progress_stage text not null default 'queued',
  add column if not exists progress_percent integer not null default 0 check (progress_percent between 0 and 100),
  add column if not exists progress_message text;

comment on column public.background_jobs.progress_stage is 'Stable machine-readable stage shown to the owner.';
comment on column public.background_jobs.progress_percent is 'Best-effort progress indicator; never used for billing.';
comment on column public.background_jobs.progress_message is 'Safe user-facing detail with no hidden prompts or chain of thought.';
