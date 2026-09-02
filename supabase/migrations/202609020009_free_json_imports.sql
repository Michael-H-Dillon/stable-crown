-- Public world files describe only authored content. Supabase assigns ownership,
-- identity, readiness, schema default, author fallback, and immutable versioning.
create or replace function public.import_world_pack(p_pack jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_user uuid := auth.uid(); v_cost integer; v_slug text; v_pack_id uuid;
  v_version_id uuid; v_version integer; v_balance integer; v_content jsonb;
  v_duplicate text; v_title text; v_author text;
begin
  if v_user is null then raise exception 'Sign in before importing a world.'; end if;
  if coalesce(p_pack->>'schemaVersion','1.0') <> '1.0' then raise exception 'Unsupported world-pack schema version.'; end if;
  v_title := trim(p_pack#>>'{metadata,title}');
  if coalesce(v_title,'') = '' then raise exception 'The world must have a title.'; end if;
  if jsonb_typeof(p_pack->'locations') <> 'array' or jsonb_array_length(p_pack->'locations') = 0 then raise exception 'The world must contain locations.'; end if;
  select lower(trim(value->>'name')) into v_duplicate from jsonb_array_elements(p_pack->'locations')
    group by lower(trim(value->>'name')) having count(*) > 1 limit 1;
  if v_duplicate is not null then raise exception 'Duplicate location name: %. Give every location a unique, disambiguated name.',v_duplicate; end if;
  select lower(trim(value->>'name')) into v_duplicate from jsonb_array_elements(coalesce(p_pack->'npcs','[]'::jsonb))
    group by lower(trim(value->>'name')) having count(*) > 1 limit 1;
  if v_duplicate is not null then raise exception 'Duplicate character name: %. Give every character a unique, disambiguated name.',v_duplicate; end if;

  select display_name into v_author from public.profiles where id=v_user;
  v_author := coalesce(nullif(trim(p_pack#>>'{metadata,author}'),''),v_author,'Player');
  v_slug := trim(both '-' from regexp_replace(lower(v_title),'[^a-z0-9]+','-','g'));
  if v_slug='' then raise exception 'The world title must contain letters or numbers.'; end if;
  -- Import performs deterministic validation/storage only. AI generation is charged separately.
  v_cost := 0;

  select credits_balance into v_balance from public.profiles where id=v_user;
  if v_balance is null then raise exception 'Your profile could not be found.'; end if;

  select id into v_pack_id from public.world_packs where owner_id=v_user and slug=v_slug and is_system=false;
  if v_pack_id is null then
    insert into public.world_packs(owner_id,title,slug,is_system) values(v_user,v_title,v_slug,false) returning id into v_pack_id;
  else
    update public.world_packs set title=v_title where id=v_pack_id;
  end if;
  select coalesce(max(version),0)+1 into v_version from public.world_pack_versions where pack_id=v_pack_id;

  v_content := p_pack - 'ownerId' - 'status' - 'version' - 'id';
  v_content := jsonb_set(v_content,'{schemaVersion}','"1.0"'::jsonb,true);
  v_content := jsonb_set(v_content,'{id}',to_jsonb(v_slug),true);
  v_content := jsonb_set(v_content,'{version}',to_jsonb(v_version),true);
  v_content := jsonb_set(v_content,'{ownerId}',to_jsonb(v_user::text),true);
  v_content := jsonb_set(v_content,'{status}','"ready"'::jsonb,true);
  v_content := jsonb_set(v_content,'{metadata,author}',to_jsonb(v_author),true);
  insert into public.world_pack_versions(pack_id,version,status,schema_version,content)
    values(v_pack_id,v_version,'ready','1.0',v_content) returning id into v_version_id;
  return jsonb_build_object('pack',jsonb_set(v_content,'{databaseVersionId}',to_jsonb(v_version_id::text)),'cost',v_cost,'creditsRemaining',v_balance);
exception when others then
  raise;
end $$;

revoke all on function public.import_world_pack(jsonb) from public, anon;
grant execute on function public.import_world_pack(jsonb) to authenticated;

-- Compatibility for already deployed generation workers: saving a world is free,
-- so the generation reservation no longer needs an import-fee release.
create or replace function public.release_world_import_from_hold(p_user uuid, p_job uuid, p_amount integer)
returns integer language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from public.credit_ledger where user_id=p_user and reference_id=p_job and reason='ai_world_generation_hold') then
    raise exception 'World-generation reservation was not found.';
  end if;
  return (select credits_balance from public.profiles where id=p_user);
end $$;
revoke all on function public.release_world_import_from_hold(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.release_world_import_from_hold(uuid,uuid,integer) to service_role;
