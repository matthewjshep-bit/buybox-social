-- Videos on a listing someone added themselves, uploaded from their device:
-- kept in file storage (far too big for the database), in a bucket anyone can
-- read by address. Each person uploads into, and deletes from, only their own
-- folder (named for who they are). Up to 50 MB a video, and video files only.
-- (Where there's no file storage, as on a developer's own machine, this does
-- nothing: there, videos are added by link.)
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('listing-media', 'listing-media', true, 52428800, array['video/mp4', 'video/quicktime', 'video/webm'])
    on conflict (id) do nothing;

    drop policy if exists "listing media: owners upload" on storage.objects;
    create policy "listing media: owners upload" on storage.objects
      for insert to authenticated
      with check (bucket_id = 'listing-media' and (storage.foldername(name))[1] = auth.uid()::text);

    drop policy if exists "listing media: owners see their own" on storage.objects;
    create policy "listing media: owners see their own" on storage.objects
      for select to authenticated
      using (bucket_id = 'listing-media' and (storage.foldername(name))[1] = auth.uid()::text);

    drop policy if exists "listing media: owners delete" on storage.objects;
    create policy "listing media: owners delete" on storage.objects
      for delete to authenticated
      using (bucket_id = 'listing-media' and (storage.foldername(name))[1] = auth.uid()::text);
  end if;
end $$;
