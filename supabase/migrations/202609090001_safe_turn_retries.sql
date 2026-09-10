alter table public.campaign_turns
  add column if not exists retry_checkpointed boolean not null default false;

create table public.campaign_turn_checkpoints (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  idempotency_key uuid not null,
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  unique(campaign_id, idempotency_key)
);

create table public.campaign_turn_retries (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  original_turn_id uuid,
  player_text text not null,
  idempotency_key uuid not null,
  created_at timestamptz not null default now(),
  unique(owner_id, idempotency_key)
);

alter table public.campaign_turn_checkpoints enable row level security;
alter table public.campaign_turn_retries enable row level security;
create policy campaign_turn_retries_owner_select on public.campaign_turn_retries
  for select to authenticated using (owner_id = auth.uid());
grant select on public.campaign_turn_retries to authenticated;

create or replace function public.capture_campaign_turn_checkpoint(
  p_campaign_id uuid,
  p_idempotency_key uuid
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists(select 1 from public.campaigns where id = p_campaign_id) then
    raise exception 'Campaign not found.';
  end if;

  insert into public.campaign_turn_checkpoints(campaign_id,idempotency_key,snapshot)
  values(p_campaign_id,p_idempotency_key,jsonb_build_object(
    'campaign',(select to_jsonb(c) from public.campaigns c where c.id=p_campaign_id),
    'turnCompaction',(select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'compacted_at',t.compacted_at)),'[]'::jsonb) from public.campaign_turns t where t.campaign_id=p_campaign_id),
    'worldEntities',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.world_entities x where x.campaign_id=p_campaign_id),
    'characters',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.characters x where x.campaign_id=p_campaign_id),
    'truth',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.engine_authoritative_entity_state x join public.world_entities e on e.id=x.entity_id where e.campaign_id=p_campaign_id),
    'knowledge',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.player_knowledge x where x.campaign_id=p_campaign_id),
    'memories',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.campaign_memories x where x.campaign_id=p_campaign_id),
    'threads',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.plot_threads x where x.campaign_id=p_campaign_id),
    'relationshipHistory',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.relationship_history x where x.campaign_id=p_campaign_id),
    'relationships',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.campaign_relationships x where x.campaign_id=p_campaign_id),
    'relationshipRoles',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.campaign_relationship_roles x where x.campaign_id=p_campaign_id),
    'relationshipRoleHistory',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.campaign_relationship_role_history x where x.campaign_id=p_campaign_id),
    'connections',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.campaign_character_connections x where x.campaign_id=p_campaign_id),
    'traitHistory',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.character_trait_history x where x.campaign_id=p_campaign_id),
    'clock',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.campaign_clock x where x.campaign_id=p_campaign_id),
    'resourceAccounts',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.resource_accounts x where x.campaign_id=p_campaign_id),
    'resourceTransactions',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.resource_transactions x where x.campaign_id=p_campaign_id),
    'secretAwareness',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.engine_entity_secret_awareness x where x.campaign_id=p_campaign_id),
    'secretEvidence',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.engine_secret_evidence x where x.campaign_id=p_campaign_id),
    'scheduledEvents',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.engine_scheduled_campaign_events x where x.campaign_id=p_campaign_id),
    'chapterSummaries',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.chapter_summaries x where x.campaign_id=p_campaign_id),
    'canonEvents',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.campaign_canon_events x where x.campaign_id=p_campaign_id),
    'hiddenFacts',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.engine_hidden_campaign_facts x where x.campaign_id=p_campaign_id),
    'titles',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.campaign_character_titles x where x.campaign_id=p_campaign_id),
    'worldTicks',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.campaign_world_ticks x where x.campaign_id=p_campaign_id)
  )) on conflict(campaign_id,idempotency_key) do nothing;
end $$;

revoke all on function public.capture_campaign_turn_checkpoint(uuid,uuid) from public, anon, authenticated;
grant execute on function public.capture_campaign_turn_checkpoint(uuid,uuid) to service_role;

