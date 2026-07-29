-- ============================================================
-- Peaceful OS — 04: create the first shop and attach the owner.
-- Run ONCE, after the owner has signed up through the app's
-- login screen (so auth.users has a row for them).
--
-- Replace the email below with the owner's signup email.
-- ============================================================

do $$
declare
  v_user uuid;
  v_shop uuid;
begin
  select id into v_user from auth.users
   where email = 'peacefulmotors@outlook.com'   -- <<< CHANGE ME
   limit 1;

  if v_user is null then
    raise exception 'No auth.users row for that email — sign up in the app first.';
  end if;

  insert into shops (name, tagline, phone, email, site, is_master)
  values ('PEACEFUL MOTORS',
          'An Ease of Mind is Simply Divine.',
          '314-919-7456',
          'peacefulmotors@outlook.com',
          'peacefulmotors.com',
          true)
  returning id into v_shop;

  insert into shop_users (user_id, shop_id, role, display_name)
  values (v_user, v_shop, 'owner', 'Owner')
  on conflict (user_id, shop_id) do update set role = 'owner';

  raise notice 'Shop created: %', v_shop;
end $$;
