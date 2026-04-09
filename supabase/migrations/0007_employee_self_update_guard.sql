-- Restrict which columns a self-claimed employee can update.
-- The employees_self_update RLS policy allows ANY column update as long
-- as claimed_by_user_id = auth.uid(). This trigger enforces that non-admin
-- users (using the self-update policy) cannot modify protected columns.

create or replace function public.enforce_employee_self_update()
returns trigger
language plpgsql
as $$
begin
  -- Only enforce for non-admin users editing via the self-update policy.
  -- Admins (who go through the employees_admin_write policy) and the
  -- service-role client (which bypasses RLS entirely) are unaffected.
  if old.claimed_by_user_id = auth.uid()
     and not is_org_admin(old.organization_id)
  then
    if new.organization_id is distinct from old.organization_id
       or new.email is distinct from old.email
       or new.first_name is distinct from old.first_name
       or new.last_name is distinct from old.last_name
       or new.supervisor_email is distinct from old.supervisor_email
       or new.claimed_by_user_id is distinct from old.claimed_by_user_id
       or new.upload_batch_id is distinct from old.upload_batch_id
    then
      raise exception 'self-update: protected field modification not allowed';
    end if;
  end if;
  return new;
end $$;

create trigger employees_self_update_guard
  before update on employees
  for each row execute function enforce_employee_self_update();
