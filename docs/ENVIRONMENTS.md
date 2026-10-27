# Development and production environments

| Purpose | Git branch | Vercel | Supabase |
| --- | --- | --- | --- |
| Learners | `main` | Production, `ieltswithharry.vercel.app` | `vpkhriywprepuhrbarye` |
| Development/testing | `develop` | Preview deployment for `develop` | A separate development project (pending capacity) |

The `develop` Preview currently runs in **demo mode** while a separate Supabase project is being provisioned. Do not put production Supabase credentials into Preview or local development. The build checks in `next.config.ts` reject a Preview that points at the production database and reject a Production build that points elsewhere.

## Normal release path

1. Create a feature branch from `develop`. Open a pull request back to `develop`. The existing `Quality` GitHub Action runs typecheck, lint, tests and build on pushes and pull requests.
2. Merge into `develop` and test its Vercel Preview with test accounts and test content. Apply new migrations to the development Supabase project first.
3. When the change is ready, open a pull request from `develop` to `main`. Review the diff and migration plan. Apply migrations to production before deploying code that depends on them.
4. Merge into `main` to deploy Production. Verify the Vercel deployment and the affected learner/admin flows. Never reset or seed a production database.

Changes made directly in the Vercel Preview do not promote database records to production. Transfer reviewed content through the app's import workflow or a deliberate migration. Do not copy learner accounts, chat, progress or other personal data into development.

## Provision the development backend

1. Create a second Supabase project in the same or a nearby region. The account currently has no free project slot; paused projects do not count toward the limit. Do not substitute the production project.
2. Link the **development checkout** to the new project with `supabase link --project-ref DEV_REF`; check the ref before every database command. Apply the migrations from `supabase/migrations/` to that project, then add safe test content. Never run `supabase db reset --linked` against production.
3. Set the development project's Auth Site URL to the stable `develop` Preview URL and allow its `/auth/callback` and password reset callback. Add `http://localhost:3000/auth/callback` for local testing. Configure email delivery separately if testing real registration.
4. In Vercel, add branch-scoped **Preview** variables for Git branch `develop`: `NEXT_PUBLIC_DEMO_MODE=false`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and server-only `SUPABASE_SERVICE_ROLE_KEY`. Use values from the development Supabase project only. Keep the production variables scoped to **Production**. Redeploy `develop` after changing `NEXT_PUBLIC_*` variables because Next.js inlines them at build time.
5. Configure dev-only `NEWS_SYNC_SECRET` and `IELTS_SYNC_SECRET` if testing scheduled workers. Point Supabase Vault URLs at the development Preview and keep its cron jobs disabled until those endpoints and secrets are verified. Do not reuse production API keys or enable paid AI jobs by default.
6. For local live development, put the development URL and keys in the ignored `.env.development.local` file in the `develop` checkout and set `NEXT_PUBLIC_DEMO_MODE=false`. Do not commit any `.env*` file.

Vercel automatically builds `main` as Production and other branches as Preview when its Git integration is connected. The existing `.github/workflows/quality.yml` runs checks for both branches. See [Vercel Git deployments](https://vercel.com/docs/git), [branch-specific environment variables](https://vercel.com/docs/environment-variables), and [Supabase environment management](https://supabase.com/docs/guides/deployment/managing-environments).
