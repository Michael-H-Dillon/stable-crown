alter table public.campaigns add column setup_preferences jsonb not null default '{}'::jsonb;
alter table public.resource_accounts add column income_period text not null default 'month';
alter table public.resource_accounts add column source_summary text;

create or replace function public.reserve_campaign_preparation_credits(p_user uuid,p_amount integer,p_reference uuid)
returns integer language plpgsql security definer set search_path='' as $$
declare v_balance integer;
begin
  if auth.role()<>'service_role' then raise exception 'Not authorized.'; end if;
  if p_amount<0 then raise exception 'Invalid Crown charge.'; end if;
  if exists(select 1 from public.credit_ledger where user_id=p_user and reason='campaign_preparation' and reference_id=p_reference) then
    raise exception 'This AI preparation quote has already been used. Request a new quote.';
  end if;
  update public.profiles set credits_balance=credits_balance-p_amount
    where id=p_user and credits_balance>=p_amount returning credits_balance into v_balance;
  if v_balance is null then raise exception 'You do not have enough Crowns for AI campaign preparation.'; end if;
  insert into public.credit_ledger(user_id,amount,reason,reference_id) values(p_user,-p_amount,'campaign_preparation',p_reference);
  return v_balance;
end $$;

create or replace function public.refund_campaign_preparation_credits(p_user uuid,p_amount integer,p_reference uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  if auth.role()<>'service_role' then raise exception 'Not authorized.'; end if;
  if not exists(select 1 from public.credit_ledger where user_id=p_user and reason='campaign_preparation' and reference_id=p_reference) then return; end if;
  if exists(select 1 from public.credit_ledger where user_id=p_user and reason='campaign_preparation_refund' and reference_id=p_reference) then return; end if;
  update public.profiles set credits_balance=credits_balance+p_amount where id=p_user;
  insert into public.credit_ledger(user_id,amount,reason,reference_id) values(p_user,p_amount,'campaign_preparation_refund',p_reference);
end $$;

revoke all on function public.reserve_campaign_preparation_credits(uuid,integer,uuid) from public,anon,authenticated;
grant execute on function public.reserve_campaign_preparation_credits(uuid,integer,uuid) to service_role;
revoke all on function public.refund_campaign_preparation_credits(uuid,integer,uuid) from public,anon,authenticated;
grant execute on function public.refund_campaign_preparation_credits(uuid,integer,uuid) to service_role;
