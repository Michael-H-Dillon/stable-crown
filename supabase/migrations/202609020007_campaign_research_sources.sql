create table if not exists public.campaign_research_sources (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  url text not null check (url ~ '^https?://'),
  source_title text not null,
  subject_kind text not null check (subject_kind in ('general','character','location','faction','event','fact')),
  subject_name text not null default '',
  last_job_id uuid references public.background_jobs(id) on delete set null,
  first_used_at timestamptz not null default now(),
  last_used_at timestamptz not null default now(),
  unique (campaign_id, url, subject_kind, subject_name)
);

create index if not exists campaign_research_sources_recent_idx
  on public.campaign_research_sources (campaign_id, last_used_at desc);

insert into public.campaign_research_sources (
  campaign_id,
  url,
  source_title,
  subject_kind,
  subject_name
)
select distinct
  character.campaign_id,
  source.url,
  regexp_replace(source.url, '^https?://(?:www\.)?([^/]+).*$','\1','i'),
  'character',
  character.name
from public.characters character
cross join lateral jsonb_array_elements_text(coalesce(character.traits->'sources','[]'::jsonb)) source(url)
where source.url ~ '^https?://'
on conflict (campaign_id, url, subject_kind, subject_name) do nothing;

alter table public.campaign_research_sources enable row level security;

drop policy if exists campaign_research_sources_select on public.campaign_research_sources;
create policy campaign_research_sources_select
  on public.campaign_research_sources
  for select
  to authenticated
  using (private.is_campaign_member(campaign_id));

revoke all on public.campaign_research_sources from anon, authenticated;
grant select on public.campaign_research_sources to authenticated;
grant all on public.campaign_research_sources to service_role;
