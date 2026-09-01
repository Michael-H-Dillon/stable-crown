-- Reserve world-generation Crowns before expensive asynchronous work begins.
create or replace function public.reserve_world_generation_crowns(p_user uuid, p_job uuid, p_amount integer)
returns integer language plpgsql security definer set search_path=public as $$
declare v_balance integer;
begin
  if p_amount <= 0 then raise exception 'Reservation amount must be positive.'; end if;
  if exists(select 1 from credit_ledger where user_id=p_user and reference_id=p_job and reason in ('ai_world_generation_hold','ai_world_generation')) then
    return (select credits_balance from profiles where id=p_user);
  end if;
  update profiles set credits_balance=credits_balance-p_amount where id=p_user and credits_balance>=p_amount returning credits_balance into v_balance;
  if v_balance is null then raise exception 'You need % available Crowns to create this world.',p_amount; end if;
  insert into credit_ledger(user_id,amount,reason,reference_id) values(p_user,-p_amount,'ai_world_generation_hold',p_job);
  return v_balance;
end $$;

create or replace function public.release_world_import_from_hold(p_user uuid, p_job uuid, p_amount integer)
returns integer language plpgsql security definer set search_path=public as $$
declare v_balance integer;
begin
  if not exists(select 1 from credit_ledger where user_id=p_user and reference_id=p_job and reason='ai_world_generation_hold') then raise exception 'World-generation reservation was not found.'; end if;
  if not exists(select 1 from credit_ledger where user_id=p_user and reference_id=p_job and reason='ai_world_generation_import_release') then
    update profiles set credits_balance=credits_balance+p_amount where id=p_user returning credits_balance into v_balance;
    insert into credit_ledger(user_id,amount,reason,reference_id) values(p_user,p_amount,'ai_world_generation_import_release',p_job);
  else select credits_balance into v_balance from profiles where id=p_user;
  end if;
  return v_balance;
end $$;

create or replace function public.finalize_world_generation_crowns(p_user uuid, p_job uuid, p_version uuid)
returns integer language plpgsql security definer set search_path=public as $$
declare v_balance integer;
begin
  update credit_ledger set reason='ai_world_generation' where user_id=p_user and reference_id=p_job and reason='ai_world_generation_hold';
  if not exists(select 1 from credit_ledger where user_id=p_user and reference_id=p_version and reason='ai_world_generation_completed') then
    insert into credit_ledger(user_id,amount,reason,reference_id) values(p_user,0,'ai_world_generation_completed',p_version);
  end if;
  select credits_balance into v_balance from profiles where id=p_user;
  return v_balance;
end $$;

create or replace function public.refund_world_generation_crowns(p_user uuid, p_job uuid, p_amount integer)
returns integer language plpgsql security definer set search_path=public as $$
declare v_balance integer; v_release integer;
begin
  if not exists(select 1 from credit_ledger where user_id=p_user and reference_id=p_job and reason='ai_world_generation_hold')
     or exists(select 1 from credit_ledger where user_id=p_user and reference_id=p_job and reason='ai_world_generation_refund') then
    return (select credits_balance from profiles where id=p_user);
  end if;
  select coalesce(sum(amount),0)::integer into v_release from credit_ledger where user_id=p_user and reference_id=p_job and reason='ai_world_generation_import_release';
  update profiles set credits_balance=credits_balance+greatest(0,p_amount-v_release) where id=p_user returning credits_balance into v_balance;
  insert into credit_ledger(user_id,amount,reason,reference_id) values(p_user,greatest(0,p_amount-v_release),'ai_world_generation_refund',p_job);
  return v_balance;
end $$;

revoke all on function public.reserve_world_generation_crowns(uuid,uuid,integer), public.release_world_import_from_hold(uuid,uuid,integer), public.finalize_world_generation_crowns(uuid,uuid,uuid), public.refund_world_generation_crowns(uuid,uuid,integer) from public, anon, authenticated;
grant execute on function public.reserve_world_generation_crowns(uuid,uuid,integer), public.release_world_import_from_hold(uuid,uuid,integer), public.finalize_world_generation_crowns(uuid,uuid,uuid), public.refund_world_generation_crowns(uuid,uuid,integer) to service_role;
