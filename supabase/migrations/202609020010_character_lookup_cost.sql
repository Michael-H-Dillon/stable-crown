alter table public.ai_cost_ledger drop constraint if exists ai_cost_ledger_operation_check;
alter table public.ai_cost_ledger add constraint ai_cost_ledger_operation_check
  check(operation in ('turn','world_tick','narration','world_generation','ledger_audit','context_ingestion','character_lookup'));
