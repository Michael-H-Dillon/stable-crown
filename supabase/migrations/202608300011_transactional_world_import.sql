-- Packs require unambiguous display names as well as stable IDs. Keeping this
-- constraint in the database provides defense in depth for non-UI importers.
alter table public.locations
  add constraint locations_campaign_id_name_key unique(campaign_id, name);

create or replace function public.import_world_pack(p_pack jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_cost integer;
  v_slug text;
  v_pack_id uuid;
  v_version_id uuid;
  v_version integer;
  v_balance integer;
  v_content jsonb;
  v_duplicate text;
begin
  if v_user is null then raise exception 'Sign in before importing a world.'; end if;
  if p_pack->>'schemaVersion' <> '1.0' then raise exception 'Unsupported world-pack schema version.'; end if;
  if jsonb_typeof(p_pack->'locations') <> 'array' or jsonb_array_length(p_pack->'locations') = 0 then raise exception 'The world must contain locations.'; end if;

  select lower(trim(value->>'name')) into v_duplicate
  from jsonb_array_elements(p_pack->'locations')
  group by lower(trim(value->>'name')) having count(*) > 1 limit 1;
  if v_duplicate is not null then raise exception 'Duplicate location name: %. Give every location a unique, disambiguated name.', v_duplicate; end if;

  select lower(trim(value->>'name')) into v_duplicate
  from jsonb_array_elements(coalesce(p_pack->'npcs', '[]'::jsonb))
  group by lower(trim(value->>'name')) having count(*) > 1 limit 1;
  if v_duplicate is not null then raise exception 'Duplicate character name: %. Give every character a unique, disambiguated name.', v_duplicate; end if;

  v_cost := greatest(1, least(20, ceil(octet_length(p_pack::text) / 25000.0)::integer));
  v_slug := trim(both '-' from regexp_replace(lower(coalesce(p_pack->>'id', p_pack#>>'{metadata,title}')), '[^a-z0-9]+', '-', 'g'));
  if v_slug = '' then raise exception 'The world ID is invalid.'; end if;

  update public.profiles set turns_balance = turns_balance - v_cost
  where id = v_user and turns_balance >= v_cost
  returning turns_balance into v_balance;
  if v_balance is null then raise exception 'You do not have enough turns to import this world. This import costs % turns.', v_cost; end if;

  select id into v_pack_id from public.world_packs where owner_id = v_user and slug = v_slug and is_system = false;
  if v_pack_id is null then
    insert into public.world_packs(owner_id, title, slug, is_system)
    values(v_user, p_pack#>>'{metadata,title}', v_slug, false) returning id into v_pack_id;
  end if;

  select greatest(coalesce(max(version), 0) + 1, coalesce((p_pack->>'version')::integer, 1)) into v_version
  from public.world_pack_versions where pack_id = v_pack_id;
  v_content := jsonb_set(jsonb_set(jsonb_set(p_pack, '{ownerId}', to_jsonb(v_user::text)), '{version}', to_jsonb(v_version)), '{status}', '"ready"'::jsonb);
  insert into public.world_pack_versions(pack_id, version, status, schema_version, content)
  values(v_pack_id, v_version, 'ready', '1.0', v_content) returning id into v_version_id;
  insert into public.credit_ledger(user_id, amount, reason, reference_id)
  values(v_user, -v_cost, 'world_pack_import', v_version_id);

  return jsonb_build_object('pack', jsonb_set(v_content, '{databaseVersionId}', to_jsonb(v_version_id::text)), 'cost', v_cost, 'turnsRemaining', v_balance);
end $$;

revoke all on function public.import_world_pack(jsonb) from public, anon;
grant execute on function public.import_world_pack(jsonb) to authenticated;
