-- Create public logos storage bucket
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'logos',
  'logos',
  true,
  2097152, -- 2 MB
  array['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml', 'image/gif']
)
on conflict (id) do nothing;

-- Allow authenticated admins/owners to upload logos for their org
create policy "org_admins_upload_logos"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'logos'
  and exists (
    select 1 from memberships
    where user_id = auth.uid()
      and organization_id::text = (storage.foldername(name))[1]
      and role in ('owner', 'admin')
  )
);

-- Allow authenticated admins/owners to delete their org logos
create policy "org_admins_delete_logos"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'logos'
  and exists (
    select 1 from memberships
    where user_id = auth.uid()
      and organization_id::text = (storage.foldername(name))[1]
      and role in ('owner', 'admin')
  )
);

-- Allow public read access to logos (bucket is public)
create policy "logos_public_read"
on storage.objects for select
using (bucket_id = 'logos');
