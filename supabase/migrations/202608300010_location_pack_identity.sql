-- Display names are not stable identifiers. Large worlds can legitimately contain
-- multiple places with the same name, while pack entry IDs remain unique.
alter table public.locations add column if not exists pack_location_id text;

update public.locations
set pack_location_id = 'legacy:' || id::text
where pack_location_id is null;

alter table public.locations alter column pack_location_id set not null;
alter table public.locations drop constraint if exists locations_campaign_id_name_key;
alter table public.locations
  add constraint locations_campaign_pack_location_id_key unique(campaign_id, pack_location_id);

