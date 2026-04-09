-- OrgChart PR A: profile fields + chat persistence + invites + headshot storage
--
-- This migration lands all the schema needed for:
--   PR B: /api/chat + ChatWidget (chat_messages table)
--   PR C: profile editing + headshots (new columns + storage bucket)
--   PR D: invite link flow (organization_invites table)
--
-- All new tables enable RLS with policies scoped via the existing
-- user_org_ids() and is_org_admin() helpers from 0001_init.sql.

-- =============================================================
-- Extend employees with richer profile fields
-- =============================================================
alter table employees
  add column if not exists linkedin_url text,
  add column if not exists phone text,
  add column if not exists custom_links jsonb not null default '[]'::jsonb;

-- Sanity check: custom_links must always be an array, not an object or scalar
alter table employees
  drop constraint if exists employees_custom_links_is_array;
alter table employees
  add constraint employees_custom_links_is_array
  check (jsonb_typeof(custom_links) = 'array');

-- Track when Firecrawl brand scrape last ran so we don't re-scrape on every
-- org update.
alter table organizations
  add column if not exists brand_scraped_at timestamptz;

-- =============================================================
-- chat_messages — persistence for the floating chat widget
-- =============================================================
create table if not exists chat_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  -- For assistant messages: which employees were retrieved via RAG.
  -- Stored as an array of { id, first_name, last_name, position, email, headshot_url }
  sources jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists chat_messages_org_user_idx
  on chat_messages (organization_id, user_id, created_at desc);

create index if not exists chat_messages_rate_limit_idx
  on chat_messages (user_id, role, created_at desc);

alter table chat_messages enable row level security;

-- Read: any member of the org can read their OWN chat history
-- (not other users' chats, even within the same org — chats are personal).
create policy chat_read_own on chat_messages
  for select
  using (
    organization_id in (select user_org_ids())
    and user_id = auth.uid()
  );

-- Write: only the authenticated user can insert their own user messages.
-- Assistant messages are written by the service-role client from the
-- /api/chat route, which bypasses RLS, so no policy needed there.
create policy chat_insert_own on chat_messages
  for insert
  to authenticated
  with check (
    organization_id in (select user_org_ids())
    and user_id = auth.uid()
  );

-- =============================================================
-- organization_invites — admin-generated join links
-- =============================================================
create table if not exists organization_invites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations on delete cascade,
  token text unique not null,
  created_by uuid references auth.users on delete set null,
  -- nullable max_uses = unlimited
  max_uses integer,
  used_count integer not null default 0,
  -- nullable expires_at = no expiration
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint max_uses_positive check (max_uses is null or max_uses > 0),
  constraint used_count_nonneg check (used_count >= 0)
);

create index if not exists organization_invites_org_idx
  on organization_invites (organization_id);
create index if not exists organization_invites_token_idx
  on organization_invites (token);

alter table organization_invites enable row level security;

-- Only org owners/admins can manage invites for their org.
create policy invites_admin_rw on organization_invites
  for all
  using (is_org_admin(organization_id))
  with check (is_org_admin(organization_id));

-- Token validation happens server-side via the service-role client
-- (see /api/org/invites/accept), so no public select policy. The
-- admin client bypasses RLS entirely.

-- =============================================================
-- headshots storage bucket
-- =============================================================
-- Public read (headshots are displayed on the org chart to all members)
-- but upload gated by RLS on storage.objects.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'headshots',
  'headshots',
  true,
  2097152, -- 2 MiB
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Drop existing headshot policies if re-running the migration
drop policy if exists "Headshots are publicly readable" on storage.objects;
drop policy if exists "Admins can upload headshots for their org" on storage.objects;
drop policy if exists "Admins can update headshots for their org" on storage.objects;
drop policy if exists "Admins can delete headshots for their org" on storage.objects;

-- Public read: anyone can GET a headshot (they live on rendered org charts
-- which are themselves RLS-gated; a headshot URL is not sensitive).
create policy "Headshots are publicly readable" on storage.objects
  for select
  using (bucket_id = 'headshots');

-- Upload path pattern: {organization_id}/{employee_id}.{ext}
-- Only org owners/admins can upload headshots for employees in their org.
-- Self-claimed employees can update their own row but the headshot upload
-- happens via the same admin-gated path — keeps things simple for v1.
create policy "Admins can upload headshots for their org" on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'headshots'
    and (storage.foldername(name))[1]::uuid in (
      select organization_id from memberships
      where user_id = auth.uid() and role in ('owner', 'admin')
    )
  );

create policy "Admins can update headshots for their org" on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'headshots'
    and (storage.foldername(name))[1]::uuid in (
      select organization_id from memberships
      where user_id = auth.uid() and role in ('owner', 'admin')
    )
  );

create policy "Admins can delete headshots for their org" on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'headshots'
    and (storage.foldername(name))[1]::uuid in (
      select organization_id from memberships
      where user_id = auth.uid() and role in ('owner', 'admin')
    )
  );
