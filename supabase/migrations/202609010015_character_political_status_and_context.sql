create table if not exists public.campaign_character_titles (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  entity_id uuid not null references public.world_entities(id) on delete cascade,
  title text not null check (char_length(title) between 2 and 160),
  kind text not null check (kind in ('held','claim')),
  status text not null check (status in ('held','rumoured','contemplated','intended','declared','recognized','abandoned','lost')),
  reason text not null,
  source_turn_id uuid references public.campaign_turns(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique(campaign_id,entity_id,title)
);

create table if not exists public.campaign_context_notes (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  context_text text not null check (char_length(context_text) between 10 and 4000),
  status text not null default 'active' check (status in ('active','superseded','rejected')),
  crowns_charged integer not null default 0 check (crowns_charged >= 0),
  created_at timestamptz not null default now()
);

alter table public.campaign_character_titles enable row level security;
alter table public.campaign_context_notes enable row level security;
create policy campaign_character_titles_member_select on public.campaign_character_titles for select to authenticated using(private.is_campaign_member(campaign_id));
create policy campaign_context_notes_owner_select on public.campaign_context_notes for select to authenticated using(owner_id=auth.uid());
grant select on public.campaign_character_titles,public.campaign_context_notes to authenticated;

insert into public.campaign_character_titles(campaign_id,entity_id,title,kind,status,reason)
select c.campaign_id,c.entity_id,c.background->>'name','held','held','Established by the playable character background.'
from public.characters c
where coalesce((c.traits->>'player')::boolean,false)
  and nullif(trim(c.background->>'name'),'') is not null
on conflict(campaign_id,entity_id,title) do nothing;

insert into public.campaign_character_titles(campaign_id,entity_id,title,kind,status,reason)
select c.campaign_id,c.entity_id,'Sovereign','claim','contemplated','The playable character may pursue sovereignty, but has not declared a claim.'
from public.characters c
where coalesce((c.traits->>'player')::boolean,false)
  and concat(c.traits#>>'{motivation,name}',' ',c.traits#>>'{motivation,description}') ~* '\m(crown|king|queen|throne|sovereign)\M'
on conflict(campaign_id,entity_id,title) do nothing;

-- Repair legacy knowledge copy that still describes a now-confirmed dead person as dying.
update public.player_knowledge
set source_summary = 'Confirmed dead; this was their last believed location.',
    updated_at = now()
where lower(coalesce(known_status->>'label','')) = 'dead'
  and source_summary ~* '\m(dying|mortally wounded|under .*medical care)\M';

-- A context note is author guidance. The small Crown charge covers the additional
-- context processed on every subsequent AI turn, not merely storing the text.
create or replace function public.add_campaign_context(p_campaign_id uuid,p_context text,p_cost integer default 1)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_balance integer; v_note uuid;
begin
  if v_user is null then raise exception 'Sign in before adding campaign context.'; end if;
  if not exists(select 1 from public.campaigns where id=p_campaign_id and owner_id=v_user) then raise exception 'Campaign not found.'; end if;
  if char_length(trim(p_context)) not between 10 and 4000 then raise exception 'Context must contain between 10 and 4,000 characters.'; end if;
  p_cost:=greatest(1,least(5,p_cost));
  update public.profiles set credits_balance=credits_balance-p_cost where id=v_user and credits_balance>=p_cost returning credits_balance into v_balance;
  if v_balance is null then raise exception 'You do not have enough Crowns. Adding this context costs % Crown(s).',p_cost; end if;
  insert into public.campaign_context_notes(campaign_id,owner_id,context_text,crowns_charged) values(p_campaign_id,v_user,trim(p_context),p_cost) returning id into v_note;
  insert into public.credit_ledger(user_id,amount,reason,reference_id) values(v_user,-p_cost,'campaign_context',v_note);
  return jsonb_build_object('id',v_note,'cost',p_cost,'creditsRemaining',v_balance);
end $$;
revoke all on function public.add_campaign_context(uuid,text,integer) from public,anon;
grant execute on function public.add_campaign_context(uuid,text,integer) to authenticated;

alter table public.background_jobs drop constraint if exists background_jobs_job_type_check;
alter table public.background_jobs add constraint background_jobs_job_type_check
  check (job_type in ('generate_world','create_campaign','audit_world_ledger'));

alter table public.ai_cost_ledger drop constraint if exists ai_cost_ledger_operation_check;
alter table public.ai_cost_ledger add constraint ai_cost_ledger_operation_check
  check(operation in ('turn','world_tick','narration','world_generation','ledger_audit'));
