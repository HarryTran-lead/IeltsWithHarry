# English Skill Lab

An English learning web app built with Next.js 16, React 19, TypeScript, Tailwind CSS and Supabase. It includes a responsive dashboard, study planner, six sample skill activities and a small curriculum editor.

## Project layout

```text
src/app/                 App Router pages, auth callback, protected student/admin routes
src/components/          Shared layout, UI and original SVG illustrations
src/features/auth/       Sign in, registration and password reset
src/features/dashboard/  Learner dashboard
src/features/planner/    Task list, filters and task form
src/features/learning/   Sample activities and database-backed lesson reader
src/features/admin/      Curriculum editor
src/features/notebook/   Floating quick notebook and learning timeline
src/features/demo/       Shared learner store with explicit demo/live adapters
src/lib/supabase/        Browser and server clients
src/lib/validation/      Input schemas
supabase/migrations/     PostgreSQL schema, RLS and server-side grading
supabase/seed.sql        Original starter content (no sample learner progress)
tests/                  Unit tests
docs/                   Architecture and rollout notes
```

See [docs/STRUCTURE.md](docs/STRUCTURE.md) for data flows and security boundaries.
See [docs/AUTHORED_CONTENT.md](docs/AUTHORED_CONTENT.md) for the no-AI, content-driven skill plan and the interactive `/app/content-lab` JSON demo.

## Run locally in demo mode

Use Node.js 20.9+ and npm. Copy `.env.example` to `.env.local` and leave `NEXT_PUBLIC_DEMO_MODE=true`.

```bash
npm ci
npm run dev
```

Open `http://localhost:3000`. Visitors start on the public Guest homepage and can browse the published course catalog. On `/login`, choose the student or admin demo role. The student area is under `/app`; the separate admin area is under `/admin`. Guest requests to either private area redirect to `/login`, and a student cannot open the admin editor. The demo role is only a preview switch, not a real account or security credential. Demo tasks, attempts, goal, Writing draft and authored content stay in this browser's localStorage. Seeded tasks, XP, streaks and stages are clearly sample data.

In admin demo, edit the JSON curriculum pack, validate it, save a draft and publish it. Switch to the student demo role in the same browser to see the published pack in `/app/content-lab`. Live admin uses the Supabase CMS and database permissions instead of this browser storage.

The floating **Sổ tay** button opens quick note and vocabulary capture on learning pages. `/app/notebook` lets learners search, edit, delete and export saved entries, and review learning-page visits plus submitted practice. Demo notebook data stays in localStorage on this browser. On a configured live account, entries and visits use the second Supabase migration and user-scoped RLS.

## Connected Supabase project

The production project is `vpkhriywprepuhrbarye` (`https://vpkhriywprepuhrbarye.supabase.co`). All three migrations and `supabase/seed.sql` were applied on 24 October 2026. Auth site/redirect URLs are tracked in `supabase/config.toml`; 15 public tables have RLS enabled. The Vercel production project has the public Supabase URL and publishable key. Keep secrets out of Git.

The Supabase built-in email sender is restricted to project organization members and has a low rate limit. The registration and recovery screens disclose this while `NEXT_PUBLIC_EMAIL_DELIVERY_READY` is unset. Configure custom SMTP in Supabase Authentication, verify delivery to an ordinary address, set `NEXT_PUBLIC_EMAIL_DELIVERY_READY=true` in Vercel and redeploy before inviting the public. Google OAuth and phone/SMS still need their respective providers and remain hidden in the UI. Once the designated owner registers and confirms their account, add its `auth.users.id` to `public.admin_users` as described below.

## Enable real accounts and persistence

1. Create a Supabase project. In **Authentication → URL Configuration**, set the Site URL to your production domain and allow redirects for `http://localhost:3000/auth/callback`, `http://localhost:3000/auth/callback?next=/reset-password`, `https://english-skill-lab-ruby.vercel.app/auth/callback` and `https://english-skill-lab-ruby.vercel.app/auth/callback?next=/reset-password`. Configure email confirmation and custom SMTP for production delivery. The connected project already has these URLs configured.
2. Run `supabase/migrations/202610240001_foundation.sql`, `202610240002_notebook.sql` and `202610240003_google_profile.sql` in order in the Supabase SQL editor, then run `supabase/seed.sql`. Or use the Supabase CLI migration workflow after linking the project. **Do not run a linked database reset on a project containing user data.**
3. Set the following in `.env.local`:

```dotenv
NEXT_PUBLIC_DEMO_MODE=false
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
NEXT_PUBLIC_ENABLE_GOOGLE_AUTH=false
NEXT_PUBLIC_ENABLE_PHONE_AUTH=false
```

4. Restart `npm run dev`. Register and confirm an email account. `/app/*` now requires authentication; planner tasks, attempts, daily goal and Writing draft persist in Supabase under the signed-in user.

