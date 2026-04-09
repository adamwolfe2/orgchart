-- Staging table for CSV uploads. The /api/employees/upload endpoint
-- now writes here first and returns a staging_id to the client, which
-- then shows the user a preview. On "commit", /api/employees/upload/commit
-- promotes the staging row into the employees table with the stored
-- upload_batch_id and deletes the staging row.
--
-- Staging rows expire after 30 minutes and are swept opportunistically
-- by the parse endpoint on every new upload for the caller's org.

create table if not exists employee_upload_stagings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations on delete cascade,
  created_by uuid not null references auth.users on delete cascade,
  parsed_rows jsonb not null,
  warnings jsonb not null default '[]'::jsonb,
  header_mappings jsonb not null default '[]'::jsonb,
  unmapped_headers text[] not null default '{}',
  upload_batch_id uuid not null default gen_random_uuid(),
  source_filename text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 minutes')
);

create index if not exists employee_upload_stagings_org_idx
  on employee_upload_stagings (organization_id);
create index if not exists employee_upload_stagings_expires_idx
  on employee_upload_stagings (expires_at);

alter table employee_upload_stagings enable row level security;

-- Only org owners/admins can read or write their own staging rows.
create policy stagings_admin_rw on employee_upload_stagings
  for all
  using (is_org_admin(organization_id))
  with check (is_org_admin(organization_id));
