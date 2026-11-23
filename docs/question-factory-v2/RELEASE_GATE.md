# Release gate — production activation

| Gate | Result | Evidence |
| --- | --- | --- |
| Source implementation for 14 forms | PASS | Versioned code, per-type validation and 42 authored fixture examples. |
| No migration; legacy API and publish RPC | PASS | V2 is feature gated and maps to legacy question payload. |
| At most two calls per V2 invocation | PASS (offline) | Mocked third-call rejection and two-call end-to-end test. |
| Independent answer-stripped QA | PASS (offline) | Payload and mismatch/coverage tests. |
| Local typecheck and lint | PASS | Final logs show exit 0; lint has six unrelated warnings. |
| Local full tests | PASS with bounded workers | 708 passed, 12 skipped; two unbounded runs timed out in unrelated modules. |
| Final build | PASS | `EVIDENCE/build-verified.log`, exit 0. |
| Hosted CI | NOT RUN | No push/PR. |
| Real Gemini Free Tier response quality | NOT RUN | No authenticated production test or real API call from this checkout. |
| Production data and learner evidence ACL | NOT RUN / BLOCKED | See BLOCKERS.md. |

The owner requested activation after the initial code deployment. V2 now activates in Vercel production if the existing confirmed Free Tier configuration is present. A missing key or confirmation fails before any Gemini request; `NEWS_QUESTION_FACTORY_V2_PUBLISH_ENABLED=false` disables V2 publication. The privacy and durable-budget limitations remain in `BLOCKERS.md`; no real Gemini response or learner difficulty has been verified by these offline tests.
