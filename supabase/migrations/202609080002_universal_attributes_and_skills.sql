-- Move the legacy universal combat score into learned skills, then replace it
-- with neutral Willpower. Character traits remain JSONB for setting flexibility.
update public.characters
set traits = jsonb_set(
  jsonb_set(
    traits #- '{attributes,combatSkill}',
    '{attributes,willpower}',
    coalesce(traits #> '{attributes,willpower}', '5'::jsonb),
    true
  ),
  '{skills}',
  case
    when jsonb_typeof(traits->'skills') = 'array'
      and exists (
        select 1 from jsonb_array_elements(traits->'skills') skill
        where coalesce(skill->>'name','') ~* '(combat|weapon|fight|duel|archery|gun|unarmed|sword)'
      ) then traits->'skills'
    when jsonb_typeof(traits->'skills') = 'array'
      and jsonb_typeof(traits #> '{attributes,combatSkill}') = 'number'
      then (traits->'skills') || jsonb_build_array(jsonb_build_object(
        'name', 'Combat', 'rating', (traits #>> '{attributes,combatSkill}')::integer
      ))
    when jsonb_typeof(traits #> '{attributes,combatSkill}') = 'number'
      then jsonb_build_array(jsonb_build_object(
        'name', 'Combat', 'rating', (traits #>> '{attributes,combatSkill}')::integer
      ))
    else coalesce(traits->'skills', '[]'::jsonb)
  end,
  true
)
where jsonb_typeof(traits->'attributes') = 'object';