create or replace function public.retry_campaign_turn(
  p_campaign_id uuid,
  p_turn_id uuid,
  p_idempotency_key uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_turn public.campaign_turns%rowtype;
  v_checkpoint public.campaign_turn_checkpoints%rowtype;
  v_snapshot jsonb;
  v_campaign jsonb;
  v_existing public.campaign_turn_retries%rowtype;
  v_cost integer;
  v_removed_turn_ids uuid[];
  v_removed_checkpoint_keys uuid[];
begin
  if v_user is null then raise exception 'Sign in before retrying a turn.'; end if;
  select * into v_existing from public.campaign_turn_retries where owner_id=v_user and idempotency_key=p_idempotency_key;
  if found then return jsonb_build_object('campaignId',v_existing.campaign_id,'playerText',v_existing.player_text); end if;
  if not exists(select 1 from public.campaigns where id=p_campaign_id and owner_id=v_user for update) then
    raise exception 'Campaign not found.';
  end if;
  select * into v_turn from public.campaign_turns where id=p_turn_id and campaign_id=p_campaign_id;
  if not found then raise exception 'Turn not found.'; end if;
  select * into v_checkpoint from public.campaign_turn_checkpoints
    where campaign_id=p_campaign_id and idempotency_key=v_turn.idempotency_key;
  if not found then raise exception 'This turn predates safe retry checkpoints and cannot be retried.'; end if;
  v_cost := greatest(1,ceil(length(trim(v_turn.player_text))::numeric/500)::integer);
  if coalesce((select credits_balance from public.profiles where id=v_user),0)<v_cost then
    raise exception 'You need % Crowns to retry this turn.',v_cost;
  end if;
  select coalesce(array_agg(id),'{}'),coalesce(array_agg(idempotency_key),'{}')
    into v_removed_turn_ids,v_removed_checkpoint_keys from public.campaign_turns
    where campaign_id=p_campaign_id and created_at>=v_turn.created_at;
  v_snapshot:=v_checkpoint.snapshot; v_campaign:=v_snapshot->'campaign';

  delete from public.resource_transactions where campaign_id=p_campaign_id;
  delete from public.character_trait_history where campaign_id=p_campaign_id;
  delete from public.campaign_relationship_role_history where campaign_id=p_campaign_id;
  delete from public.relationship_history where campaign_id=p_campaign_id;
  delete from public.campaign_character_connections where campaign_id=p_campaign_id;
  delete from public.campaign_relationship_roles where campaign_id=p_campaign_id;
  delete from public.campaign_relationships where campaign_id=p_campaign_id;
  delete from public.player_knowledge where campaign_id=p_campaign_id;
  delete from public.campaign_memories where campaign_id=p_campaign_id;
  delete from public.plot_threads where campaign_id=p_campaign_id;
  delete from public.engine_entity_secret_awareness where campaign_id=p_campaign_id;
  delete from public.engine_secret_evidence where campaign_id=p_campaign_id;
  delete from public.engine_scheduled_campaign_events where campaign_id=p_campaign_id;
  delete from public.engine_hidden_campaign_facts where campaign_id=p_campaign_id;
  delete from public.campaign_character_titles where campaign_id=p_campaign_id;
  delete from public.chapter_summaries where campaign_id=p_campaign_id;
  delete from public.campaign_world_ticks where campaign_id=p_campaign_id;
  delete from public.campaign_canon_events where campaign_id=p_campaign_id;
  delete from public.resource_accounts where campaign_id=p_campaign_id;
  delete from public.engine_authoritative_entity_state where entity_id in (select id from public.world_entities where campaign_id=p_campaign_id);
  delete from public.characters where campaign_id=p_campaign_id;
  delete from public.world_entities e where e.campaign_id=p_campaign_id and not exists(
    select 1 from jsonb_to_recordset(v_snapshot->'worldEntities') as x(id uuid) where x.id=e.id);

  insert into public.world_entities select * from jsonb_populate_recordset(null::public.world_entities,v_snapshot->'worldEntities')
    on conflict(id) do update set entity_type=excluded.entity_type,canonical_name=excluded.canonical_name,public_description=excluded.public_description;
  insert into public.characters select * from jsonb_populate_recordset(null::public.characters,v_snapshot->'characters');
  insert into public.engine_authoritative_entity_state select * from jsonb_populate_recordset(null::public.engine_authoritative_entity_state,v_snapshot->'truth');
  insert into public.player_knowledge select * from jsonb_populate_recordset(null::public.player_knowledge,v_snapshot->'knowledge');
  insert into public.campaign_memories select * from jsonb_populate_recordset(null::public.campaign_memories,v_snapshot->'memories');
  insert into public.plot_threads select * from jsonb_populate_recordset(null::public.plot_threads,v_snapshot->'threads');
  insert into public.relationship_history select * from jsonb_populate_recordset(null::public.relationship_history,v_snapshot->'relationshipHistory');
  insert into public.campaign_relationships select * from jsonb_populate_recordset(null::public.campaign_relationships,v_snapshot->'relationships');
  insert into public.campaign_relationship_roles select * from jsonb_populate_recordset(null::public.campaign_relationship_roles,v_snapshot->'relationshipRoles');
  insert into public.campaign_relationship_role_history select * from jsonb_populate_recordset(null::public.campaign_relationship_role_history,v_snapshot->'relationshipRoleHistory');
  insert into public.campaign_character_connections select * from jsonb_populate_recordset(null::public.campaign_character_connections,v_snapshot->'connections');
  insert into public.character_trait_history select * from jsonb_populate_recordset(null::public.character_trait_history,v_snapshot->'traitHistory');
  delete from public.campaign_clock where campaign_id=p_campaign_id;
  insert into public.campaign_clock select * from jsonb_populate_recordset(null::public.campaign_clock,v_snapshot->'clock');
  insert into public.resource_accounts select * from jsonb_populate_recordset(null::public.resource_accounts,v_snapshot->'resourceAccounts');
  insert into public.resource_transactions select * from jsonb_populate_recordset(null::public.resource_transactions,v_snapshot->'resourceTransactions');
  insert into public.engine_entity_secret_awareness select * from jsonb_populate_recordset(null::public.engine_entity_secret_awareness,v_snapshot->'secretAwareness');
  insert into public.engine_secret_evidence select * from jsonb_populate_recordset(null::public.engine_secret_evidence,v_snapshot->'secretEvidence');
  insert into public.engine_scheduled_campaign_events select * from jsonb_populate_recordset(null::public.engine_scheduled_campaign_events,v_snapshot->'scheduledEvents');
  insert into public.chapter_summaries select * from jsonb_populate_recordset(null::public.chapter_summaries,v_snapshot->'chapterSummaries');
  insert into public.campaign_canon_events select * from jsonb_populate_recordset(null::public.campaign_canon_events,v_snapshot->'canonEvents');
  insert into public.engine_hidden_campaign_facts select * from jsonb_populate_recordset(null::public.engine_hidden_campaign_facts,v_snapshot->'hiddenFacts');
  insert into public.campaign_character_titles select * from jsonb_populate_recordset(null::public.campaign_character_titles,v_snapshot->'titles');
  insert into public.campaign_world_ticks select * from jsonb_populate_recordset(null::public.campaign_world_ticks,v_snapshot->'worldTicks');

  update public.campaign_turns t set compacted_at=x.compacted_at from
    jsonb_to_recordset(v_snapshot->'turnCompaction') as x(id uuid,compacted_at timestamptz) where t.id=x.id;
  update public.campaigns set current_chapter=(v_campaign->>'current_chapter')::integer,
    current_chapter_title=v_campaign->>'current_chapter_title',status=v_campaign->>'status',updated_at=now() where id=p_campaign_id;
  delete from public.campaign_turns where id=any(v_removed_turn_ids);
  delete from public.campaign_turn_checkpoints where campaign_id=p_campaign_id and idempotency_key=any(v_removed_checkpoint_keys);
  insert into public.campaign_turn_retries(campaign_id,owner_id,original_turn_id,player_text,idempotency_key)
    values(p_campaign_id,v_user,p_turn_id,v_turn.player_text,p_idempotency_key);
  return jsonb_build_object('campaignId',p_campaign_id,'playerText',v_turn.player_text,'cost',v_cost,
    'removedTurns',cardinality(v_removed_turn_ids));
end $$;

revoke all on function public.retry_campaign_turn(uuid,uuid,uuid) from public, anon;
grant execute on function public.retry_campaign_turn(uuid,uuid,uuid) to authenticated;
