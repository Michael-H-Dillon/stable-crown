-- Research previously allowed biographies and strategic observations to be
-- inserted as if they were direct relationships to the player character.
delete from public.campaign_relationship_roles
where started_reason in (
    'Established through researched campaign context.',
    'Verified as a direct connection through researched campaign context.'
  )
  and lower(trim(relationship_type)) not in (
    'parent','child','sibling','spouse','partner','friend','ally','rival','enemy',
    'liege','vassal','bannerman','sworn sword','household member','cousin',
    'uncle','aunt','nephew','niece','grandparent','grandchild',
    'brother-in-law','sister-in-law'
  );
