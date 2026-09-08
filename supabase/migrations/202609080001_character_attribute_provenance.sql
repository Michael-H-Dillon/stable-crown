alter table public.characters
  add column if not exists canon_status text not null default 'unknown'
    check (canon_status in ('canonical','original','unknown')),
  add column if not exists attributes_individually_assessed boolean not null default false,
  add column if not exists attributes_assessed_at timestamptz,
  add column if not exists attributes_assessment_basis text,
  add column if not exists attributes_assessment_sources jsonb not null default '[]'::jsonb;

comment on column public.characters.canon_status is 'canonical characters may receive source lookup; original characters must never be looked up as canon.';
comment on column public.characters.attributes_individually_assessed is 'true only after a dedicated, date-specific attribute assessment.';

alter table public.ai_cost_ledger drop constraint if exists ai_cost_ledger_operation_check;
alter table public.ai_cost_ledger add constraint ai_cost_ledger_operation_check check(operation in
 ('turn','world_tick','narration','world_generation','ledger_audit','context_ingestion','character_lookup','create_campaign','character_relationships','character_attribute_assessment'));

update public.characters
set canon_status = case
  when traits->>'player' = 'true' and traits->>'identityMode' = 'existing' then 'canonical'
  when traits->>'player' = 'true' and traits->>'identityMode' = 'original' then 'original'
  when traits->>'researchedContext' = 'true' then 'canonical'
  else canon_status
end;
