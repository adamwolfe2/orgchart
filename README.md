# OrgChart

A multi-tenant SaaS where companies upload a CSV of employees and get a hosted, searchable org chart with RAG ("who handles X?"). Built for teams that want a single source of truth for who does what without standing up an HRIS.

## Tech stack

- Next.js 15 (App Router) + React 19
- TypeScript
- Tailwind CSS v4 (CSS-first config)
- Supabase (Postgres, Auth, RLS)
- OpenAI (embeddings + chat for RAG)
- Resend (transactional email)
- Firecrawl (Phase 2 brand scrape)

## Setup

1. Install dependencies:
   ```sh
   pnpm install
   ```

2. Create a Supabase project at https://supabase.com.

3. Copy the example env file and fill in your keys:
   ```sh
   cp .env.example .env.local
   ```

4. Run the database migration. Open your Supabase project's SQL editor and paste the contents of `supabase/migrations/0001_init.sql`, then run it.

5. (Optional) Add Resend, Firecrawl, and OpenAI keys to `.env.local` for email, brand scraping, and RAG features.

6. Start the dev server:
   ```sh
   pnpm dev
   ```

## Supabase Auth

- Enable Email auth in the Supabase dashboard under Authentication > Providers.
- For local development, set the Site URL to `http://localhost:3000` and add it to the redirect allow-list.
- The app uses magic-link sign-in (no passwords).

## Phasing

- **Phase 1 (MVP):** CSV upload, hosted org chart, employee detail modals.
- **Phase 2:** Brand scrape via Firecrawl, profile claim flow, per-tenant theming.
- **Phase 3:** RAG chat over employee context ("who handles billing?").
- **Phase 4:** Slack agent that answers org questions in-channel.
