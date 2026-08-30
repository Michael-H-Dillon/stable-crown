alter table public.profiles add column email citext unique;

update public.profiles profile
set email=users.email
from auth.users users
where users.id=profile.id
  and users.email not like '%@users.sablecrown.app';

create or replace function private.handle_new_user() returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.profiles(id,username,display_name,email)
  values(new.id, lower(coalesce(new.raw_user_meta_data->>'username', split_part(new.email,'@',1))), coalesce(new.raw_user_meta_data->>'display_name', new.raw_user_meta_data->>'username', 'Player'), new.email);
  insert into public.credit_ledger(user_id,amount,reason) values(new.id,20,'welcome_grant');
  return new;
end $$;