### Google sign-in

Create a Google Cloud OAuth web client. In Google Cloud, add the local and production origins, and add the **Supabase Google provider callback URL** as the authorized redirect URI. Put the Google client ID and secret in **Supabase Authentication → Providers → Google**, not in this repository or Vercel. Add the app callback URL to Supabase's redirect allow list, then set `NEXT_PUBLIC_ENABLE_GOOGLE_AUTH=true` locally and in Vercel. The app sends Google users through `/auth/callback` and routes them by their database role. See the [Supabase Google setup guide](https://supabase.com/docs/guides/auth/social-sign-in/auth-google).

### Phone number and password

Enable the Phone provider in Supabase and configure an SMS provider plus phone confirmation. After SMS delivery and OTP verification work, set `NEXT_PUBLIC_ENABLE_PHONE_AUTH=true` locally and in Vercel. Users enter E.164 numbers such as `+84901234567`; signup sends a verification code, and password recovery uses a new SMS code. Configure SMS limits and abuse protection before opening public signup. See [Supabase phone/password setup](https://supabase.com/docs/guides/auth/passwords#with-phone). Phone account recovery depends on control of the number; for a public release, add MFA for stronger protection.

Both provider flags control whether the corresponding option appears in the form. They do not enable providers in Supabase. Redeploy after changing `NEXT_PUBLIC_*` variables. Test a new email account, a Google account, a phone account and an admin account in the connected production project before announcing those options as available.

Never put a Supabase secret/service-role key in a `NEXT_PUBLIC_` variable or commit it. This MVP needs only the publishable key because Row Level Security and database functions enforce access.

### First admin

After the admin user registers, grant the role in the Supabase SQL editor as a project owner (replace the UUID with the account's ID from Authentication → Users):

```sql
insert into public.admin_users(user_id) values ('USER_UUID');
```

The `/admin` route checks the signed-in account on the server and uses `is_admin()` in the database. Only admins can change curriculum rows. Signed-in learners enter `/app`; admins enter `/admin`. Course, unit and lesson records can be drafted, renamed, published, unpublished and deleted. The lesson editor can add/edit/delete content blocks, questions and vocabulary entries; answer keys are saved in the same database transaction as questions. The published course catalog is visible at `/courses`; published lesson content and exercises load from the database at `/app/lesson/[slug]`.

## Security model

- Profiles, tasks, attempts, drafts, notebook entries and study visits use user-scoped RLS. Direct insert/update of scored attempts is not granted to learners.
- Answer keys live in a separate RLS-protected table and are never sent with published question queries. `submit_exercise` checks the authenticated user, grades against database keys, stores the attempt and completes linked tasks in one transaction.
- Admin membership is managed through SQL by the project owner; the browser cannot grant itself admin access.
- Auth pages use Supabase Auth. Student and admin pages recheck authentication server-side. Next.js Proxy refreshes auth cookies.
- Demo data never enters the production database. When no backend is configured and demo mode is off, the app shows a setup state instead of pretending to save.

## Quality checks

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

The tests cover task/date, goal, draft, notebook and answer input validation. A local PGlite test applies the PostgreSQL migrations and seed, then checks exercise grading, learner isolation (including notebook data), unpublished content and admin permissions. Public PostgREST reads and answer-key denial were checked against the connected Supabase project. Interactive registration, password recovery and admin role routing still need an account with a working email sender.

## Deploy on Vercel

Connect the public GitHub repository to a Vercel project. Configure `NEXT_PUBLIC_DEMO_MODE=true` for an interface preview, or configure the three live variables above after the Supabase migration, seed and auth redirects are ready. Redeploy after changing `NEXT_PUBLIC_*` variables because Next.js embeds them at build time. Do not copy local `.env.local` to Git or Vercel.

Production points to the connected Supabase project. Email/password screens are enabled, subject to the SMTP limitation above. Google OAuth and phone/password code paths are ready to configure but **not verified live**; the corresponding controls stay hidden until a Google OAuth client and SMS provider are connected and tested.

## Current scope and deferred work

Working: dashboard, planner CRUD and sorting, sample vocabulary/grammar/reading/listening/writing/speaking interactions, authored JSON Content Lab preview for all six skills, floating notebook for notes and vocabulary, learning visit/practice timeline, local demo persistence, auth integration, user-scoped cloud persistence, server-side exercise grading, published course/lesson reading and admin curriculum/block/question/vocabulary CRUD.

Deferred: full 1.0–7.0+ curriculum, admin draft preview, R2 media uploads and private speaking recordings, automated email reminders, AI feedback, production XP/streak awards and live Supabase integration tests. Browser narration is a sample Listening aid; a licensed recorded audio library is a later content task. Demo sample activities remain fixed authored content; published database lessons use the separate lesson reader.
