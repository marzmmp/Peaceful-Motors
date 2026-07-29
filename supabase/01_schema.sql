-- ============================================================
-- Peaceful OS — Schema 01: tables + tenant resolution
-- Run this FIRST in Supabase → SQL Editor, then 02_policies.sql,
-- then 03_storage.sql.
--
-- The one idea that makes everything else work:
--   shop_id is NEVER sent by the browser. It is filled in by a
--   database default that reads the logged-in user's shop. A
--   client cannot spoof what it never supplies.
-- ============================================================

-- ---------- shops ----------
create table if not exists shops (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  tagline     text,
  phone       text,
  email       text,
  site        text,
  warranty    text default '12 months / 12,000 miles, parts & labor',
  is_master   boolean default false,
  created_at  timestamptz default now()
);

-- ---------- shop_users: who belongs to which shop, and as what ----------
create table if not exists shop_users (
  user_id     uuid not null references auth.users(id) on delete cascade,
  shop_id     uuid not null references shops(id) on delete cascade,
  role        text not null default 'tech'
              check (role in ('owner','manager','advisor','tech','contractor','apprentice')),
  display_name text,
  created_at  timestamptz default now(),
  primary key (user_id, shop_id)
);
create index if not exists shop_users_shop_idx on shop_users(shop_id);

-- ---------- tenant resolution helpers ----------
-- security definer so it can read shop_users regardless of that table's RLS.
create or replace function current_shop_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select shop_id from shop_users where user_id = auth.uid() limit 1
$$;

create or replace function current_role_name()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from shop_users where user_id = auth.uid() limit 1
$$;

create or replace function is_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role in ('owner','manager') from shop_users where user_id = auth.uid() limit 1),
    false)
$$;

-- ---------- pm_store: the app's key/value records, now tenant-scoped ----------
-- shop_id defaults from the session. The browser never sends it.
create table if not exists pm_store (
  shop_id     uuid not null default current_shop_id() references shops(id) on delete cascade,
  key         text not null,
  value       jsonb not null,
  updated_at  timestamptz default now(),
  primary key (shop_id, key)
);
create index if not exists pm_store_prefix_idx on pm_store (shop_id, key text_pattern_ops);

-- ---------- media: metadata only; bytes live in Storage ----------
create table if not exists media (
  id          uuid primary key default gen_random_uuid(),
  shop_id     uuid not null default current_shop_id() references shops(id) on delete cascade,
  estimate_no text not null,
  path        text not null,               -- object path inside the 'media' bucket
  kind        text not null default 'photo' check (kind in ('photo','video')),
  caption     text,
  comment     text,
  sort_order  int default 0,
  created_at  timestamptz default now()
);
create index if not exists media_lookup_idx on media (shop_id, estimate_no, sort_order);

-- ---------- phone verification: codes live server-side, never in the browser ----------
create table if not exists phone_verifications (
  id          uuid primary key default gen_random_uuid(),
  shop_id     uuid,
  phone       text not null,
  code_hash   text not null,               -- sha256, never the code itself
  attempts    int default 0,
  verified_at timestamptz,
  expires_at  timestamptz not null,
  created_at  timestamptz default now()
);
create index if not exists phone_verif_lookup on phone_verifications (phone, created_at desc);

-- ---------- rate limiting (shared across serverless instances) ----------
create table if not exists rate_hits (
  bucket      text not null,               -- e.g. 'sms:203.0.113.7'
  window_start timestamptz not null,
  hits        int not null default 1,
  primary key (bucket, window_start)
);

-- ---------- customers / subscriptions / notifications (Phase 1, unchanged shape) ----------
create table if not exists customers (
  id          uuid primary key default gen_random_uuid(),
  shop_id     uuid not null default current_shop_id() references shops(id) on delete cascade,
  name text, phone text, email text, address text,
  notify_ok   boolean default false,
  notify_consent_at timestamptz,
  created_at  timestamptz default now()
);

create table if not exists subscriptions (
  id          uuid primary key default gen_random_uuid(),
  shop_id     uuid not null references shops(id) on delete cascade,
  stripe_customer_id text,
  stripe_subscription_id text,
  plan text, status text,
  current_period_end timestamptz,
  created_at  timestamptz default now()
);

create table if not exists tech_locations (
  id          bigserial primary key,
  shop_id     uuid not null default current_shop_id() references shops(id) on delete cascade,
  tech_name   text not null,
  lat double precision, lng double precision,
  recorded_at timestamptz default now(),
  consent_at  timestamptz not null
);

create table if not exists notifications (
  id          bigserial primary key,
  shop_id     uuid not null default current_shop_id() references shops(id) on delete cascade,
  customer_id uuid references customers(id) on delete set null,
  channel text, body text,
  sent_at     timestamptz default now()
);

-- ---------- keep updated_at honest ----------
create or replace function touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists pm_store_touch on pm_store;
create trigger pm_store_touch before update on pm_store
  for each row execute function touch_updated_at();

-- ---------- atomic rate-limit counter (used by lib/ratelimit.js) ----------
-- Returns the hit count for this bucket+window AFTER incrementing, so the
-- check-and-increment is a single trip with no race between instances.
create or replace function bump_rate(p_bucket text, p_window timestamptz)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare v_hits int;
begin
  insert into rate_hits (bucket, window_start, hits)
  values (p_bucket, p_window, 1)
  on conflict (bucket, window_start)
  do update set hits = rate_hits.hits + 1
  returning hits into v_hits;
  return v_hits;
end $$;

-- Let the app call current_shop_id() from the browser (lib/media.js uses it).
grant execute on function current_shop_id() to authenticated;
grant execute on function current_role_name() to authenticated;
grant execute on function is_owner() to authenticated;
