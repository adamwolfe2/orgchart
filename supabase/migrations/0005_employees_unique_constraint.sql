-- Replace the functional unique index on employees(organization_id, lower(email))
-- with a plain unique CONSTRAINT on (organization_id, email).
--
-- Why: PostgREST's upsert builder infers ON CONFLICT targets from named
-- columns only. A functional index on lower(email) cannot be matched by
-- .upsert({ onConflict: 'organization_id,email' }) and the database
-- returns "no unique or exclusion constraint matching the ON CONFLICT
-- specification" — which broke the commit endpoint in production.
--
-- Safe because the csvRowSchema.email field already applies .toLowerCase()
-- before any row reaches the database, so the functional lower() wrapper
-- was always redundant. Defensive update first in case any rows sneaked
-- in with mixed case.

update employees set email = lower(email) where email <> lower(email);

drop index if exists employees_org_email_key;

alter table employees
  add constraint employees_org_email_key unique (organization_id, email);
