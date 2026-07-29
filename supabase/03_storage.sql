-- ============================================================
-- Peaceful OS — Schema 03: Storage bucket for job media
-- Run AFTER 02_policies.sql.
--
-- Photos and videos do NOT belong in a jsonb column. They live in
-- Storage; the database keeps only the path. Objects are filed
-- under <shop_id>/<estimate_no>/<file>, and the policies below
-- make that first folder the tenant boundary.
-- ============================================================

insert into storage.buckets (id, name, public)
values ('media', 'media', false)
on conflict (id) do nothing;

drop policy if exists media_obj_read   on storage.objects;
drop policy if exists media_obj_write  on storage.objects;
drop policy if exists media_obj_delete on storage.objects;

-- (storage.foldername(name))[1] is the first path segment = the shop id.
create policy media_obj_read on storage.objects
  for select using (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = current_shop_id()::text
  );

create policy media_obj_write on storage.objects
  for insert with check (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = current_shop_id()::text
  );

create policy media_obj_delete on storage.objects
  for delete using (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = current_shop_id()::text
  );
