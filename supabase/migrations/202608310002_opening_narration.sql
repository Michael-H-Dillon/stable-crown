alter table public.turn_narrations alter column turn_id drop not null;
alter table public.turn_narrations add column source_kind text not null default 'turn' check(source_kind in ('turn','opening'));
create unique index turn_narrations_one_opening_per_campaign on public.turn_narrations(campaign_id) where source_kind='opening';
alter table public.turn_narrations add constraint turn_narrations_source_check check((source_kind='turn' and turn_id is not null) or (source_kind='opening' and turn_id is null));

create or replace function public.claim_opening_narration(p_campaign_id uuid,p_model text,p_voice text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_user uuid:=auth.uid(); v_campaign public.campaigns%rowtype; v_audio public.turn_narrations%rowtype;
  v_text text; v_name text; v_tokens integer; v_cost integer; v_balance integer;
begin
  if v_user is null then raise exception 'Sign in before generating narration.'; end if;
  select * into v_campaign from public.campaigns where id=p_campaign_id and owner_id=v_user;
  if v_campaign.id is null then raise exception 'Campaign not found.'; end if;
  select content#>>'{openingScenario,narration}' into v_text from public.world_pack_versions where id=v_campaign.pack_version_id;
  select name into v_name from public.characters where campaign_id=p_campaign_id and traits->>'player'='true' limit 1;
  v_text:=replace(coalesce(v_text,''),'{name}',coalesce(v_name,'the player'));
  if char_length(v_text)<1 then raise exception 'This world has no opening narration.'; end if;
  select * into v_audio from public.turn_narrations where campaign_id=p_campaign_id and source_kind='opening' for update;
  if v_audio.status='ready' then return jsonb_build_object('status','ready','narrationId',v_audio.id,'storagePath',v_audio.storage_path,'cost',0,'estimatedTokens',v_audio.estimated_text_tokens,'creditsRemaining',(select credits_balance from public.profiles where id=v_user)); end if;
  if v_audio.status='generating' then raise exception 'Narration is already being generated. Please wait a moment.'; end if;
  v_tokens:=greatest(1,ceil(char_length(v_text)/4.0)::integer); v_cost:=greatest(1,ceil(v_tokens/500.0)::integer);
  update public.profiles set credits_balance=credits_balance-v_cost where id=v_user and credits_balance>=v_cost returning credits_balance into v_balance;
  if v_balance is null then raise exception 'You do not have enough Crowns. This narration costs % Crowns.',v_cost; end if;
  if v_audio.id is null then insert into public.turn_narrations(turn_id,campaign_id,owner_id,status,voice,model,estimated_text_tokens,credits_charged,source_kind) values(null,p_campaign_id,v_user,'generating',p_voice,p_model,v_tokens,v_cost,'opening') returning * into v_audio;
  else update public.turn_narrations set status='generating',voice=p_voice,model=p_model,estimated_text_tokens=v_tokens,credits_charged=v_cost,storage_path=null,error_code=null,updated_at=now() where id=v_audio.id returning * into v_audio; end if;
  insert into public.credit_ledger(user_id,amount,reason,reference_id) values(v_user,-v_cost,'ai_narration',v_audio.id);
  return jsonb_build_object('status','claimed','narrationId',v_audio.id,'text',v_text,'cost',v_cost,'estimatedTokens',v_tokens,'creditsRemaining',v_balance);
end $$;

revoke all on function public.claim_opening_narration(uuid,text,text) from public,anon;
grant execute on function public.claim_opening_narration(uuid,text,text) to authenticated;
