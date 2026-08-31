alter table public.resource_accounts add column if not exists debt numeric(18,2) not null default 0 check(debt >= 0);
