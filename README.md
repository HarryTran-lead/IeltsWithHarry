# English Skill Lab

Responsive English-learning **demo MVP** inspired by the supplied dashboard reference. Built with Next.js App Router, React, strict TypeScript, Tailwind CSS, shadcn/ui, Lucide icons and custom CSS design tokens.

## Run locally

Requirements: Node.js 20.9 or newer and npm.

```bash
npm install
npm run dev
```

Open `http://localhost:3000/app/dashboard`. No account or environment keys are needed for the demo. To verify a production build:

```bash
npm run typecheck
npm run lint
npm run build
npm run start
```

## What works in this demo

- Responsive dashboard with original Mochi illustration, seven learning milestones, activity links, planner preview, badges and task-based daily goal.
- Planner task creation, editing, deletion, completion, search, filters and manual drag sorting.
- Original sample activities: vocabulary flashcards, Present Simple question, Reading passage and grading, browser-generated Listening narration and question, Writing draft, Speaking recording and playback.
- Exercise attempts, planner tasks, goal and writing draft persist in browser `localStorage` under `english-skill-lab-demo-v1`.
- Submitting a linked Reading or Listening exercise marks its associated task complete and updates demo progress.
- Public course/about information and clear account/admin unavailable states.

All streaks, initial XP, initial milestones and seeded tasks are **sample data**. Added XP and progress are calculated from local demo activity. The seven stages are guidance, not official IELTS score certifications. Listening uses the browser's speech synthesis, so voice support varies by browser. Speaking audio can be downloaded during the session but is not uploaded or retained after the page closes.

## Structure

See [docs/STRUCTURE.md](docs/STRUCTURE.md) for the feature map and implementation phases.

## Configuration and future production backend

Copy `.env.example` to `.env.local` when integration work begins. The current build deliberately does **not** use the listed Supabase or R2 keys. There is no account persistence, Row Level Security policy, admin CRUD or private upload path in this demo. Do not set `NEXT_PUBLIC_DEMO_MODE=false` expecting a production backend: that mode has not been implemented.

Production integration plan:

1. Add Supabase migrations for profiles, curriculum, attempts, planner tasks and writing drafts.
2. Add Supabase Auth and RLS policies that scope learner records to `auth.uid()`.
3. Replace browser-local demo services with server-side validated services and Zod schemas.
4. Add an authenticated admin CMS with role checks enforced on the server.
5. Add Cloudflare R2 signed upload/download URLs for learner audio and media.
6. Add curriculum imports, meaningful automated tests and deployment environment checks.

There are no migrations or seed SQL yet because this trial does not create a database. Demo seed content is in `src/lib/demo-data.ts`.

## Deploy to Vercel

After signing in with the Vercel CLI:

```bash
npx vercel link
npx vercel deploy
npx vercel deploy --prod
```

Vercel detects the Next.js project. This demo needs no environment variables. The production backend phase will require server-side Vercel environment variables and Supabase/R2 setup before enabling accounts. `.env*`, `.vercel` and build output are ignored by Git; `.env.example` remains tracked.

## Known limits

- Demo data belongs to one browser only and can be cleared by clearing browser storage.
- A complete curriculum from 1.0 to 7.0+, spaced repetition, timed exam mode, scoring rubrics and analytics are still planned.
- Authentication, admin publishing, server persistence, AI feedback and notification delivery are unavailable.
- Browser speech synthesis does not provide a seekable recorded Listening asset.
