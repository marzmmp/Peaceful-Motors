-- ============================================================
-- Peaceful OS — Schema 02: Row Level Security
-- Run AFTER 01_schema.sql.
--
-- Replaces the old `using (true)` policy, which granted the anon
-- key full read/write on every record in the database.
--
-- Rule enforced below: you can only touch rows belonging to the
-- shop you are a member of. Enforced in the database, so it holds
-- no matter what the browser sends.
-- ============================================================

alter table shops               enable row level security;
alter table shop_users          enable row level security;
alter table pm_store            enable row level security;
alter table media               enable row level security;
alter table customers           enable row level security;
alter table subscriptions       enable row level security;
alter table tech_locations      enable row level security;
alter table notifications       enable row level security;
alter table phone_verifications enable row level security;
alter table rate_hits           enable row level security;

-- Clean re-runs
drop policy if exists shops_read       on shops;
drop policy if exists shops_write      on shops;
drop policy if exists shop_users_read  on shop_users;
drop policy if exists shop_users_write on shop_users;
drop policy if exists pm_store_all     on pm_store;
drop policy if exists media_all        on media;
drop policy if exists customers_all    on customers;
drop policy if exists subs_read        on subscriptions;
drop policy if exists techloc_all      on tech_locations;
drop policy if exists notif_all        on notifications;
drop policy if exists "shop access"    on pm_store;

-- ---------- shops: read your own; only owner/manager may edit ----------
create policy shops_read on shops
  for select using (id = current_shop_id());
create policy shops_write on shops
  for update using (id = current_shop_id() and is_owner())
           with check (id = current_shop_id() and is_owner());

-- ---------- roster: everyone sees teammates; only owner/manager edits ----------
create policy shop_users_read on shop_users
  for select using (shop_id = current_shop_id());
create policy shop_users_write on shop_users
  for all using (shop_id = current_shop_id() and is_owner())
          with check (shop_id = current_shop_id() and is_owner());

-- ---------- the app's records ----------
create policy pm_store_all on pm_store
  for all using (shop_id = current_shop_id())
          with check (shop_id = current_shop_id());

create policy media_all on media
  for all using (shop_id = current_shop_id())
          with check (shop_id = current_shop_id());

create policy customers_all on customers
  for all using (shop_id = current_shop_id())
          with check (shop_id = current_shop_id());

create policy techloc_all on tech_locations
  for all using (shop_id = current_shop_id())
          with check (shop_id = current_shop_id());

create policy notif_all on notifications
  for all using (shop_id = current_shop_id())
          with check (shop_id = current_shop_id());

-- ---------- billing is read-only to the shop; only the service key writes ----------
create policy subs_read on subscriptions
  for select using (shop_id = current_shop_id());

-- ---------- phone_verifications and rate_hits: NO policies on purpose ----------
-- RLS on with zero policies = deny all for anon/authenticated clients.
-- Only the server-side SERVICE ROLE key touches these, which bypasses RLS.
-- This is deliberate, not an oversight — see 01_schema.sql.

-- ---------- retention: location data is sensitive, purge it ----------
-- Supabase → Database → Cron (pg_cron), daily:
--   delete from tech_locations where recorded_at < now() - interval '24 hours';
--   delete from phone_verifications where expires_at < now() - interval '1 day';
--   delete from rate_hits where window_start < now() - interval '1 hour';
