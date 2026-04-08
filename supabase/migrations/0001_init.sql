-- OrgChart initial schema
-- Multi-tenant SaaS: Supabase Auth users belong to one or more organizations.
-- All tenant data is scoped by organization_id and protected by RLS.

create extension if not exists vector;
create extension if not exists pgcrypto;

-- ============================================================================
-- TENANT ROOT
-- ============================================================================
create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  website_url text,
  logo_url text,
  primary_color text not null default '#0f172a',
  secondary_color text not null default '#64748b',
  accent_color text not null default '#3b82f6',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index organizations_slug_idx on organizations(slug);

-- ============================================================================
-- MEMBERSHIPS (auth users ↔ orgs)
-- ============================================================================
create table memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  organization_id uuid not null references organizations on delete cascade,
  role text not null check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  unique (user_id, organization_id)
);

create index memberships_user_idx on memberships(user_id);
create index memberships_org_idx on memberships(organization_id);

-- ============================================================================
-- EMPLOYEES (the org chart nodes — not necessarily auth users)
-- ============================================================================
create table employees (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations on delete cascade,
  first_name text not null,
  last_name text not null,
  email text not null,
  position text,
  supervisor_email text,
  context text,
  headshot_url text,
  slack_user_id text,
  claimed_by_user_id uuid references auth.users on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, lower(email))
);

create index employees_org_idx on employees(organization_id);
create index employees_supervisor_idx on employees(organization_id, lower(supervisor_email));
create index employees_claimed_idx on employees(claimed_by_user_id);

-- ============================================================================
-- EMBEDDINGS (RAG: "who handles X?")
-- ============================================================================
create table employee_embeddings (
  employee_id uuid primary key references employees on delete cascade,
  organization_id uuid not null references organizations on delete cascade,
  embedding vector(1536) not null,
  source_text text not null,
  updated_at timestamptz not null default now()
);

create index employee_embeddings_org_idx on employee_embeddings(organization_id);
create index employee_embeddings_vec_idx on employee_embeddings
  using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- ============================================================================
-- PROFILE CLAIMS (email magic-link to claim an employee record)
-- ============================================================================
create table profile_claims (
  token text primary key,
  organization_id uuid not null references organizations on delete cascade,
  employee_id uuid not null references employees on delete cascade,
  email text not null,
  expires_at timestamptz not null,
  claimed_at timestamptz,
  created_at timestamptz not null default now()
);

create index profile_claims_email_idx on profile_claims(email);
create index profile_claims_org_idx on profile_claims(organization_id);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
alter table organizations enable row level security;
alter table memberships enable row level security;
alter table employees enable row level security;
alter table employee_embeddings enable row level security;
alter table profile_claims enable row level security;

-- Helper: which orgs is the current user a member of?
create or replace function public.user_org_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select organization_id from memberships where user_id = auth.uid()
$$;

-- Helper: is the current user an owner/admin of this org?
create or replace function public.is_org_admin(org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from memberships
    where user_id = auth.uid()
      and organization_id = org_id
      and role in ('owner', 'admin')
  )
$$;

-- ----------------------------------------------------------------------------
-- organizations: members can read; owners/admins can update
-- ----------------------------------------------------------------------------
create policy orgs_read on organizations
  for select
  using (id in (select user_org_ids()));

create policy orgs_update on organizations
  for update
  using (is_org_admin(id))
  with check (is_org_admin(id));

-- Insert: any authenticated user can create an org (they become owner via app code)
create policy orgs_insert on organizations
  for insert
  to authenticated
  with check (true);

-- ----------------------------------------------------------------------------
-- memberships: users can read their own; admins can read all in their orgs
-- ----------------------------------------------------------------------------
create policy memberships_read_own on memberships
  for select
  using (user_id = auth.uid() or is_org_admin(organization_id));

create policy memberships_insert_self on memberships
  for insert
  to authenticated
  with check (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- employees: members can read; admins can write
-- ----------------------------------------------------------------------------
create policy employees_read on employees
  for select
  using (organization_id in (select user_org_ids()));

create policy employees_admin_write on employees
  for all
  using (is_org_admin(organization_id))
  with check (is_org_admin(organization_id));

-- Allow a claimed user to update their own employee row
create policy employees_self_update on employees
  for update
  using (claimed_by_user_id = auth.uid())
  with check (claimed_by_user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- employee_embeddings: members can read (for chat); admins can write
-- ----------------------------------------------------------------------------
create policy embeddings_read on employee_embeddings
  for select
  using (organization_id in (select user_org_ids()));

create policy embeddings_admin_write on employee_embeddings
  for all
  using (is_org_admin(organization_id))
  with check (is_org_admin(organization_id));

-- ----------------------------------------------------------------------------
-- profile_claims: only readable by service role (server-side validates tokens)
-- No client policies = no client access. Server uses service role key.
-- ----------------------------------------------------------------------------
-- (Intentionally no policies — service-role-only access)

-- ============================================================================
-- VECTOR SEARCH RPC
-- ============================================================================
create or replace function public.match_employees(
  query_embedding vector(1536),
  org_id uuid,
  match_count int default 8
)
returns table (
  employee_id uuid,
  similarity float
)
language sql
stable
security definer
set search_path = public
as $$
  select
    e.employee_id,
    1 - (e.embedding <=> query_embedding) as similarity
  from employee_embeddings e
  where e.organization_id = org_id
    and e.organization_id in (select user_org_ids())
  order by e.embedding <=> query_embedding
  limit match_count
$$;

-- ============================================================================
-- TRIGGERS
-- ============================================================================
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger organizations_touch_updated before update on organizations
  for each row execute function touch_updated_at();
create trigger employees_touch_updated before update on employees
  for each row execute function touch_updated_at();
