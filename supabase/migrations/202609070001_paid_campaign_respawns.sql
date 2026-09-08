create table if not exists public.campaign_respawns (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  restore_turn_id uuid references public.campaign_turns(id) on delete set null,
  restored_chapter integer not null,
  crowns_charged integer not null default 1 check (crowns_charged = 1),
  idempotency_key uuid not null,
  created_at timestamptz not null default now(),
  unique(owner_id, idempotency_key)
);

alter table public.campaign_respawns enable row level security;
create policy campaign_respawns_owner_select on public.campaign_respawns
  for select to authenticated using (owner_id = auth.uid());
grant select on public.campaign_respawns to authenticated;

create or replace function public.respawn_campaign(
  p_campaign_id uuid,
  p_restore_turn_id uuid,
  p_idempotency_key uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_campaign public.campaigns%rowtype;
  v_target public.campaign_turns%rowtype;
  v_player public.characters%rowtype;
  v_existing public.campaign_respawns%rowtype;
  v_later_ids uuid[];
  v_next_state jsonb;
  v_balance integer;
  v_title text;
begin
  if v_user is null then raise exception 'Sign in before respawning.'; end if;

  select * into v_existing from public.campaign_respawns
    where owner_id = v_user and idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object('campaignId', v_existing.campaign_id, 'cost', v_existing.crowns_charged,
      'creditsRemaining', (select credits_balance from public.profiles where id = v_user));
  end if;

  select * into v_campaign from public.campaigns where id = p_campaign_id and owner_id = v_user for update;
  if not found then raise exception 'Campaign not found.'; end if;
  select * into v_player from public.characters
    where campaign_id = p_campaign_id and traits->>'player' = 'true' for update;
  if not found or coalesce(v_player.status->>'condition','alive') <> 'dead' then
    raise exception 'Respawning is available only after the player character dies.';
  end if;
  select * into v_target from public.campaign_turns
    where id = p_restore_turn_id and campaign_id = p_campaign_id;
  if not found then raise exception 'Restore point not found.'; end if;
  v_next_state := v_target.state_changes->'nextState';
  if coalesce(v_next_state->>'condition','alive') = 'dead' or coalesce((v_next_state->>'health')::integer, 0) <= 0 then
    raise exception 'Choose a restore point where the character was alive.';
  end if;

  update public.profiles set credits_balance = credits_balance - 1
    where id = v_user and credits_balance >= 1 returning credits_balance into v_balance;
  if v_balance is null then raise exception 'You need 1 Crown to respawn.'; end if;

  select coalesce(array_agg(id), '{}') into v_later_ids from public.campaign_turns
    where campaign_id = p_campaign_id and created_at > v_target.created_at;

  if cardinality(v_later_ids) > 0 then
    update public.campaign_relationships r set score = greatest(-100, least(100,
      r.score - coalesce((select sum(h.change) from public.relationship_history h
        where h.campaign_id = p_campaign_id and h.entity_id = r.entity_id and h.turn_id = any(v_later_ids)), 0)::integer)), updated_at = now()
      where r.campaign_id = p_campaign_id;
    update public.resource_accounts a set balance = a.balance - coalesce((select sum(t.amount)
      from public.resource_transactions t where t.account_id = a.id and t.turn_id = any(v_later_ids)), 0), updated_at = now()
      where a.campaign_id = p_campaign_id;
    delete from public.campaign_memories where campaign_id = p_campaign_id and source_turn_id = any(v_later_ids);
    delete from public.relationship_history where campaign_id = p_campaign_id and turn_id = any(v_later_ids);
    delete from public.resource_transactions where campaign_id = p_campaign_id and turn_id = any(v_later_ids);
    delete from public.engine_hidden_campaign_facts where campaign_id = p_campaign_id and source_turn_id = any(v_later_ids);
    update public.campaign_canon_events set status = 'pending', resolution_reason = null, resolved_turn_id = null, updated_at = now()
      where campaign_id = p_campaign_id and resolved_turn_id = any(v_later_ids);
    delete from public.campaign_character_titles where campaign_id = p_campaign_id and source_turn_id = any(v_later_ids);
    delete from public.plot_threads where campaign_id = p_campaign_id and opened_by_turn_id = any(v_later_ids);
    update public.plot_threads set status = 'open', resolved_by_turn_id = null, updated_at = now()
      where campaign_id = p_campaign_id and resolved_by_turn_id = any(v_later_ids);
    delete from public.chapter_summaries where campaign_id = p_campaign_id and chapter_number > v_target.chapter_number;
    delete from public.campaign_turns where id = any(v_later_ids);
  end if;

  update public.characters set status = v_next_state where id = v_player.id;
  if v_next_state->'campaignDate' is not null then
    update public.campaign_clock set
      year_label = coalesce(v_next_state #>> '{campaignDate,year}', year_label),
      day_number = coalesce((v_next_state #>> '{campaignDate,day}')::integer, day_number),
      segment = coalesce(v_next_state #>> '{campaignDate,segment}', segment), updated_at = now()
      where campaign_id = p_campaign_id;
  end if;
  v_title := coalesce(v_target.state_changes->>'chapterTitle', case when v_target.chapter_number = 1 then 'Chapter 1' else 'Chapter ' || v_target.chapter_number end);
  update public.campaigns set current_chapter = v_target.chapter_number, current_chapter_title = v_title,
    status = 'active', updated_at = now() where id = p_campaign_id;
  insert into public.campaign_respawns(campaign_id, owner_id, restore_turn_id, restored_chapter, idempotency_key)
    values(p_campaign_id, v_user, p_restore_turn_id, v_target.chapter_number, p_idempotency_key);
  insert into public.credit_ledger(user_id, amount, reason, reference_id)
    values(v_user, -1, 'campaign_respawn', p_idempotency_key);
  return jsonb_build_object('campaignId', p_campaign_id, 'cost', 1, 'creditsRemaining', v_balance);
end $$;

revoke all on function public.respawn_campaign(uuid,uuid,uuid) from public, anon;
grant execute on function public.respawn_campaign(uuid,uuid,uuid) to authenticated;
