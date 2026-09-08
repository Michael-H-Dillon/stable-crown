alter table public.campaign_character_connections add column sentiment_score integer
  check (sentiment_score between -100 and 100);
alter table public.campaign_relationships add column initialization_checked_at timestamptz;
alter table public.ai_cost_ledger drop constraint ai_cost_ledger_operation_check;
alter table public.ai_cost_ledger add constraint ai_cost_ledger_operation_check check(operation in
 ('turn','world_tick','narration','world_generation','ledger_audit','context_ingestion','character_lookup','create_campaign','character_relationships'));
