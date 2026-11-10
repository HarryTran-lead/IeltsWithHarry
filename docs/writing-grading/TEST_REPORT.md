# Writing grading test report — 2026-11-10

- Baseline commit: `8c4b848e`; implementation branch: `codex/writing-auto-grading`.
- Environment: Windows development checkout, Next.js 16.4.3, Node.js; local GTX 1650 Ti Max-Q (4 GB VRAM). No Ollama executable, model weights or approved grading artifact installed.
- Fixtures: original synthetic prompt/essay strings in `tests/writing-grading.test.ts` and synthetic evaluation labels in `tests/writing-evaluation.test.ts`; no copyrighted exam dataset used.
- Final `npm test`: 88 files passed, 2 skipped; 385 tests passed, 3 skipped. Focused migration/contract/evaluation run: 3 files, 8 tests passed.
- `npm run typecheck`: passed.
- Focused ESLint over changed TypeScript files: passed.
- `npm run build`: passed; new Writing API routes included in route output.
- Database integration: PGlite applied the additive migration, checked student ownership/RLS, unauthorized claim denial, single lease claim, invalid fencing token rejection, atomic result insert, result immutability and model/dataset approval constraints.
- Local model boundary: mocked Ollama response validates schema and enforces loopback URL. This is a **mock contract test**, not live scoring.
- Offline evaluation: tested on synthetic labels only to verify arithmetic and missing-task behavior; no real agreement metric is reported.
- Real Task 1 inference: **blocked** (no approved model; no verified production chart facts or evaluation).
- Real Task 2 inference: **blocked** (no approved local model or independent teacher evaluation).
- Authenticated browser E2E: **not run**; development migration and test accounts have not been used in this branch.
- Band-agreement sample size/accuracy: **none measured**. No percent accuracy is claimed.
- Fixes during testing: the initial PGlite fixture lacked an `anon` role; it now mirrors the migration's required roles. A mock transport assertion initially compared raw JSON escape sequences with decoded essay text; it now parses the payload. Both final focused suites pass.
- Rollout recommendation: **off**. Keep `WRITING_AUTOGRADING_ENABLED=false` until model rights, staging E2E, teacher scoring agreement, privacy and capacity gates pass.
