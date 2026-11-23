# Local test results

Environment: Windows PowerShell, Node/npm from the repository, Next.js 16.4.6, Vitest 5. No real Gemini or production database requests.

| Command | Result | Evidence |
| --- | --- | --- |
| `npm ci` | PASS | 679 packages installed. npm reported 13 dependency audit findings (1 low, 12 moderate); no forced dependency changes were made. |
| `npx vitest run tests/news-factory-v2.test.ts` | PASS: 82/82 | `EVIDENCE/v2-tests-final.log`. |
| `npm run typecheck` | PASS, exit 0 | `EVIDENCE/typecheck-final.log`. |
| `npm run lint` | PASS, exit 0, six existing warnings | `EVIDENCE/lint-final.log`; warnings in writing proxy and bank-library files, none in V2 changes. |
| Changed-file `npx eslint` | PASS, exit 0 | `EVIDENCE/changed-eslint.log`; full lint will be rerun on final code. |
| `npm test` initial parallel run | FAIL: 703 pass, 1 timeout in Book 2, 12 skip | Isolated Book 2 test passed 7/7 in 586 ms. |
| `npm test` sequential rerun | PASS: 704 pass, 12 skip | `EVIDENCE/full-test-rerun.log` (before last QA-field test). |
| `npm test` next run | FAIL: 704 pass, 1 timeout in Listening Lab, 12 skip | `EVIDENCE/full-test-final.log`; isolated Listening Lab test passed 6/6 in 668 ms. |
| `npx vitest run --maxWorkers=2` on final code | PASS: 708 pass, 12 skip | `EVIDENCE/full-test-final-bounded.log`. |
| `npm run build` | PASS, exit 0 on final code | `EVIDENCE/build-verified.log`; optimized compile, TypeScript and page generation completed. |
| Hosted GitHub CI | NOT RUN | No push/PR, production HOLD. |

Both timeout failures happened in existing modules outside V2 during highly parallel runs and passed immediately in isolation. They remain visible in the evidence. The bounded full-suite run is the acceptance result for this checkout. These tests cannot establish real model semantic accuracy or psychometric difficulty.
