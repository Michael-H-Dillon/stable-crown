-- Promote the bundled starter world into a shared system pack without changing
-- or deleting owner-scoped rows that existing campaigns may still reference.
do $$
declare
  source_pack public.world_packs%rowtype;
  global_pack_id uuid;
begin
  select * into source_pack
  from public.world_packs
  where slug = 'the-ashen-marches'
  order by is_system desc, created_at asc
  limit 1;

  -- On a completely fresh project the Edge Function creates this row when the
  -- first starter campaign begins. Existing projects can seed it from their
  -- earliest private copy.
  if source_pack.id is null then
    return;
  end if;

  select id into global_pack_id
  from public.world_packs
  where slug = 'the-ashen-marches' and is_system = true and owner_id is null
  limit 1;

  if global_pack_id is null then
    insert into public.world_packs(owner_id, title, slug, is_system)
    values (null, source_pack.title, source_pack.slug, true)
    returning id into global_pack_id;
  end if;

  insert into public.world_pack_versions(pack_id, version, status, schema_version, content)
  select
    global_pack_id,
    source_version.version,
    source_version.status,
    source_version.schema_version,
    jsonb_set(source_version.content, '{ownerId}', '"system"'::jsonb, true)
  from public.world_pack_versions source_version
  where source_version.pack_id = source_pack.id
  on conflict (pack_id, version) do nothing;
end $$;
