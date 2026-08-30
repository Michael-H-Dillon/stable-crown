create table public.campaign_relationships (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  entity_id uuid references public.world_entities(id) on delete set null,
  entity_name text not null,
  score integer not null default 0 check(score between -100 and 100),
  updated_at timestamptz not null default now(),
  unique(campaign_id, entity_name)
);

create table public.resource_accounts (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  name text not null,
  account_type text not null default 'treasury' check(account_type in ('treasury','purse','estate','army','other')),
  controller_name text not null,
  currency text not null default 'gold dragons',
  balance numeric(18,2) not null default 0,
  recurring_income numeric(18,2) not null default 0,
  recurring_outgoings numeric(18,2) not null default 0,
  morale integer check(morale between 0 and 100),
  status text not null default 'active' check(status in ('active','contested','lost','frozen')),
  updated_at timestamptz not null default now(),
  unique(campaign_id, name)
);

create table public.resource_transactions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  account_id uuid not null references public.resource_accounts(id) on delete cascade,
  turn_id uuid references public.campaign_turns(id) on delete set null,
  transaction_type text not null check(transaction_type in ('income','expense','transfer','adjustment','control')),
  amount numeric(18,2) not null,
  reason text not null check(char_length(reason) between 3 and 500),
  counterparty text,
  world_date text,
  created_at timestamptz not null default now()
);

alter table public.campaign_relationships enable row level security;
alter table public.resource_accounts enable row level security;
alter table public.resource_transactions enable row level security;

create policy campaign_relationships_member_select on public.campaign_relationships for select to authenticated using(private.is_campaign_member(campaign_id));
create policy resource_accounts_member_select on public.resource_accounts for select to authenticated using(private.is_campaign_member(campaign_id));
create policy resource_transactions_member_select on public.resource_transactions for select to authenticated using(private.is_campaign_member(campaign_id));

grant select on public.campaign_relationships, public.resource_accounts, public.resource_transactions to authenticated;

insert into public.campaign_relationships(campaign_id, entity_id, entity_name, score)
select e.campaign_id, e.id, e.canonical_name,
       greatest(-100, least(100, coalesce(sum(h.change), 0)::integer))
from public.world_entities e
left join public.relationship_history h on h.campaign_id=e.campaign_id and lower(h.entity_name)=lower(e.canonical_name)
where e.entity_type='character'
group by e.campaign_id, e.id, e.canonical_name
on conflict(campaign_id, entity_name) do nothing;

insert into public.resource_accounts(campaign_id, name, account_type, controller_name, currency, balance, recurring_income, recurring_outgoings)
select c.id, 'Personal Purse', 'purse', ch.name, 'gold',
       case when ch.background->>'id'='lord' then 2500 when ch.background->>'id'='knight' then 120 else 12 end,
       case when ch.background->>'id'='lord' then 250 when ch.background->>'id'='knight' then 20 else 2 end,
       case when ch.background->>'id'='lord' then 180 when ch.background->>'id'='knight' then 15 else 2 end
from public.campaigns c
join public.characters ch on ch.campaign_id=c.id and ch.traits->>'player'='true'
on conflict(campaign_id, name) do nothing;
