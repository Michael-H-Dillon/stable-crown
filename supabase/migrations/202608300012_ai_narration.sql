create table public.turn_narrations (
  id uuid primary key default gen_random_uuid(),
  turn_id uuid not null unique references public.campaign_turns(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  status text not null check(status in ('generating','ready','failed')),
  voice text not null default 'coral',
  model text not null,
  estimated_text_tokens integer not null check(estimated_text_tokens > 0),
  turns_charged integer not null check(turns_charged >= 0),
  storage_path text,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.turn_narrations enable row level security;
create policy turn_narrations_owner_select on public.turn_narrations for select to authenticated using(owner_id = auth.uid());
grant select on public.turn_narrations to authenticated;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values('narration-audio', 'narration-audio', false, 15728640, array['audio/mpeg'])
on conflict(id) do update set public=false, file_size_limit=excluded.file_size_limit, allowed_mime_types=excluded.allowed_mime_types;

create or replace function public.claim_turn_narration(p_turn_id uuid, p_model text, p_voice text)
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
  if v_audio.status='ready' then return jsonb_build_object('status','ready','narrationId',v_audio.id,'storagePath',v_audio.storage_path,'cost',0,'estimatedTokens',v_audio.estimated_text_tokens,'turnsRemaining',(select turns_balance from public.profiles where id=v_user)); end if;
  if v_audio.status='generating' then raise exception 'Narration is already being generated. Please wait a moment.'; end if;
  v_tokens := greatest(1, ceil(char_length(v_turn.narration) / 4.0)::integer);
  v_cost := greatest(1, ceil(v_tokens / 500.0)::integer);
  update public.profiles set turns_balance=turns_balance-v_cost where id=v_user and turns_balance>=v_cost returning turns_balance into v_balance;
  if v_balance is null then raise exception 'You do not have enough turns. This narration costs % turns.', v_cost; end if;
  if v_audio.id is null then
    insert into public.turn_narrations(turn_id,campaign_id,owner_id,status,voice,model,estimated_text_tokens,turns_charged)
    values(p_turn_id,v_turn.campaign_id,v_user,'generating',p_voice,p_model,v_tokens,v_cost) returning * into v_audio;
  else
    update public.turn_narrations set status='generating',voice=p_voice,model=p_model,estimated_text_tokens=v_tokens,turns_charged=v_cost,storage_path=null,error_code=null,updated_at=now() where id=v_audio.id returning * into v_audio;
  end if;
  insert into public.credit_ledger(user_id,amount,reason,reference_id) values(v_user,-v_cost,'ai_narration',v_audio.id);
  return jsonb_build_object('status','claimed','narrationId',v_audio.id,'text',v_turn.narration,'cost',v_cost,'estimatedTokens',v_tokens,'turnsRemaining',v_balance);
end $$;

create or replace function public.fail_turn_narration(p_narration_id uuid, p_error_code text)
returns void language plpgsql security definer set search_path='' as $$
declare v_audio public.turn_narrations%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception 'Not authorized.'; end if;
  select * into v_audio from public.turn_narrations where id=p_narration_id and status='generating' for update;
  if v_audio.id is null then return; end if;
  update public.profiles set turns_balance=turns_balance+v_audio.turns_charged where id=v_audio.owner_id;
  insert into public.credit_ledger(user_id,amount,reason,reference_id) values(v_audio.owner_id,v_audio.turns_charged,'ai_narration_refund',v_audio.id);
  update public.turn_narrations set status='failed',turns_charged=0,error_code=left(p_error_code,100),updated_at=now() where id=v_audio.id;
end $$;

revoke all on function public.claim_turn_narration(uuid,text,text) from public, anon;
grant execute on function public.claim_turn_narration(uuid,text,text) to authenticated;
revoke all on function public.fail_turn_narration(uuid,text) from public, anon, authenticated;
grant execute on function public.fail_turn_narration(uuid,text) to service_role;

