alter table public.ai_cost_ledger
  add column if not exists input_tokens integer not null default 0 check(input_tokens >= 0),
  add column if not exists output_tokens integer not null default 0 check(output_tokens >= 0),
  add column if not exists web_search_count integer not null default 0 check(web_search_count >= 0);

create or replace function public.add_campaign_context(p_campaign_id uuid,p_context text,p_cost integer default 1)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_balance integer; v_note uuid;
begin
  if v_user is null then raise exception 'Sign in before adding campaign context.'; end if;
  if not exists(select 1 from public.campaigns where id=p_campaign_id and owner_id=v_user) then raise exception 'Campaign not found.'; end if;
  if char_length(trim(p_context)) not between 10 and 4000 then raise exception 'Context must contain between 10 and 4,000 characters.'; end if;
  p_cost:=greatest(1,least(10,p_cost));
  update public.profiles set credits_balance=credits_balance-p_cost where id=v_user and credits_balance>=p_cost returning credits_balance into v_balance;
  if v_balance is null then raise exception 'You do not have enough Crowns. This research costs % Crown(s).',p_cost; end if;
  insert into public.campaign_context_notes(campaign_id,owner_id,context_text,crowns_charged) values(p_campaign_id,v_user,trim(p_context),p_cost) returning id into v_note;
  insert into public.credit_ledger(user_id,amount,reason,reference_id) values(v_user,-p_cost,'campaign_context',v_note);
  return jsonb_build_object('id',v_note,'cost',p_cost,'creditsRemaining',v_balance);
end $$;
revoke all on function public.add_campaign_context(uuid,text,integer) from public,anon;
grant execute on function public.add_campaign_context(uuid,text,integer) to authenticated;
