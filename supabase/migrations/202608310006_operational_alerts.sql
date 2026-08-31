create table if not exists public.operational_alerts (
  id uuid primary key default gen_random_uuid(),
  alert_type text not null,
  severity text not null default 'warning' check(severity in ('info','warning','critical')),
  user_id uuid references auth.users(id) on delete set null,
  reference_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  acknowledged_at timestamptz
);
alter table public.operational_alerts enable row level security;
-- Operational alerts are intentionally service-role only. View them in Supabase.
