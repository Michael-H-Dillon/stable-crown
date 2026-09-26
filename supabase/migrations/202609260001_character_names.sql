alter table public.characters
  add column if not exists nicknames text[] not null default '{}'::text[],
  add column if not exists titles text[] not null default '{}'::text[];

comment on column public.characters.name is
  'Canonical personal name only. Nicknames, epithets, honorifics, offices, and ranks belong in their dedicated arrays.';
comment on column public.characters.nicknames is
  'Known aliases and earned epithets, excluding the canonical name and formal titles.';
comment on column public.characters.titles is
  'Current known formal titles, ranks, offices, and honorifics, excluding the canonical name.';
