-- Completion markers carry no balance change. All actual credit movements remain nonzero.
alter table public.credit_ledger drop constraint credit_ledger_amount_check;
alter table public.credit_ledger add constraint credit_ledger_amount_check
  check (amount <> 0 or reason = 'ai_world_generation_completed');
