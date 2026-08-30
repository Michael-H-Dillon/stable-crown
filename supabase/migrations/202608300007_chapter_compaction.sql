alter table public.campaign_turns
  add column chapter_number integer not null default 1 check(chapter_number > 0),
  add column compacted_at timestamptz;

create index campaign_turns_active_chapter_idx
  on public.campaign_turns(campaign_id, chapter_number, created_at)
  where compacted_at is null;

with numbered as (
  select id, ceil(row_number() over(partition by campaign_id order by created_at)::numeric / 10)::integer as chapter_number
  from public.campaign_turns
)
update public.campaign_turns turn
set chapter_number=numbered.chapter_number
from numbered
where numbered.id=turn.id;

update public.campaign_turns turn
set compacted_at=now()
from public.campaigns campaign
where turn.campaign_id=campaign.id
  and turn.chapter_number < campaign.current_chapter;
