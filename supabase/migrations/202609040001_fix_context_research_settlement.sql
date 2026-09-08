create or replace function public.settle_context_research_crowns(
  p_user uuid,
  p_job uuid,
  p_campaign uuid,
  p_context text,
  p_cost integer,
  p_hold integer default 10
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_balance integer;
  v_note uuid;
  v_existing_cost integer;
  v_release integer;
begin
  if not exists (
    select 1 from public.background_jobs
    where id = p_job and owner_id = p_user and job_type = 'context_research'
  ) then
    raise exception 'Research job not found.';
  end if;

  if not exists (
    select 1 from public.campaigns where id = p_campaign and owner_id = p_user
  ) then
    raise exception 'Campaign not found.';
  end if;

  select id, crowns_charged
    into v_note, v_existing_cost
    from public.campaign_context_notes
    where background_job_id = p_job;

  if v_note is not null then
    select credits_balance into v_balance from public.profiles where id = p_user;
    return jsonb_build_object('id', v_note, 'cost', v_existing_cost, 'creditsRemaining', v_balance);
  end if;

  if not exists (
    select 1 from public.credit_ledger
    where user_id = p_user and reference_id = p_job and reason = 'context_research_hold'
  ) then
    raise exception 'Research Crown hold not found.';
  end if;

  p_cost := greatest(1, least(p_hold, p_cost));
  v_release := p_hold - p_cost;

  update public.profiles
    set credits_balance = credits_balance + v_release
    where id = p_user
    returning credits_balance into v_balance;

  if v_release > 0 then
    insert into public.credit_ledger(user_id, amount, reason, reference_id)
    values (p_user, v_release, 'context_research_release', p_job);
  end if;

  insert into public.campaign_context_notes(
    campaign_id, owner_id, context_text, crowns_charged, background_job_id
  ) values (
    p_campaign, p_user, trim(p_context), p_cost, p_job
  ) returning id into v_note;

  return jsonb_build_object('id', v_note, 'cost', p_cost, 'creditsRemaining', v_balance);
end
$$;

revoke all on function public.settle_context_research_crowns(uuid,uuid,uuid,text,integer,integer)
  from public, anon, authenticated;
grant execute on function public.settle_context_research_crowns(uuid,uuid,uuid,text,integer,integer)
  to service_role;
