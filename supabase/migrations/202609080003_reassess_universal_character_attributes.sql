alter table public.characters
  add column if not exists attributes_assessment_version integer not null default 0;

-- Records assessed before Willpower and learned skills were introduced must be
-- assessed again when they next participate in play.
update public.characters
set attributes_individually_assessed = false,
    attributes_assessment_version = 0,
    attributes_assessment_basis = 'Legacy attribute model; universal reassessment pending.'
where canon_status = 'canonical'
  and (
    not (coalesce(traits->'attributes','{}'::jsonb) ? 'willpower')
    or coalesce(attributes_assessment_version,0) < 2
  );

