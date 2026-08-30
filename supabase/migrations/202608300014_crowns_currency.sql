-- Crowns are the product name. "Credits" remains the neutral database term.
-- Renaming preserves every account balance and narration charge 1:1.
alter table public.profiles rename column turns_balance to credits_balance;
alter table public.turn_narrations rename column turns_charged to credits_charged;

create or replace function public.import_world_pack(p_pack jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_user uuid := auth.uid(); v_cost integer; v_slug text; v_pack_id uuid;
  v_version_id uuid; v_version integer; v_balance integer; v_content jsonb; v_duplicate text;
begin
  if v_user is null then raise exception 'Sign in before importing a world.'; end if;
  if p_pack->>'schemaVersion' <> '1.0' then raise exception 'Unsupported world-pack schema version.'; end if;
  if jsonb_typeof(p_pack->'locations') <> 'array' or jsonb_array_length(p_pack->'locations') = 0 then raise exception 'The world must contain locations.'; end if;
  select lower(trim(value->>'name')) into v_duplicate from jsonb_array_elements(p_pack->'locations')
    group by lower(trim(value->>'name')) having count(*) > 1 limit 1;
  if v_duplicate is not null then raise exception 'Duplicate location name: %. Give every location a unique, disambiguated name.', v_duplicate; end if;
  select lower(trim(value->>'name')) into v_duplicate from jsonb_array_elements(coalesce(p_pack->'npcs','[]'::jsonb))
    group by lower(trim(value->>'name')) having count(*) > 1 limit 1;
  if v_duplicate is not null then raise exception 'Duplicate character name: %. Give every character a unique, disambiguated name.', v_duplicate; end if;
  v_cost := greatest(1,least(20,ceil(octet_length(p_pack::text)/25000.0)::integer));
  v_slug := trim(both '-' from regexp_replace(lower(coalesce(p_pack->>'id',p_pack#>>'{metadata,title}')),'[^a-z0-9]+','-','g'));
  if v_slug='' then raise exception 'The world ID is invalid.'; end if;
  update public.profiles set credits_balance=credits_balance-v_cost
    where id=v_user and credits_balance>=v_cost returning credits_balance into v_balance;
  if v_balance is null then raise exception 'You do not have enough Crowns to import this world. This import costs % Crowns.',v_cost; end if;
  select id into v_pack_id from public.world_packs where owner_id=v_user and slug=v_slug and is_system=false;
  if v_pack_id is null then
    insert into public.world_packs(owner_id,title,slug,is_system)
      values(v_user,p_pack#>>'{metadata,title}',v_slug,false) returning id into v_pack_id;
  end if;
  select greatest(coalesce(max(version),0)+1,coalesce((p_pack->>'version')::integer,1)) into v_version
    from public.world_pack_versions where pack_id=v_pack_id;
  v_content := jsonb_set(jsonb_set(jsonb_set(p_pack,'{ownerId}',to_jsonb(v_user::text)),'{version}',to_jsonb(v_version)),'{status}','"ready"'::jsonb);
  insert into public.world_pack_versions(pack_id,version,status,schema_version,content)
    values(v_pack_id,v_version,'ready','1.0',v_content) returning id into v_version_id;
  insert into public.credit_ledger(user_id,amount,reason,reference_id)
    values(v_user,-v_cost,'world_pack_import',v_version_id);
  return jsonb_build_object('pack',jsonb_set(v_content,'{databaseVersionId}',to_jsonb(v_version_id::text)),'cost',v_cost,'creditsRemaining',v_balance);
end $$;

create or replace function public.claim_turn_narration(p_turn_id uuid,p_model text,p_voice text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_user uuid := auth.uid(); v_turn public.campaign_turns%rowtype; v_campaign public.campaigns%rowtype;
  v_audio public.turn_narrations%rowtype; v_tokens integer; v_cost integer; v_balance integer;
begin
  if v_user is null then raise exception 'Sign in before generating narration.'; end if;
  select * into v_turn from public.campaign_turns where id=p_turn_id;
  if v_turn.id is null then raise exception 'Story turn not found.'; end if;
  select * into v_campaign from public.campaigns where id=v_turn.campaign_id and owner_id=v_user;
  if v_campaign.id is null then raise exception 'You do not have access to this story turn.'; end if;
  select * into v_audio from public.turn_narrations where turn_id=p_turn_id for update;
  if v_audio.status='ready' then
    return jsonb_build_object('status','ready','narrationId',v_audio.id,'storagePath',v_audio.storage_path,'cost',0,
      'estimatedTokens',v_audio.estimated_text_tokens,'creditsRemaining',(select credits_balance from public.profiles where id=v_user));
  end if;
  if v_audio.status='generating' then raise exception 'Narration is already being generated. Please wait a moment.'; end if;
  v_tokens := greatest(1,ceil(char_length(v_turn.narration)/4.0)::integer);
  v_cost := greatest(1,ceil(v_tokens/500.0)::integer);
  update public.profiles set credits_balance=credits_balance-v_cost
    where id=v_user and credits_balance>=v_cost returning credits_balance into v_balance;
  if v_balance is null then raise exception 'You do not have enough Crowns. This narration costs % Crowns.',v_cost; end if;
  if v_audio.id is null then
    insert into public.turn_narrations(turn_id,campaign_id,owner_id,status,voice,model,estimated_text_tokens,credits_charged)
      values(p_turn_id,v_turn.campaign_id,v_user,'generating',p_voice,p_model,v_tokens,v_cost) returning * into v_audio;
  else
    update public.turn_narrations set status='generating',voice=p_voice,model=p_model,estimated_text_tokens=v_tokens,
      credits_charged=v_cost,storage_path=null,error_code=null,updated_at=now() where id=v_audio.id returning * into v_audio;
  end if;
  insert into public.credit_ledger(user_id,amount,reason,reference_id) values(v_user,-v_cost,'ai_narration',v_audio.id);
  return jsonb_build_object('status','claimed','narrationId',v_audio.id,'text',v_turn.narration,'cost',v_cost,
    'estimatedTokens',v_tokens,'creditsRemaining',v_balance);
end $$;

create or replace function public.fail_turn_narration(p_narration_id uuid,p_error_code text)
returns void language plpgsql security definer set search_path='' as $$
declare v_audio public.turn_narrations%rowtype;
begin
  if auth.role()<>'service_role' then raise exception 'Not authorized.'; end if;
  select * into v_audio from public.turn_narrations where id=p_narration_id and status='generating' for update;
  if v_audio.id is null then return; end if;
  update public.profiles set credits_balance=credits_balance+v_audio.credits_charged where id=v_audio.owner_id;
  insert into public.credit_ledger(user_id,amount,reason,reference_id)
    values(v_audio.owner_id,v_audio.credits_charged,'ai_narration_refund',v_audio.id);
  update public.turn_narrations set status='failed',credits_charged=0,error_code=left(p_error_code,100),updated_at=now() where id=v_audio.id;
end $$;
