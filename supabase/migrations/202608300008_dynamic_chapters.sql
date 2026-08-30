alter table public.campaigns
  add column current_chapter_title text not null default 'Chapter I';

alter table public.chapter_summaries
  add column title text,
  add column transition_reason text;

-- Undo the earlier mechanical ten-turn grouping. Future boundaries are narrative.
update public.campaign_turns set chapter_number=1, compacted_at=null;
update public.campaigns set current_chapter=1, current_chapter_title='Chapter I';
delete from public.chapter_summaries;
