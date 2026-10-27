# Development and production environments

| Purpose | Git branch | Vercel | Supabase |
| --- | --- | --- | --- |
| Learners | `main` | Production, `ieltswithharry.vercel.app` | `vpkhriywprepuhrbarye` |
| Development/testing | `develop` | [Preview for `develop`](https://ieltswithharry-git-develop-harrytran-leads-projects.vercel.app) | `bhactqaxcvusmpeooxwi` (`IeltsWithHarry-Development`) |

The `develop` Preview runs against its own Supabase project with demo mode off. Do not put production Supabase credentials into Preview or local development. The build checks in `next.config.ts` reject a Preview that points at the production database and reject a Production build that points elsewhere. The development project's scheduled sync jobs are disabled; development data does not update automatically until dev-only worker secrets and schedules are configured.

## Normal release path

1. Create a feature branch from `develop`. Open a pull request back to `develop`. The existing `Quality` GitHub Action runs typecheck, lint, tests and build on pushes and pull requests.
2. Merge into `develop` and test its Vercel Preview with test accounts and test content. Apply new migrations to the development Supabase project first.
3. When the change is ready, open a pull request from `develop` to `main`. Review the diff and migration plan. Apply migrations to production before deploying code that depends on them.
4. Merge into `main` to deploy Production. Verify the Vercel deployment and the affected learner/admin flows. Never reset or seed a production database.

Changes made directly in the Vercel Preview do not promote database records to production. Transfer reviewed content through the app's import workflow or a deliberate migration. Do not copy learner accounts, chat, progress or other personal data into development.

## Development backend setup (completed on 27 October 2026)

1. `lego-shop` was paused, with the user's permission, to free a Supabase free-tier slot. Resume it only after another slot becomes available; pausing does not delete its data.
2. A new Supabase project `IeltsWithHarry-Development` was created and all migrations were applied. The `develop` checkout is linked to it. Check the project ref before every database command. Never run `supabase db reset --linked` against production.
3. Auth Site URL and callback allowlist point to the stable `develop` Preview, with localhost callbacks for local testing. Configure email delivery separately if testing real registration.
4. Vercel has branch-scoped **Preview** variables for `develop`: `NEXT_PUBLIC_DEMO_MODE=false`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and server-only `SUPABASE_SERVICE_ROLE_KEY`. Production variables remain scoped to Production. Redeploy `develop` after changing `NEXT_PUBLIC_*` variables because Next.js inlines them at build time.
5. The development project's cron jobs were disabled. Configure dev-only `NEWS_SYNC_SECRET` and `IELTS_SYNC_SECRET` only if testing scheduled workers. Point Supabase Vault URLs at the development Preview and verify endpoints before enabling schedules. Do not reuse production API keys or enable paid AI jobs by default.
6. For local live development, put the development URL and keys in the ignored `.env.development.local` file in the `develop` checkout and set `NEXT_PUBLIC_DEMO_MODE=false`. Do not commit any `.env*` file.

The optional catalog bootstrap is for an **empty dev project with no users**. Run `pwsh -NoProfile -File scripts/bootstrap-dev-catalog.ps1 -TargetRef bhactqaxcvusmpeooxwi` from the `develop` checkout. It replaces only authored courses, lessons, exercise answers, and the vocabulary library. It deliberately excludes learner accounts, saved words, progress, chat, administrator records and the news archive. The script refuses to run if any user has signed up on dev. Re-run only while the dev project is disposable, since it replaces its existing catalog.

Vercel automatically builds `main` as Production and other branches as Preview when its Git integration is connected. The existing `.github/workflows/quality.yml` runs checks for both branches. See [Vercel Git deployments](https://vercel.com/docs/git), [branch-specific environment variables](https://vercel.com/docs/environment-variables), and [Supabase environment management](https://supabase.com/docs/guides/deployment/managing-environments).
