# Grammar Garden

The learner roadmap lives at `/app/grammar`. The owner approved publishing
the supplied V5 self-review content on 29 October 2026. The release decision,
scope and source ZIP checksum are recorded in
`src/data/grammar/release-approval.json`. The source ZIP's original approval
flags remain historical metadata and are not treated as the release decision.

## Content

`scripts/import-grammar-v5.py <V5.zip>` deterministically generates the files
in `src/data/grammar/`. It imports 180 lesson guides and 5,400 V5 self-review
items. It deliberately excludes the V3 archive and the disabled placement
pilot. The original ZIP is not needed at runtime.

The imported items have no objective answer key. Learners can read theory, write responses, reveal the reference,
mark an item understood or needing review, resume, and track practice. The
chapter and mastery tests remain unavailable. Practice counts never represent
an automatically graded score, XP, or a mastery unlock.

## Saved progress

Demo mode saves on the current device. Live mode syncs to
`public.grammar_study_progress` with learner-only row level security. Apply
`supabase/migrations/202610290002_grammar_study_progress.sql` to the
development project (`bhactqaxcvusmpeooxwi`) and validate account sync before
applying it to production (`vpkhriywprepuhrbarye`). The UI also keeps a local
device copy to preserve work during network failures.

## Checks

Run `npm run typecheck`, `npx vitest run tests/grammar-garden.test.ts`, and
`npm run build`. The V5 archive's `tools/verify_bundle.py` checks structure,
not linguistic accuracy; independent educational review is still required.
