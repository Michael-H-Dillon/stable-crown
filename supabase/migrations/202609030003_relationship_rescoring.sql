-- Version the initial relationship assessment so campaigns can be repaired
-- lazily when they are next played, without rewriting unrelated campaigns.
alter table public.campaign_relationships
  add column if not exists initialization_version integer not null default 1;
