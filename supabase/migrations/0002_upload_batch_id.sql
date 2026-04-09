-- Add upload_batch_id to employees so future admin UIs can offer
-- "Revert last upload" by deleting all rows tagged with a single batch.
-- Nullable to keep existing rows untouched.
alter table employees
  add column if not exists upload_batch_id uuid;

create index if not exists employees_upload_batch_idx
  on employees (organization_id, upload_batch_id);
