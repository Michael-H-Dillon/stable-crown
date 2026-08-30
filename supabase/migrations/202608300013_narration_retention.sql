alter table public.turn_narrations
  add column if not exists expires_at timestamptz;

update public.turn_narrations
set expires_at = created_at + interval '7 days'
where expires_at is null;

alter table public.turn_narrations
  alter column expires_at set default (now() + interval '7 days'),
  alter column expires_at set not null;

create index if not exists turn_narrations_expiry_idx
  on public.turn_narrations(expires_at)
  where status = 'ready';

