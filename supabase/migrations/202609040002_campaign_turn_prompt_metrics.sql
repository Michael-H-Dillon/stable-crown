alter table public.campaign_turns
  add column if not exists prompt_metrics jsonb not null default '{}'::jsonb;

comment on column public.campaign_turns.prompt_metrics is
  'Non-secret prompt size and cache telemetry for diagnosing turn latency.';

notify pgrst, 'reload schema';
